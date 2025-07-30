import type {
	UserMessage,
	AssistantMessage,
	Attachment,
	ToolResult,
	ToolCall,
	SerializedContext,
	ToolDefinition,
} from "@mariozechner/lemmy";
import { Context } from "@mariozechner/lemmy";
import { z } from "zod";
import type {
	MessageCreateParamsBase,
	MessageParam,
	ToolChoice,
	ToolUnion,
	Metadata,
	ThinkingConfigParam,
	Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { JSONSchema } from "./types";
import { toJSONSchema } from "zod/v4";

/**
 * Convert JSON Schema to Zod schema
 */
export function jsonSchemaToZod(jsonSchema: JSONSchema): z.ZodSchema {
	if (!jsonSchema || typeof jsonSchema !== "object") {
		return z.any();
	}

	// Handle $ref resolution
	if (jsonSchema.$ref && jsonSchema.definitions) {
		const refPath = jsonSchema.$ref;
		if (refPath.startsWith("#/definitions/")) {
			const definitionName = refPath.substring("#/definitions/".length);
			const definition = jsonSchema.definitions[definitionName];
			if (definition) {
				return jsonSchemaToZod(definition);
			}
		}
	}

	const type = jsonSchema.type;

	switch (type) {
		case "string":
			let stringSchema = z.string();
			if (jsonSchema.description) {
				stringSchema = stringSchema.describe(jsonSchema.description);
			}
			return stringSchema;

		case "number":
			let numberSchema = z.number();
			if (jsonSchema.description) {
				numberSchema = numberSchema.describe(jsonSchema.description);
			}
			return numberSchema;

		case "integer":
			let intSchema = z.number().int();
			if (jsonSchema.description) {
				intSchema = intSchema.describe(jsonSchema.description);
			}
			return intSchema;

		case "boolean":
			let boolSchema = z.boolean();
			if (jsonSchema.description) {
				boolSchema = boolSchema.describe(jsonSchema.description);
			}
			return boolSchema;

		case "array":
			const itemSchema = jsonSchema.items ? jsonSchemaToZod(jsonSchema.items) : z.any();
			let arraySchema = z.array(itemSchema);
			if (jsonSchema.description) {
				arraySchema = arraySchema.describe(jsonSchema.description);
			}
			return arraySchema;

		case "object":
			const shape: Record<string, z.ZodSchema> = {};

			if (jsonSchema.properties) {
				for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
					shape[key] = jsonSchemaToZod(propSchema);
				}
			}

			let objectSchema = z.object(shape);

			// Handle required fields
			if (jsonSchema.required && Array.isArray(jsonSchema.required)) {
				// Zod objects are required by default, so we need to make non-required fields optional
				const requiredFields = new Set(jsonSchema.required);
				const newShape: Record<string, z.ZodSchema> = {};

				for (const [key, schema] of Object.entries(shape)) {
					newShape[key] = requiredFields.has(key) ? schema : schema.optional();
				}

				objectSchema = z.object(newShape);
			} else {
				// If no required array, make all fields optional
				const newShape: Record<string, z.ZodSchema> = {};
				for (const [key, schema] of Object.entries(shape)) {
					newShape[key] = schema.optional();
				}
				objectSchema = z.object(newShape);
			}

			// Handle additionalProperties
			// Note: Zod doesn't have a direct equivalent to additionalProperties: false
			// The default behavior is to strip unknown properties, which is close enough

			if (jsonSchema.description) {
				objectSchema = objectSchema.describe(jsonSchema.description);
			}

			return objectSchema;

		default:
			return z.any();
	}
}

/**
 * Transform Anthropic API request to lemmy Context + Anthropic params
 */
export function transformAnthropicToLemmy(anthropicRequest: MessageCreateParamsBase): SerializedContext {
	const context = new Context();
	const currentTime = new Date();

	// Set system message if present
	if (anthropicRequest.system) {
		if (typeof anthropicRequest.system === "string") {
			context.setSystemMessage(anthropicRequest.system);
		} else {
			// Handle TextBlockParam[] - extract text content
			const systemText = anthropicRequest.system
				.filter((block) => block.type === "text")
				.map((block) => ("text" in block ? block.text : ""))
				.join("\n");
			if (systemText) {
				context.setSystemMessage(systemText);
			}
		}
	}

	// Convert tools to lemmy ToolDefinitions with Zod schemas and add to context
	if (anthropicRequest.tools) {
		for (const anthropicTool of anthropicRequest.tools) {
			if (anthropicTool.type === "custom" || !anthropicTool.type) {
				// Standard custom tool
				const lemmyTool = convertAnthropicToolToLemmy(anthropicTool as Tool);
				if (lemmyTool) {
					context.addTool(lemmyTool);
				}
			}
			// Note: We skip built-in tools like bash_20250124, text_editor_20250124, web_search_20250305
			// since they're Anthropic-specific tools that require special Claude Code runtime support.
			// These tools cannot be executed through the standard lemmy tool system as they depend
			// on Claude Code's internal infrastructure. Only custom tools with input_schema are converted.
		}
	}

	// Convert each Anthropic message to lemmy format and add to context
	for (const anthropicMessage of anthropicRequest.messages) {
		if (anthropicMessage.role === "user") {
			const userMessage = convertAnthropicUserMessage(anthropicMessage, currentTime);
			context.addMessage(userMessage);
		} else if (anthropicMessage.role === "assistant") {
			const assistantMessage = convertAnthropicAssistantMessage(
				anthropicMessage,
				currentTime,
				anthropicRequest.model,
			);
			context.addMessage(assistantMessage);
		}
	}

	return context.serialize();
}

