import { findModelData, type ModelData } from "./model-registry.js";
import { validateAndExecute } from "./tools/index.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
	Message,
	TokenUsage,
	ToolCall,
	ToolDefinition,
	ToolError,
	ExecuteToolResult,
	SerializedContext,
	SerializedToolDefinition,
} from "./types.js";

/**
 * Deep comparison of JSON schemas, ignoring metadata and property order
 * Focuses on the structural definition of the schema
 */
function deepSchemaEquals(schema1: object, schema2: object): boolean {
	// Convert both schemas to normalized strings for comparison
	const normalize = (obj: any): any => {
		if (obj === null || typeof obj !== "object") {
			return obj;
		}

		if (Array.isArray(obj)) {
			return obj.map(normalize).sort();
		}

		// Additional safety check to ensure obj is a valid object
		if (typeof obj !== "object" || obj === null || obj === undefined) {
			return obj;
		}

		const normalized: Record<string, any> = {};
		const keys = Object.keys(obj)
			.filter(
				(key) =>
					// Filter out metadata keys that don't affect the schema structure
					!["$schema", "title", "description", "$id"].includes(key),
			)
			.sort();

		for (const key of keys) {
			normalized[key] = normalize(obj[key]);
		}

		return normalized;
	};

	try {
		return JSON.stringify(normalize(schema1)) === JSON.stringify(normalize(schema2));
	} catch {
		return false;
	}
}

export class Context {
	private systemMessage?: string;
	private messages: Message[] = [];
	private tools = new Map<string, ToolDefinition<any, any>>();

	setSystemMessage(message: string): void {
		this.systemMessage = message;
	}

	getSystemMessage(): string | undefined {
		return this.systemMessage;
	}

	addMessage(message: Message): void {
		this.messages.push(message);
	}

	getMessages(): Message[] {
		return this.messages;
	}

	getLastMessage(): Message | undefined {
		return this.messages[this.messages.length - 1];
	}

	clear(): void {
		this.messages = [];
	}

	clone(): Context {
		const newContext = new Context();
		newContext.messages = [...this.messages];
		newContext.tools = new Map(this.tools);
		return newContext;
	}

	getTotalCost(): number {
		return this.messages.reduce((total, message) => {
			if (message.role === "assistant" && message.usage) {
				const modelData = this.findModelData(message.model);
				if (modelData?.pricing) {
					const inputCost = (message.usage.input * modelData.pricing.inputPerMillion) / 1_000_000;
					const outputCost = (message.usage.output * modelData.pricing.outputPerMillion) / 1_000_000;
					return total + inputCost + outputCost;
				}
			}
			return total;
		}, 0);
	}

	getTokenUsage(): TokenUsage {
		return this.messages.reduce(
			(acc, message) => {
				if (message.role === "assistant" && message.usage) {
					return {
						input: acc.input + message.usage.input,
						output: acc.output + message.usage.output,
					};
				}
				return acc;
			},
			{ input: 0, output: 0 },
		);
	}

	getCostByProvider(): Record<string, number> {
		const costs: Record<string, number> = {};
		for (const message of this.messages) {
			if (message.role === "assistant" && message.usage) {
				const modelData = this.findModelData(message.model);
				if (modelData?.pricing) {
					const inputCost = (message.usage.input * modelData.pricing.inputPerMillion) / 1_000_000;
					const outputCost = (message.usage.output * modelData.pricing.outputPerMillion) / 1_000_000;
					costs[message.provider] = (costs[message.provider] || 0) + inputCost + outputCost;
				}
			}
		}
		return costs;
	}

	getCostByModel(): Record<string, number> {
		const costs: Record<string, number> = {};
		for (const message of this.messages) {
			if (message.role === "assistant" && message.usage) {
				const modelData = this.findModelData(message.model);
				if (modelData?.pricing) {
					const inputCost = (message.usage.input * modelData.pricing.inputPerMillion) / 1_000_000;
					const outputCost = (message.usage.output * modelData.pricing.outputPerMillion) / 1_000_000;
					costs[message.model] = (costs[message.model] || 0) + inputCost + outputCost;
				}
			}
		}
		return costs;
	}

