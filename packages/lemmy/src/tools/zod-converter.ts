import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "../types.js";

/**
 * Convert a Zod schema to JSON Schema
 * @param schema Zod schema to convert
 * @returns JSON Schema object
 */
export function convertZodSchema(schema: import("zod").ZodSchema): Record<string, unknown> {
	return zodToJsonSchema(schema) as Record<string, unknown>;
}

/**
 * Convert a tool definition to OpenAI function format
 * @param tool Tool definition with Zod schema
 * @returns OpenAI function definition
 */
export function zodToOpenAI(tool: ToolDefinition<any, any>): {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
} {
	const jsonSchema = convertZodSchema(tool.schema);

	return {
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: jsonSchema,
		},
	};
}

/**
 * Convert a tool definition to Anthropic tool format
 * @param tool Tool definition with Zod schema
 * @returns Anthropic tool definition
 */
export function zodToAnthropic(tool: ToolDefinition<any, any>): {
	name: string;
	description: string;
	input_schema: { type: "object"; [key: string]: unknown };
} {
	const jsonSchema = convertZodSchema(tool.schema);

	// Ensure the schema has the required 'type' field
	const inputSchema = {
		type: "object" as const,
		...jsonSchema,
	};

	return {
		name: tool.name,
		description: tool.description,
		input_schema: inputSchema,
	};
}

/**
 * Convert a tool definition to Google/Gemini function format
 * @param tool Tool definition with Zod schema
 * @returns Google function declaration
 */
export function zodToGoogle(tool: ToolDefinition<any, any>): {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
} {
	const jsonSchema = convertZodSchema(tool.schema);

	return {
		name: tool.name,
		description: tool.description,
		parameters: jsonSchema,
	};
}

/**
 * Convert a tool definition to xAI function format
 * @param tool Tool definition with Zod schema
 * @returns xAI function definition
 */
export function zodToXAI(tool: ToolDefinition<any, any>): {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
} {
	const jsonSchema = convertZodSchema(tool.schema);

	return {
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: jsonSchema,
		},
	};
}

/**
 * Convert a tool definition to MCP tool format
 * @param tool Tool definition with Zod schema
 * @returns MCP tool definition
 */
export function zodToMCP(tool: ToolDefinition<any, any>): {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
} {
	const jsonSchema = convertZodSchema(tool.schema);

	return {
		name: tool.name,
		description: tool.description,
		inputSchema: jsonSchema,
	};
}
