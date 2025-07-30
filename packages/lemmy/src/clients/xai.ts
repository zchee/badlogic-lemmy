import type {
	ChatClient,
	AskResult,
	Message,
	UserMessage,
	AssistantMessage,
	AskInput,
	TokenUsage,
	ModelError,
	ToolCall,
	StopReason,
	AskOptions,
	StreamingCallbacks,
} from "../types.js";
import type { XAIConfig, XAIAskOptions } from "../configs.js";
import { zodToOpenAI } from "../tools/zod-converter.js";
import { calculateTokenCost, findModelData } from "../index.js";
import type { ToolDefinition } from "../types.js";

interface XAIChatCompletionMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string | null;
	tool_calls?: XAIToolCall[];
	tool_call_id?: string;
}

interface XAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

interface XAIChatCompletionCreateParams {
	model: string;
	messages: XAIChatCompletionMessage[];
	stream: boolean;
	stream_options?: { include_usage: boolean };
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
	presence_penalty?: number;
	frequency_penalty?: number;
	logprobs?: boolean;
	top_logprobs?: number;
	max_completion_tokens?: number;
	n?: number;
	parallel_tool_calls?: boolean;
	response_format?: { type: "text" | "json_object" };
	seed?: number;
	stop?: string;
	tools?: {
		type: "function";
		function: {
			name: string;
			description: string;
			parameters: Record<string, unknown>;
		};
	}[];
	tool_choice?: "none" | "auto" | "required";
	user?: string;
}

