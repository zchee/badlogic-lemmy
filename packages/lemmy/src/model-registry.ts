import { lemmy } from "./index.js";
import {
	AllModels,
	AnthropicModelData,
	GoogleModelData,
	ModelToProvider,
	OpenAIModelData,
	OpenrouterModelData,
} from "./generated/models.js";
import { ChatClient, TokenUsage } from "./types.js";
import type { AnthropicConfig, GoogleConfig, OpenAIConfig, OpenRouterConfig } from "./configs.js";

// Re-export model types and data
export * from "./generated/models.js";

// Provider utilities for CLI usage
export function getProviderForModel(model: AllModels): "anthropic" | "openai" | "google" | "openrouter" {
	return ModelToProvider[model as keyof typeof ModelToProvider];
}

export function getDefaultApiKeyEnvVar(provider: "anthropic" | "openai" | "google" | "openrouter"): string {
	switch (provider) {
		case "anthropic":
			return "ANTHROPIC_API_KEY";
		case "openai":
			return "OPENAI_API_KEY";
		case "google":
			return "GOOGLE_API_KEY";
		case "openrouter":
			return "OPENROUTER_API_KEY";
		default:
			throw new Error(`Unknown provider: ${provider}`);
	}
}

// Type-safe factory function for CLI usage
export function createClientForModel(
	model: AllModels,
	config: AnthropicConfig | OpenAIConfig | GoogleConfig | OpenRouterConfig,
): ChatClient {
	const provider = ModelToProvider[model as keyof typeof ModelToProvider];

	if (provider === "anthropic") {
		return lemmy.anthropic({ ...config, model } as AnthropicConfig);
	} else if (provider === "openai") {
		return lemmy.openai({ ...config, model } as OpenAIConfig);
	} else if (provider === "google") {
		return lemmy.google({ ...config, model } as GoogleConfig);
	} else if (provider === "openrouter") {
		return lemmy.openrouter({ ...config, model } as OpenRouterConfig);
	} else {
		throw new Error(`Unsupported model: ${model}`);
	}
}

// Helper functions for model lookup
export function findModelData(model: string): ModelData | undefined {
	if (AnthropicModelData[model as keyof typeof AnthropicModelData]) {
		return AnthropicModelData[model as keyof typeof AnthropicModelData] as ModelData;
	}
	if (OpenAIModelData[model as keyof typeof OpenAIModelData]) {
		return OpenAIModelData[model as keyof typeof OpenAIModelData] as ModelData;
	}
	if (GoogleModelData[model as keyof typeof GoogleModelData]) {
		return GoogleModelData[model as keyof typeof GoogleModelData] as ModelData;
	}
	if (OpenrouterModelData[model as keyof typeof OpenrouterModelData]) {
		return OpenrouterModelData[model as keyof typeof OpenrouterModelData] as ModelData;
	}
	return undefined;
}

export function calculateTokenCost(model: string, tokens: TokenUsage): number {
	const modelData = findModelData(model);
	if (!modelData?.pricing) {
		return 0;
	}

	const inputCost = (tokens.input * modelData.pricing.inputPerMillion) / 1_000_000;
	const outputCost = (tokens.output * modelData.pricing.outputPerMillion) / 1_000_000;

	return inputCost + outputCost;
}

export interface ModelData {
	contextWindow: number;
	maxOutputTokens: number;
	supportsTools: boolean;
	supportsImageInput: boolean;
	pricing: {
		inputPerMillion: number;
		outputPerMillion: number;
	} | null;
}
