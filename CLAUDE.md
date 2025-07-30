# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical TypeScript Rule

**CRITICAL: Avoid `any` at all costs!** Use proper TypeScript types wherever possible:

- Import and use the specific types from packages/lemmy/src/types.ts (AskOptions, AnthropicAskOptions, OpenAIAskOptions, GoogleAskOptions, etc.)
- Never use `any` when a proper type exists
- If dynamic properties are needed, use proper type unions or mapped types
- Always prefer type safety over convenience
- When you see `: any` in code, consider it a bug that needs fixing

## Common Development Commands

### Building the Project

```bash
npm run build      # Build all packages
npm run dev        # Watch mode for all packages
npm run clean      # Clean all dist folders
```

### Testing

```bash
npm run test       # Run all tests in watch mode
npm run test:run   # Run all tests once
cd packages/lemmy && npm run test:coverage  # Coverage report for core package
```

### Type Checking

```bash
npm run typecheck  # Type check all projects
```

### Code Formatting

```bash
npm run format       # Format code with prettier
npm run format:check # Check formatting without changes
```

## High-Level Architecture

### Monorepo Structure

This is an npm workspaces monorepo with TypeScript project references for efficient compilation:

- **packages/lemmy**: Core library providing unified LLM interfaces
- **packages/lemmy-tui**: Terminal UI framework with differential rendering
- **packages/lemmy-cli-args**: CLI argument parsing utilities
- **packages/lemmy-tools**: Tool system with MCP integration (if present)
- **apps/**: Various applications demonstrating lemmy usage

### Core Library Architecture (packages/lemmy)

The main entry point exports:

- `lemmy` object with factory functions for each provider
- Type definitions from `types.ts`
- Configuration schemas from `configs.ts`
- Context management from `context.ts`
- Tool utilities from `tools/`

Provider implementations follow a common pattern:

1. Each provider (Anthropic, OpenAI, Google) implements the `ChatClient` interface
2. Providers handle their specific API quirks internally
3. All return normalized `AskResult` responses
4. Streaming is supported with `onChunk` and `onThinkingChunk` callbacks

### Type System

All types are centralized in `packages/lemmy/src/types.ts`:

- `AskOptions<T>`: Provider-specific options extending `BaseAskOptions`
- `Message`: Discriminated union of `UserMessage` and `AssistantMessage`
- `AskResult`: Success with tokens/cost or error
- `ToolDefinition<T, R>`: Type-safe tool definitions with Zod schemas

Configuration uses Zod schemas in `configs.ts` for runtime validation and CLI parsing.

### Context Management

The `Context` class manages conversation state across providers:

- Maintains message history with proper typing
- Tracks token usage and costs
- Manages tool definitions and execution
- Provides serialization for persistence

### Tool System

Tools use Zod schemas for validation:

- Define tools with `defineTool<TArgs, TResult>()`
- Tools are automatically converted to provider-specific formats
- Built-in tools available in `packages/lemmy-tools` (if present)
- MCP (Model Context Protocol) integration for external tools
