import { z } from "zod";

// =============================================================================
// Core schemas
// =============================================================================

export const ProviderSchema = z.enum(["anthropic", "openai", "google", "openrouter"]);

// =============================================================================
// Ask options schemas (for runtime API calls)
// =============================================================================

export const BaseAskOptionsSchema = z.object({
	maxOutputTokens: z.coerce.number().min(1).optional().describe("Maximum number of output tokens to generate"),
	abortSignal: z.custom<AbortSignal>().optional().describe("AbortSignal to cancel the request"),
});

export const AnthropicAskOptionsSchema = BaseAskOptionsSchema.extend({
	thinkingEnabled: z.coerce.boolean().optional().describe("Whether to enable extended thinking for this request"),
	maxThinkingTokens: z.coerce
		.number()
		.min(1024)
		.optional()
		.describe("Maximum number of thinking tokens for this request (must be ≥1024 and less than max_tokens)"),
	temperature: z.coerce
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Temperature for sampling (0.0-1.0, defaults to 1.0)"),
	topK: z.coerce.number().min(1).optional().describe("Only sample from the top K options for each token"),
	topP: z.coerce
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Use nucleus sampling with specified probability cutoff (0.0-1.0)"),
	stopSequences: z.string().optional().describe("Stop sequence (single string)"),
	toolChoice: z.enum(["auto", "any", "none"]).optional().describe("How the model should use the provided tools"),
	disableParallelToolUse: z.coerce.boolean().optional().describe("Whether to disable parallel tool use"),
	serviceTier: z.enum(["auto", "standard_only"]).optional().describe("Priority tier for the request"),
	userId: z.string().optional().describe("External identifier for the user (uuid/hash)"),
});

export const OpenAIAskOptionsSchema = BaseAskOptionsSchema.extend({
	reasoningEffort: z
		.enum(["low", "medium", "high"])
		.optional()
		.describe("Reasoning effort level - only supported by reasoning models (o1-mini, o1-preview)"),
	temperature: z.coerce.number().min(0).max(2).optional().describe("Temperature for sampling (0.0-2.0)"),
	topP: z.coerce.number().min(0).max(1).optional().describe("Top-p sampling parameter (0.0-1.0)"),
	presencePenalty: z.coerce
		.number()
		.min(-2)
		.max(2)
		.optional()
		.describe("Presence penalty (-2.0 to 2.0) - penalizes tokens based on presence"),
	frequencyPenalty: z.coerce
		.number()
		.min(-2)
		.max(2)
		.optional()
		.describe("Frequency penalty (-2.0 to 2.0) - penalizes tokens based on frequency"),
	logprobs: z.coerce.boolean().optional().describe("Whether to return log probabilities of output tokens"),
	topLogprobs: z.coerce
		.number()
		.min(0)
		.max(20)
		.optional()
		.describe("Number of most likely tokens to return at each position (0-20)"),
	maxCompletionTokens: z.coerce
		.number()
		.min(1)
		.optional()
		.describe("Upper bound for tokens in completion (including reasoning tokens)"),
	n: z.coerce.number().min(1).max(128).optional().describe("Number of chat completion choices to generate (1-128)"),
	parallelToolCalls: z.coerce.boolean().optional().describe("Enable parallel function calling during tool use"),
	responseFormat: z.enum(["text", "json_object"]).optional().describe("Output format specification"),
	seed: z.coerce.number().optional().describe("For deterministic sampling (beta feature)"),
	serviceTier: z.enum(["auto", "default", "flex"]).optional().describe("Latency tier for scale tier customers"),
	stop: z.string().optional().describe("Stop sequence (single string)"),
	store: z.coerce.boolean().optional().describe("Store output for model distillation/evals"),
	toolChoice: z.enum(["none", "auto", "required"]).optional().describe("Controls which tool is called"),
	user: z.string().optional().describe("Stable identifier for end-users"),
});

