# Max completion tokens CLI flag

**Status:** Done
**Agent PID:** 46914

## Original Todo

apps/claude-bridge we need a way to set max_completion_tokens as a cli flag and override the completion tokens Claude Code specifies in its request.

```bash
➜  claude-bridge git:(main) ✗ npx tsx src/cli.ts openai moonshotai/kimi-k2-instruct --baseURL https://api.groq.com/openai/v1 --apiKey $GROQ_API_KEY
⚠️  Unknown model for openai: moonshotai/kimi-k2-instruct
This model is not in our registry but will be attempted.
Known openai models:
    gpt-4-turbo
    gpt-4-turbo-2024-04-09
    gpt-4-turbo-preview
    ... and 24 more
Run 'claude-bridge openai' to see all known models

⚠️  Model capabilities unknown for: moonshotai/kimi-k2-instruct
Tool and image support cannot be validated.

🌉 Claude Bridge starting:
Provider: openai
Model: moonshotai/kimi-k2-instruct
🚀 Launching: node --import /Users/badlogic/workspaces/lemmy/apps/claude-bridge/src/interceptor-loader.js /Users/badlogic/.claude/local/node_modules/@anthropic-ai/claude-code/cli.js
╭─────────────────────────────────────────────────────────────╮
│ ✻ Welcome to Claude Code!                                   │
│                                                             │
│   /help for help, /status for your current setup            │
│                                                             │
│   cwd: /Users/badlogic/workspaces/lemmy/apps/claude-bridge  │
╰─────────────────────────────────────────────────────────────╯

※ Tip: Send messages to Claude while it works to steer Claude in real-time

> how you going?
⎿  API Error (Connection error.) · Retrying in 1 seconds… (attempt 1/10)
    ⎿  Error (400 `max_completion_tokens` must be less than or equal to `16384`, the maximum value for `max_completion_tokens` is less than the `context_window` for this model)
⎿  API Error (Connection error.) · Retrying in 1 seconds… (attempt 2/10)
    ⎿  Error (400 `max_completion_tokens` must be less than or equal to `16384`, the maximum value for `max_completion_tokens` is less than the `context_window` for this model)
⎿  API Error (Connection error.) · Retrying in 2 seconds… (attempt 3/10)
    ⎿  Error (400 `max_completion_tokens` must be less than or equal to `16384`, the maximum value for `max_completion_tokens` is less than the `context_window` for this model)
```

## Description

Add a `--max-output-tokens` CLI flag to claude-bridge that allows users to override the max output tokens for any provider. This maps to `maxOutputTokens` in the BaseAskOptions, which OpenAI's client then converts to `max_completion_tokens`. This is needed because some models (especially those not in the registry) have stricter token limits than what Claude Code requests by default, causing API errors.

## Implementation Plan

- [x] Add `--max-output-tokens` CLI flag parsing in apps/claude-bridge/src/cli.ts
- [x] Add `maxOutputTokens?: number` to BridgeConfig interface in apps/claude-bridge/src/types.ts
- [x] Serialize entire BridgeConfig to JSON and pass via single CLAUDE_BRIDGE_CONFIG env var in apps/claude-bridge/src/cli.ts
- [x] Update interceptor to parse BridgeConfig from CLAUDE_BRIDGE_CONFIG env var in apps/claude-bridge/src/interceptor.ts
- [x] Apply maxOutputTokens override in callProvider method in apps/claude-bridge/src/interceptor.ts:237
- [x] Add validation that max-output-tokens is a positive integer
- [x] Test with the problematic model from the todo example

## Notes

- Using a single CLAUDE_BRIDGE_CONFIG env var with JSON serialization for cleaner config passing
- The maxOutputTokens applies to all providers (not just OpenAI) as it's in BaseAskOptions
- OpenAI client automatically converts maxOutputTokens to max_completion_tokens