	getTokensByProvider(): Record<string, TokenUsage> {
		const tokens: Record<string, TokenUsage> = {};
		for (const message of this.messages) {
			if (message.role === "assistant" && message.usage) {
				if (!tokens[message.provider]) {
					tokens[message.provider] = { input: 0, output: 0 };
				}
				const providerTokens = tokens[message.provider]!;
				providerTokens.input += message.usage.input;
				providerTokens.output += message.usage.output;
			}
		}
		return tokens;
	}

	getTokensByModel(): Record<string, TokenUsage> {
		const tokens: Record<string, TokenUsage> = {};
		for (const message of this.messages) {
			if (message.role === "assistant" && message.usage) {
				if (!tokens[message.model]) {
					tokens[message.model] = { input: 0, output: 0 };
				}
				const modelTokens = tokens[message.model]!;
				modelTokens.input += message.usage.input;
				modelTokens.output += message.usage.output;
			}
		}
		return tokens;
	}

	private findModelData(model: string): ModelData | undefined {
		return findModelData(model);
	}

	addTool<T = Record<string, unknown>, R = unknown>(tool: ToolDefinition<T, R>): void {
		this.tools.set(tool.name, tool);
	}

	getTool(name: string): ToolDefinition<any, any> | undefined {
		return this.tools.get(name);
	}

	listTools(): ToolDefinition<any, any>[] {
		return Array.from(this.tools.values());
	}

	async executeTool(toolCall: ToolCall): Promise<ExecuteToolResult> {
		const tool = this.tools.get(toolCall.name);
		if (!tool) {
			const error: ToolError = {
				type: "execution_failed",
				message: `Tool not found: ${toolCall.name}`,
				toolName: toolCall.name,
			};
			return { success: false, toolCallId: toolCall.id, error };
		}

		return validateAndExecute(tool, toolCall);
	}

	/**
	 * Execute multiple tools in parallel
	 * @param toolCalls Array of tool calls to execute
	 * @returns Promise resolving to array of results in the same order
	 */
	async executeTools(toolCalls: ToolCall[]): Promise<ExecuteToolResult[]> {
		return Promise.all(toolCalls.map((toolCall) => this.executeTool(toolCall)));
	}

	/**
	 * Serialize context to JSON-compatible format
	 * @returns Serialized context with JSON schemas for tools
	 */
	serialize(): SerializedContext {
		const serializedTools: SerializedToolDefinition[] = [];

		for (const tool of this.tools.values()) {
			const jsonSchema = zodToJsonSchema(tool.schema, {
				name: tool.name,
				target: "jsonSchema7",
			});

			serializedTools.push({
				name: tool.name,
				description: tool.description,
				jsonSchema,
			});
		}

		return {
			...(this.systemMessage && { systemMessage: this.systemMessage }),
			messages: [...this.messages],
			tools: serializedTools,
		};
	}

	/**
	 * Deserialize context from JSON-compatible format
	 * @param serialized Serialized context data
	 * @param tools Array of tool definitions to restore (must match serialized tools)
	 * @returns New Context instance with restored data
	 * @throws Error if a serialized tool cannot be matched with provided tools
	 */
	static deserialize(serialized: SerializedContext, tools: ToolDefinition<any, any>[] = []): Context {
		const context = new Context();

		if (serialized.systemMessage) {
			context.setSystemMessage(serialized.systemMessage);
		}

		for (const message of serialized.messages) {
			context.addMessage(message);
		}

		// Restore tools by matching names and validating schemas
		for (const serializedTool of serialized.tools) {
			const matchingTool = tools.find((tool) => tool.name === serializedTool.name);
			if (!matchingTool) {
				throw new Error(`Cannot restore tool '${serializedTool.name}': no matching tool definition provided`);
			}

			// Validate that the tool's Zod schema matches the serialized JSON schema
			const expectedJsonSchema = zodToJsonSchema(matchingTool.schema, {
				name: matchingTool.name,
				target: "jsonSchema7",
			});

			// Deep comparison of the schemas (ignoring order and extra metadata)
			if (!deepSchemaEquals(serializedTool.jsonSchema, expectedJsonSchema)) {
				throw new Error(
					`Tool schema mismatch for '${serializedTool.name}': serialized schema does not match the provided tool definition schema`,
				);
			}

			context.addTool(matchingTool);
		}

		return context;
	}
}
