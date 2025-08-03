import type { Provider, ModelData } from "@mariozechner/lemmy";

/**
 * Result of model validation with comprehensive type information
 */
export interface ModelValidationResult {
	provider: Provider;
	model: string;
	isKnown: boolean;
	modelData?: ModelData;
	capabilities?: {
		supportsTools: boolean;
		supportsImageInput: boolean;
		contextWindow: number;
		maxOutputTokens: number;
	};
	warnings: string[];
}

/**
 * Configuration for model validation behavior
 */
export interface ModelValidationConfig {
	/** Whether to allow unknown models (default: true) */
	allowUnknownModels?: boolean;
	/** Required capabilities for the model */
	requiredCapabilities?: {
		tools?: boolean;
		images?: boolean;
		minContextWindow?: number;
		minOutputTokens?: number;
	};
	/** Model registries to check against */
	modelRegistries: Record<string, Record<string, ModelData>>;
	/** Model-to-provider mapping */
	modelToProvider: Record<string, Provider>;
}

/**
 * Validate provider with exhaustive TypeScript checking
 */
export function validateProvider(provider: string, validProviders: readonly Provider[]): provider is Provider {
	// Use type assertion with runtime check for exhaustive validation
	return (validProviders as readonly string[]).includes(provider);
}

/**
 * Get valid providers with exhaustive type checking
 * This ensures all Provider types are accounted for
 */
export function getValidProviders(): Provider[] {
	// This should match the Provider union type exactly
	const providers: Provider[] = ["anthropic", "openai", "google", "openrouter"];

	// TypeScript will ensure this is exhaustive if Provider type changes
	const exhaustiveCheck: Record<Provider, true> = {
		anthropic: true,
		openai: true,
		google: true,
		openrouter: true,
	};

	// Verify our array matches the exhaustive check
	for (const provider of providers) {
		if (!exhaustiveCheck[provider]) {
			throw new Error(`Provider ${provider} missing from exhaustive check`);
		}
	}

	return providers;
}

/**
 * Find model data across all registries
 */
export function findModelData(
	model: string,
	modelRegistries: Record<string, Record<string, ModelData>>,
): ModelData | undefined {
	for (const registry of Object.values(modelRegistries)) {
		if (model in registry) {
			return registry[model];
		}
	}
	return undefined;
}

/**
 * Get provider for a model from mapping
 */
export function getModelProvider(model: string, modelToProvider: Record<string, Provider>): Provider | undefined {
	return modelToProvider[model];
}

/**
 * Get models that support specific capabilities
 */
export function getCapableModels(config: ModelValidationConfig, targetProvider?: Provider): Record<Provider, string[]> {
	const capableModels: Record<Provider, string[]> = {
		anthropic: [],
		openai: [],
		google: [],
		openrouter: [],
	};

	// Check all registries for capable models
	for (const [registryName, registry] of Object.entries(config.modelRegistries)) {
		for (const [model, data] of Object.entries(registry)) {
			// Check capabilities
			const meetsRequirements =
				!config.requiredCapabilities ||
				((!config.requiredCapabilities.tools || data.supportsTools) &&
					(!config.requiredCapabilities.images || data.supportsImageInput) &&
					(!config.requiredCapabilities.minContextWindow ||
						data.contextWindow >= config.requiredCapabilities.minContextWindow) &&
					(!config.requiredCapabilities.minOutputTokens ||
						data.maxOutputTokens >= config.requiredCapabilities.minOutputTokens));

			if (meetsRequirements) {
				const provider = getModelProvider(model, config.modelToProvider);
				if (provider && (!targetProvider || provider === targetProvider)) {
					capableModels[provider].push(model);
				}
			}
		}
	}

	return capableModels;
}

/**
 * Validate provider and model with comprehensive checking
 */
export function validateProviderAndModel(
	provider: string,
	model: string,
	config: ModelValidationConfig,
): ModelValidationResult | null {
	const validProviders = getValidProviders();

	// Validate provider with exhaustive checking
	if (!validateProvider(provider, validProviders)) {
		return null; // Invalid provider
	}

	// Provider is now typed as Provider due to type guard
	const result: ModelValidationResult = {
		provider,
		model,
		isKnown: false,
		warnings: [],
	};

	// Check if model exists in registries
	const modelData = findModelData(model, config.modelRegistries);
	if (modelData) {
		result.isKnown = true;
		result.modelData = modelData;
		result.capabilities = {
			supportsTools: modelData.supportsTools,
			supportsImageInput: modelData.supportsImageInput,
			contextWindow: modelData.contextWindow,
			maxOutputTokens: modelData.maxOutputTokens,
		};

		// Verify model belongs to specified provider
		const modelProvider = getModelProvider(model, config.modelToProvider);
		if (modelProvider && modelProvider !== provider) {
			result.warnings.push(`Model ${model} belongs to ${modelProvider}, not ${provider}`);
		}

		// Check required capabilities
		if (config.requiredCapabilities) {
			const caps = config.requiredCapabilities;
			if (caps.tools && !modelData.supportsTools) {
				result.warnings.push(`Model ${model} does not support tool calling`);
			}
			if (caps.images && !modelData.supportsImageInput) {
				result.warnings.push(`Model ${model} does not support image input`);
			}
			if (caps.minContextWindow && modelData.contextWindow < caps.minContextWindow) {
				result.warnings.push(
					`Model ${model} context window (${modelData.contextWindow}) below required ${caps.minContextWindow}`,
				);
			}
			if (caps.minOutputTokens && modelData.maxOutputTokens < caps.minOutputTokens) {
				result.warnings.push(
					`Model ${model} max output (${modelData.maxOutputTokens}) below required ${caps.minOutputTokens}`,
				);
			}
		}
	} else {
		// Unknown model
		result.warnings.push(`Unknown model: ${model}`);
		result.warnings.push(`Model capabilities cannot be validated`);

		if (!config.allowUnknownModels) {
			result.warnings.push(`Unknown models are not allowed`);
		}
	}

	return result;
}

/**
 * Filter providers to exclude specific ones (e.g., for bridging scenarios)
 */
export function filterProviders<T extends Provider>(
	allProviders: Provider[],
	excludeProviders: T[],
): Exclude<Provider, T>[] {
	return allProviders.filter(
		(provider): provider is Exclude<Provider, T> => !excludeProviders.includes(provider as T),
	);
}

/**
 * Get exhaustive provider validation errors
 */
export function getProviderValidationError(provider: string): string {
	const validProviders = getValidProviders();
	return `Invalid provider: ${provider}. Valid providers: ${validProviders.join(", ")}`;
}

/**
 * Create a type-safe provider validator function
 */
export function createProviderValidator(validProviders: readonly Provider[]) {
	return (provider: string): provider is Provider => {
		return validateProvider(provider, validProviders);
	};
}

/**
 * Exhaustive switch helper for provider-specific logic
 */
export function exhaustiveProviderSwitch<T>(provider: Provider, cases: Record<Provider, () => T>): T {
	switch (provider) {
		case "anthropic":
			return cases.anthropic();
		case "openai":
			return cases.openai();
		case "google":
			return cases.google();
		case "openrouter":
			return cases.openrouter();
		default:
			// TypeScript will catch if we miss any provider cases
			const _exhaustiveCheck: never = provider;
			throw new Error(`Unhandled provider: ${_exhaustiveCheck}`);
	}
}
