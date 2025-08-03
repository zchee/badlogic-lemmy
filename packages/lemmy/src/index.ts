import { AnthropicClient } from "./clients/anthropic.js";
import { GoogleClient } from "./clients/google.js";
import { OpenAIClient } from "./clients/openai.js";
import { OpenRouterClient } from "./clients/openrouter.js";
import { AnthropicConfig, GoogleConfig, OpenAIConfig, OpenRouterConfig } from "./configs.js";

// Main entry point for lemmy
export { Context } from "./context.js";
export * from "./generated/models.js";
export * from "./model-registry.js";
export * from "./tools/index.js";
export * from "./types.js";
export * from "./configs.js";

// Main lemmy object
export const lemmy = {
	anthropic: (config: AnthropicConfig) => new AnthropicClient(config),
	openai: (config: OpenAIConfig) => new OpenAIClient(config),
	google: (config: GoogleConfig) => new GoogleClient(config),
	openrouter: (config: OpenRouterConfig) => new OpenRouterClient(config),
};