export const GoogleAskOptionsSchema = BaseAskOptionsSchema.extend({
	includeThoughts: z.coerce.boolean().optional().describe("Whether to include thinking tokens for this request"),
	thinkingBudget: z.coerce.number().min(1).optional().describe("Thinking budget in tokens"),
	temperature: z.coerce.number().min(0).max(2).optional().describe("Temperature for sampling (0.0-2.0)"),
	topP: z.coerce.number().min(0).max(1).optional().describe("Top-p sampling parameter (0.0-1.0)"),
	topK: z.coerce.number().min(1).optional().describe("Top-k sampling parameter (positive integer)"),
	candidateCount: z.coerce.number().min(1).optional().describe("Number of response variations to return"),
	stopSequences: z.string().optional().describe("Stop sequence (single string)"),
	responseLogprobs: z.coerce.boolean().optional().describe("Whether to return the log probabilities of chosen tokens"),
	logprobs: z.coerce
		.number()
		.min(0)
		.optional()
		.describe("Number of top candidate tokens to return log probabilities for"),
	presencePenalty: z.coerce
		.number()
		.min(0)
		.optional()
		.describe("Positive values penalize tokens that already appear (presence penalty)"),
	frequencyPenalty: z.coerce
		.number()
		.min(0)
		.optional()
		.describe("Positive values penalize tokens that repeatedly appear (frequency penalty)"),
	seed: z.coerce.number().optional().describe("Fixed seed for deterministic responses"),
	responseMimeType: z.enum(["text/plain", "application/json"]).optional().describe("Output response mimetype"),
});

// =============================================================================
// Client configuration schemas (compose base config + model + defaults)
// =============================================================================
export const BaseClientConfigSchema = z.object({
	apiKey: z.string().describe("API key for the provider"),
	baseURL: z.string().optional().describe("Optional custom API base URL"),
	maxRetries: z.coerce.number().min(0).optional().describe("Maximum number of retries for failed requests"),
});

export const AnthropicConfigSchema = BaseClientConfigSchema.extend({
	model: z.string().describe("Model name (e.g. 'claude-3-5-sonnet-20241022')"),
	defaults: AnthropicAskOptionsSchema.optional().describe("Default options for ask requests"),
});

export const OpenAIConfigSchema = BaseClientConfigSchema.extend({
	model: z.string().describe("Model name (e.g. 'gpt-4o')"),
	organization: z.string().optional().describe("Optional OpenAI organization ID"),
	defaults: OpenAIAskOptionsSchema.optional().describe("Default options for ask requests"),
});

export const GoogleConfigSchema = BaseClientConfigSchema.extend({
	model: z.string().describe("Model name (e.g. 'gemini-1.5-pro')"),
	projectId: z.string().optional().describe("Optional Google Cloud project ID"),
	defaults: GoogleAskOptionsSchema.optional().describe("Default options for ask requests"),
});

// =============================================================================
// Export schemas for runtime validation (for CLI)
// =============================================================================

export const CLIENT_CONFIG_SCHEMAS = {
	base: BaseClientConfigSchema.omit({ apiKey: true }), // Remove apiKey for CLI options
	anthropic: AnthropicAskOptionsSchema,
	openai: OpenAIAskOptionsSchema,
	google: GoogleAskOptionsSchema,
	openrouter: OpenAIAskOptionsSchema,
} as const;

// =============================================================================
// Export concrete config and ask options types
// =============================================================================
export type BaseConfig = z.infer<typeof BaseClientConfigSchema>;
export type AnthropicConfig = z.infer<typeof AnthropicConfigSchema>;
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
export type GoogleConfig = z.infer<typeof GoogleConfigSchema>;
export type OpenRouterConfig = z.infer<typeof OpenAIConfigSchema>;

export type BaseAskOptions = z.infer<typeof BaseAskOptionsSchema>;
export type AnthropicAskOptions = z.infer<typeof AnthropicAskOptionsSchema>;
export type OpenAIAskOptions = z.infer<typeof OpenAIAskOptionsSchema>;
export type GoogleAskOptions = z.infer<typeof GoogleAskOptionsSchema>;

// Schema-driven config type mapping
export type ProviderConfigMap = {
	anthropic: AnthropicConfig;
	openai: OpenAIConfig;
	google: GoogleConfig;
	openrouter: OpenRouterConfig;
};

// =============================================================================
// CLI parsing utilities using Zod schemas
// =============================================================================

