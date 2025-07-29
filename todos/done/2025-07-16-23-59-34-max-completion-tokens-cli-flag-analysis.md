# Analysis for Max Completion Tokens CLI Flag

## Claude-bridge CLI Implementation Analysis

### Current Architecture

1. **CLI Argument Parsing** (`apps/claude-bridge/src/cli.ts`):
   - Uses manual argument parsing (no external library like yargs/commander)
   - Parses arguments sequentially, handling flags with `--` prefix
   - Supports provider-specific arguments like `--baseURL`, `--apiKey`, `--debug`
   - Has validation for required arguments and flag values

2. **OpenAI Provider Handling**:
   - Provider is specified as the first positional argument
   - OpenAI-specific options include `baseURL` and `apiKey`
   - The interceptor handles provider-specific transformations

3. **Request Interception** (`apps/claude-bridge/src/interceptor.ts`):
   - Uses HTTP/HTTPS request interception to modify Anthropic API calls
   - Transforms requests from Anthropic format to provider-specific format
   - The `callProvider` method handles the actual API call to the selected provider
   - Configuration is passed via environment variables

4. **Max Completion Tokens**:
   - OpenAI uses `max_completion_tokens` instead of Anthropic's `max_tokens`
   - Currently, the transform from Anthropic to OpenAI maps `max_tokens` to `max_completion_tokens`
   - The error in the todo shows that some models have limits (e.g., 16384 tokens)
   - Need to add a CLI flag to override this value

### Key Files to Modify

1. **`apps/claude-bridge/src/cli.ts`**:
   - Add `--max-completion-tokens` flag parsing
   - Add validation for the token value
   - Pass the value to the interceptor

2. **`apps/claude-bridge/src/types.ts`**:
   - Add `maxCompletionTokens?: number` to the `BridgeConfig` interface

3. **`apps/claude-bridge/src/interceptor.ts`**:
   - Read the max completion tokens from the config
   - Apply the override when calling OpenAI provider

### Implementation Strategy

The implementation should:

1. Parse the `--max-completion-tokens` flag in the CLI
2. Validate that the value is a positive integer
3. Pass it through the environment variable system (like other configs)
4. Apply the override only for OpenAI provider calls
5. Ensure backward compatibility (flag is optional)

## Test Strategy

1. **Unit Tests**:
   - Test CLI parsing with the new flag
   - Test validation (positive integers only)
   - Test that the value is passed correctly

2. **Integration Tests**:
   - Test that the override is applied to OpenAI requests
   - Test that it doesn't affect other providers
   - Test with the problematic model from the todo example

3. **Manual Testing**:
   - Run the exact command from the todo with the new flag
   - Verify the error is resolved with a proper token limit