/**
 * Convert Anthropic Tool to lemmy ToolDefinition with Zod schema
 */
function convertAnthropicToolToLemmy(anthropicTool: Tool): ToolDefinition | null {
	try {
		// Type cast needed: InputSchema.properties is typed as 'unknown' but JSONSchema expects 'Record<string, JSONSchema>'
		// At runtime, both represent the same JSON Schema structure, so this cast is safe
		const zodSchema = jsonSchemaToZod(anthropicTool.input_schema as JSONSchema);

		return {
			name: anthropicTool.name,
			description: anthropicTool.description || "",
			schema: zodSchema,
			execute: async () => {
				throw new Error("Tool execution not supported in bridge mode");
			},
		};
	} catch (error) {
		console.warn(`Failed to convert Anthropic tool ${anthropicTool.name} to Zod:`, error);
		return null;
	}
}

function convertAnthropicUserMessage(anthropicMessage: MessageParam, timestamp: Date): UserMessage {
	const userMessage: UserMessage = {
		role: "user",
		timestamp,
	};

	if (typeof anthropicMessage.content === "string") {
		userMessage.content = anthropicMessage.content;
		return userMessage;
	}

	// Handle content blocks
	const contentBlocks = Array.isArray(anthropicMessage.content) ? anthropicMessage.content : [];
	let textContent = "";
	const toolResults: ToolResult[] = [];
	const attachments: Attachment[] = [];

	for (const block of contentBlocks) {
		switch (block.type) {
			case "text":
				if ("text" in block && block.text) {
					textContent += block.text;
				}
				break;

			case "tool_result":
				if ("tool_use_id" in block && "content" in block && block.tool_use_id) {
					toolResults.push({
						toolCallId: block.tool_use_id,
						content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
					});
				}
				break;

			case "image":
				if ("source" in block && block.source) {
					const source = block.source;
					let data: string;
					let mimeType: string;

					if ("data" in source && source.data) {
						// Base64 image
						data = source.data;
						mimeType = "media_type" in source && source.media_type ? source.media_type : "image/jpeg";
					} else if ("url" in source && source.url) {
						// URL image
						data = source.url;
						mimeType = "image/jpeg"; // Default for URL images
					} else {
						continue; // Skip invalid image blocks
					}

					attachments.push({
						type: "image",
						data,
						mimeType,
					});
				}
				break;

			case "document":
				// Documents aren't supported in lemmy types yet, so we skip them
				break;
		}
	}

	// Set the converted content
	if (textContent) userMessage.content = textContent;
	if (toolResults.length > 0) userMessage.toolResults = toolResults;
	if (attachments.length > 0) userMessage.attachments = attachments;

	return userMessage;
}

function convertAnthropicAssistantMessage(
	anthropicMessage: MessageParam,
	timestamp: Date,
	model: string,
): AssistantMessage {
	const assistantMessage: AssistantMessage = {
		role: "assistant",
		timestamp,
		// Required fields - we'll set defaults since we don't have the actual response data
		usage: { input: 0, output: 0 },
		provider: "anthropic",
		model: model,
		took: 0,
	};

	if (typeof anthropicMessage.content === "string") {
		assistantMessage.content = anthropicMessage.content;
		return assistantMessage;
	}

	// Handle content blocks
	const contentBlocks = Array.isArray(anthropicMessage.content) ? anthropicMessage.content : [];
	let textContent = "";
	const toolCalls: ToolCall[] = [];
	let thinking = "";
	let thinkingSignature = "";

	for (const block of contentBlocks) {
		switch (block.type) {
			case "text":
				if ("text" in block && block.text) {
					textContent += block.text;
				}
				break;

			case "thinking":
				if ("thinking" in block && block.thinking) {
					thinking += block.thinking;
				}
				if ("signature" in block && block.signature) {
					thinkingSignature += block.signature;
				}
				break;

			case "tool_use":
				if ("id" in block && "name" in block && block.id && block.name) {
					toolCalls.push({
						id: block.id,
						name: block.name,
						arguments: "input" in block && block.input ? (block.input as Record<string, unknown>) : {},
					});
				}
				break;
		}
	}

	// Set the converted content
	if (textContent) assistantMessage.content = textContent;
	if (toolCalls.length > 0) assistantMessage.toolCalls = toolCalls;
	if (thinking) assistantMessage.thinking = thinking;
	if (thinkingSignature) assistantMessage.thinkingSignature = thinkingSignature;

	return assistantMessage;
}