function getZodSchemaFields(
	schema: any,
): Record<string, { type: string; isOptional: boolean; enumValues?: string[]; description?: string }> {
	const fields: Record<string, { type: string; isOptional: boolean; enumValues?: string[]; description?: string }> =
		{};

	if (schema && schema._def && schema._def.shape) {
		for (const [key, fieldSchema] of Object.entries(schema._def.shape() as any)) {
			const field: any = fieldSchema;
			let type = "string";
			let enumValues: string[] | undefined;
			let isOptional = false;
			let description: string | undefined;

			// Check if field is optional
			if (field._def.typeName === "ZodOptional") {
				isOptional = true;
				// Get the inner type
				const innerField = field._def.innerType;
				if (innerField._def) {
					// Handle coerced types
					if (innerField._def.innerType) {
						const innerType = innerField._def.innerType._def.typeName;
						if (innerType === "ZodNumber") type = "number";
						else if (innerType === "ZodBoolean") type = "boolean";
					}
					// Handle direct types
					else if (innerField._def.typeName === "ZodNumber") type = "number";
					else if (innerField._def.typeName === "ZodBoolean") type = "boolean";
					else if (innerField._def.typeName === "ZodEnum") {
						type = "enum";
						enumValues = innerField._def.values;
					} else if (innerField._def.typeName === "ZodArray") type = "string[]";
				}
			} else {
				// Handle non-optional fields
				if (field._def) {
					// Handle coerced types
					if (field._def.innerType) {
						const innerType = field._def.innerType._def.typeName;
						if (innerType === "ZodNumber") type = "number";
						else if (innerType === "ZodBoolean") type = "boolean";
					}
					// Handle direct types
					else if (field._def.typeName === "ZodNumber") type = "number";
					else if (field._def.typeName === "ZodBoolean") type = "boolean";
					else if (field._def.typeName === "ZodEnum") {
						type = "enum";
						enumValues = field._def.values;
					} else if (field._def.typeName === "ZodArray") type = "string[]";
				}
			}

			// Extract description from JSDoc comments (if available)
			if (field.description) {
				description = field.description;
			}

			fields[key] = {
				type,
				isOptional,
				...(enumValues && { enumValues }),
				...(description && { description }),
			};
		}
	}

	return fields;
}

// Helper functions for CLI parsing using Zod schemas
export function getFieldType(provider: string, field: string): string | undefined {
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return providerFields[field]?.type;
		}
	}

	// Check base config if not found in provider-specific config
	const baseFields = getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base);
	if (field in baseFields) {
		return baseFields[field]?.type;
	}

	return undefined;
}

export function isRequired(provider: string, field: string): boolean {
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return !providerFields[field]?.isOptional;
		}
	}

	// Check base config if not found in provider-specific config
	const baseFields = getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base);
	if (field in baseFields) {
		return !baseFields[field]?.isOptional;
	}

	return false;
}

export function getFieldDoc(provider: string, field: string): string | undefined {
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return providerFields[field]?.description;
		}
	}

	// Check base config if not found in provider-specific config
	const baseFields = getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base);
	if (field in baseFields) {
		return baseFields[field]?.description;
	}

	return undefined;
}

export function getEnumValues(provider: string, field: string): string[] | undefined {
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];
	if (providerSchema) {
		const providerFields = getZodSchemaFields(providerSchema);
		if (field in providerFields) {
			return providerFields[field]?.enumValues;
		}
	}

	// Check base config if not found in provider-specific config
	const baseFields = getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base);
	if (field in baseFields) {
		return baseFields[field]?.enumValues;
	}

	return undefined;
}

// Additional helper function to get all fields for a provider (including base fields)
export function getAllFields(provider: string): string[] {
	const baseFields = Object.keys(getZodSchemaFields(CLIENT_CONFIG_SCHEMAS.base));
	const providerSchema = CLIENT_CONFIG_SCHEMAS[provider as keyof typeof CLIENT_CONFIG_SCHEMAS];

	if (!providerSchema || provider === "base") {
		return baseFields;
	}

	const providerFields = Object.keys(getZodSchemaFields(providerSchema));
	return [...baseFields, ...providerFields];
}

// Helper function to validate provider name
export function isValidProvider(provider: string): boolean {
	return provider in CLIENT_CONFIG_SCHEMAS && provider !== "base";
}

// Get all valid provider names
export function getProviders(): string[] {
	return Object.keys(CLIENT_CONFIG_SCHEMAS).filter((key) => key !== "base");
}