interface XAIChatCompletionChunk {
	id: string;
	object: "chat.completion.chunk";
	created: number;
	model: string;
	choices: {
		index: number;
		delta: {
			role?: "assistant";
			content?: string;
			tool_calls?: {
				index: number;
				id?: string;
				type?: "function";
				function?: {
					name?: string;
					arguments?: string;
				};
			}[];
		};
		finish_reason?: "stop" | "length" | "tool_calls" | "content_filter" | null;
	}[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export class XAIClient implements ChatClient<XAIAskOptions> {
	private config: XAIConfig;
	private baseURL: string;

	constructor(config: XAIConfig) {
		this.config = config;
		this.baseURL = config.baseURL || "https://api.x.ai";
	}

	getModel(): string {
		return this.config.model;
	}

	getProvider(): string {
		return "xai";
	}

	private buildXAIParams(
		options: AskOptions<XAIAskOptions> & StreamingCallbacks,
		messages: XAIChatCompletionMessage[],
	): XAIChatCompletionCreateParams {
		const params: XAIChatCompletionCreateParams = {
			model: this.config.model,
			stream: true,
			stream_options: { include_usage: true },
			messages,
		};

		const modelData = findModelData(this.config.model);
		params.max_tokens =
			options?.maxOutputTokens || this.config.defaults?.maxOutputTokens || modelData?.maxOutputTokens || 4096;

		if (options.temperature !== undefined) params.temperature = options.temperature;
		if (options.topP !== undefined) params.top_p = options.topP;
		if (options.presencePenalty !== undefined) params.presence_penalty = options.presencePenalty;
		if (options.frequencyPenalty !== undefined) params.frequency_penalty = options.frequencyPenalty;
		if (options.logprobs !== undefined) params.logprobs = options.logprobs;
		if (options.topLogprobs !== undefined) params.top_logprobs = options.topLogprobs;
		if (options.maxCompletionTokens !== undefined) params.max_completion_tokens = options.maxCompletionTokens;
		if (options.n !== undefined) params.n = options.n;
		if (options.parallelToolCalls !== undefined) params.parallel_tool_calls = options.parallelToolCalls;
		if (options.responseFormat !== undefined) {
			if (options.responseFormat === "text") {
				params.response_format = { type: "text" };
			} else if (options.responseFormat === "json_object") {
				params.response_format = { type: "json_object" };
			}
		}
		if (options.seed !== undefined) params.seed = options.seed;
		if (options.stop !== undefined) params.stop = options.stop;
		if (options.toolChoice !== undefined) params.tool_choice = options.toolChoice;
		if (options.user !== undefined) params.user = options.user;

		const tools = options?.context?.listTools() || [];
		const xaiTools = tools.map((tool: ToolDefinition) => zodToOpenAI(tool));
		if (xaiTools && xaiTools.length > 0) {
			params.tools = xaiTools;
			params.tool_choice = options.toolChoice || "auto";
		}

		return params;
	}

	async ask(input: string | AskInput, options?: AskOptions<XAIAskOptions> & StreamingCallbacks): Promise<AskResult> {
		const startTime = performance.now();
		try {
			// Check if request was already aborted
			if (options?.abortSignal?.aborted) {
				const modelError: ModelError = {
					type: "invalid_request",
					message: "Request was aborted",
					retryable: false,
				};
				return { type: "error", error: modelError };
			}

			// Convert input to AskInput format
			const userInput: AskInput = typeof input === "string" ? { content: input } : input;

			const userMessage: UserMessage = {
				role: "user",
				...(userInput.content !== undefined && {
					content: userInput.content,
				}),
				...(userInput.toolResults !== undefined && {
					toolResults: userInput.toolResults,
				}),
				...(userInput.attachments !== undefined && {
					attachments: userInput.attachments,
				}),
				timestamp: new Date(),
			};

			// Add user message to context
			if (options?.context) {
				options.context.addMessage(userMessage);
			}

			// Convert context messages to xAI format
			const messages = this.convertMessages(options?.context?.getMessages() || [userMessage]);
			const systemMessage = options?.context?.getSystemMessage();
			if (systemMessage) {
				messages.unshift({ role: "system", content: systemMessage });
			}

			// Build request parameters
			const mergedOptions = { ...this.config.defaults, ...options };
			const requestParams = this.buildXAIParams(mergedOptions, messages);

			// Check abort signal before making request
			if (options?.abortSignal?.aborted) {
				const modelError: ModelError = {
					type: "invalid_request",
					message: "Request was aborted",
					retryable: false,
				};
				return { type: "error", error: modelError };
			}

			// Execute streaming request with abort signal
			const response = await this.makeRequest(requestParams, options?.abortSignal);
			return await this.processStream(response, options, startTime);
		} catch (error) {
			return this.handleError(error);
		}
	}

	private async makeRequest(
		params: XAIChatCompletionCreateParams,
		abortSignal?: AbortSignal,
	): Promise<ReadableStream<Uint8Array>> {
		const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.config.apiKey}`,
			},
			body: JSON.stringify(params),
			signal: abortSignal || null,
		});

		if (!response.ok) {
			const errorData = await response.text();
			throw new Error(`xAI API error ${response.status}: ${errorData}`);
		}

		if (!response.body) {
			throw new Error("No response body from xAI API");
		}

		return response.body;
	}

	private convertMessages(contextMessages: readonly Message[]): XAIChatCompletionMessage[] {
		const messages: XAIChatCompletionMessage[] = [];

		// Add context messages
		for (const msg of contextMessages) {
			if (msg.role === "user") {
				// Handle tool results if present
				if (msg.toolResults && msg.toolResults.length > 0) {
					for (const toolResult of msg.toolResults) {
						messages.push({
							role: "tool",
							tool_call_id: toolResult.toolCallId,
							content: toolResult.content,
						});
					}
				}

				// Add user message with text content and attachments
				if (msg.content?.trim() || (msg.attachments && msg.attachments.length > 0)) {
					let content = msg.content || "";

					// Handle attachments - xAI likely supports similar format to OpenAI
					if (msg.attachments && msg.attachments.length > 0) {
						for (const attachment of msg.attachments) {
							if (attachment.type === "image") {
								// For now, add a note about the image since we'd need to implement multimodal support
								content += `\n[Image attachment: ${attachment.name || "image"}]`;
							}
						}
					}

					messages.push({
						role: "user",
						content: content.trim() || null,
					});
				}
			} else if (msg.role === "assistant") {
				// Handle assistant messages with potential tool calls
				if (msg.toolCalls && msg.toolCalls.length > 0) {
					// Create assistant message with tool calls
					const toolCalls: XAIToolCall[] = msg.toolCalls.map((toolCall: ToolCall) => ({
						id: toolCall.id,
						type: "function" as const,
						function: {
							name: toolCall.name,
							arguments: JSON.stringify(toolCall.arguments),
						},
					}));

					messages.push({
						role: "assistant",
						content: msg.content || null,
						tool_calls: toolCalls,
					});
				} else if (msg.content) {
					// Regular text-only assistant message
					messages.push({ role: "assistant", content: msg.content });
				}
			}
		}

		return messages;
	}

	private async processStream(
		stream: ReadableStream<Uint8Array>,
		options?: AskOptions<XAIAskOptions> & StreamingCallbacks,
		startTime?: number,
	): Promise<AskResult> {
		let content = "";
		let inputTokens = 0;
		let outputTokens = 0;
		let stopReason: string | undefined;
		let toolCalls: ToolCall[] = [];
		const currentToolCalls = new Map<number, { id?: string; name?: string; arguments?: string }>();

		const reader = stream.getReader();
		const decoder = new TextDecoder();

		try {
			while (true) {
				// Check abort signal during streaming
				if (options?.abortSignal?.aborted) {
					reader.releaseLock();
					const modelError: ModelError = {
						type: "invalid_request",
						message: "Request was aborted during streaming",
						retryable: false,
					};
					return { type: "error", error: modelError };
				}

				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				const lines = chunk.split("\n");

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6);
						if (data === "[DONE]") continue;

						try {
							const parsed: XAIChatCompletionChunk = JSON.parse(data);

							// Handle usage information (comes in final chunk)
							if (parsed.usage) {
								inputTokens = parsed.usage.prompt_tokens || 0;
								outputTokens = parsed.usage.completion_tokens || 0;
							}

							const choice = parsed.choices?.[0];
							if (!choice) continue;

							// Handle content deltas
							if (choice.delta?.content) {
								const contentChunk = choice.delta.content;
								content += contentChunk;
								options?.onChunk?.(contentChunk);
							}

							// Handle tool call deltas
							if (choice.delta?.tool_calls) {
								for (const toolCallDelta of choice.delta.tool_calls) {
									const index = toolCallDelta.index!;

									if (!currentToolCalls.has(index)) {
										currentToolCalls.set(index, {});
									}

									const currentToolCall = currentToolCalls.get(index)!;

									if (toolCallDelta.id) {
										currentToolCall.id = toolCallDelta.id;
									}

									if (toolCallDelta.function) {
										if (toolCallDelta.function.name) {
											currentToolCall.name = toolCallDelta.function.name;
										}

										if (toolCallDelta.function.arguments) {
											currentToolCall.arguments =
												(currentToolCall.arguments || "") + toolCallDelta.function.arguments;
										}
									}
								}
							}

							// Handle finish reason
							if (choice.finish_reason) {
								stopReason = choice.finish_reason;
							}
						} catch (error) {
							// Skip malformed JSON lines
							continue;
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		// Process completed tool calls
		for (const [_, toolCallData] of currentToolCalls) {
			if (toolCallData.id && toolCallData.name) {
				try {
					let argsString = toolCallData.arguments || "{}";
					// Handle empty arguments (tools with no parameters)
					if (argsString.trim() === "") {
						argsString = "{}";
					}
					const parsedArgs = JSON.parse(argsString);
					toolCalls.push({
						id: toolCallData.id,
						name: toolCallData.name,
						arguments: parsedArgs,
					});
				} catch (error) {
					// Invalid JSON in tool arguments - we'll handle this as an error
					console.error("Failed to parse tool arguments:", error);
				}
			}
		}

		// If no usage info from streaming, estimate tokens
		if (inputTokens === 0 && outputTokens === 0 && content) {
			// Rough token estimation as fallback - very approximate
			inputTokens = Math.ceil(content.length / 6); // Conservative input estimate
			outputTokens = Math.ceil(content.length / 4); // Output tokens from response
		}

		// Calculate tokens and cost
		const tokens: TokenUsage = {
			input: inputTokens,
			output: outputTokens,
		};

		const cost = calculateTokenCost(this.config.model, tokens);

		// Calculate duration in seconds
		const endTime = performance.now();
		const took = startTime ? (endTime - startTime) / 1000 : 0;

		// Create assistant message with whatever was returned
		const assistantMessage: AssistantMessage = {
			role: "assistant",
			...(content && { content }),
			...(toolCalls.length > 0 && { toolCalls }),
			usage: tokens,
			provider: this.getProvider(),
			model: this.getModel(),
			timestamp: new Date(),
			took,
		};

		// Add assistant message to context
		if (options?.context) {
			options.context.addMessage(assistantMessage);
		}

		// Return successful response with the message
		const response: AskResult = {
			type: "success",
			stopReason: this.mapStopReason(stopReason) || "complete",
			message: assistantMessage,
			tokens,
			cost,
		};

		return response;
	}

	private mapStopReason(reason: string | undefined): StopReason | undefined {
		switch (reason) {
			case "stop":
				return "complete";
			case "length":
				return "max_tokens";
			case "content_filter":
				return "stop_sequence";
			case "tool_calls":
				return "tool_call";
			default:
				return undefined;
		}
	}

	private handleError(error: unknown): AskResult {
		// Handle abort errors specifically
		if (error instanceof DOMException && error.name === "AbortError") {
			const modelError: ModelError = {
				type: "invalid_request",
				message: "Request was aborted",
				retryable: false,
			};
			return { type: "error", error: modelError };
		}

		// Handle fetch errors
		if (error instanceof TypeError && error.message.includes("fetch")) {
			const modelError: ModelError = {
				type: "network",
				message: "Network error connecting to xAI API",
				retryable: true,
			};
			return { type: "error", error: modelError };
		}

		// Convert various error types to ModelError
		if (error instanceof Error) {
			// Try to parse xAI API error format
			let status: number | undefined;
			let message = error.message;

			// Extract status code from error message if present
			const statusMatch = error.message.match(/xAI API error (\d+):/);
			if (statusMatch && statusMatch[1]) {
				status = parseInt(statusMatch[1], 10);
			}

			const modelError: ModelError = {
				type: this.getErrorType(status),
				message,
				retryable: this.isRetryable(status),
			};
			return { type: "error", error: modelError };
		}

		// Handle other error types
		const modelError: ModelError = {
			type: "api_error",
			message: error instanceof Error ? error.message : JSON.stringify(error),
			retryable: false,
		};
		return { type: "error", error: modelError };
	}

	private getErrorType(status?: number): ModelError["type"] {
		switch (status) {
			case 401:
				return "auth";
			case 429:
				return "rate_limit";
			case 400:
			case 404:
			case 422:
				return "invalid_request";
			default:
				return "api_error";
		}
	}

	private isRetryable(status?: number): boolean {
		return status === 429 || (status !== undefined && status >= 500);
	}
}
