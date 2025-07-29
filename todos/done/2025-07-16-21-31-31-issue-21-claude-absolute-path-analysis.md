## Summary

I've found the `getClaudeAbsolutePath` function in the claude-trace app. Here's what I discovered:

### Function Location

The function is defined in `/Users/badlogic/workspaces/lemmy/todos/worktrees/2025-07-16-21-31-31-issue-21-claude-absolute-path/apps/claude-trace/src/cli.ts` at lines 97-117.

### Current Implementation

```typescript
function getClaudeAbsolutePath(): string {
	try {
		return require("child_process")
			.execSync("which claude", {
				encoding: "utf-8",
			})
			.trim();
	} catch (error) {
		const os = require("os");
		const localClaudePath = path.join(os.homedir(), ".claude", "local", "node_modules", ".bin", "claude");

		if (fs.existsSync(localClaudePath)) {
			return localClaudePath;
		}

		log(`❌ Claude CLI not found in PATH`, "red");
		log(`❌ Also checked for local installation at: ${localClaudePath}`, "red");
		log(`❌ Please install Claude Code CLI first`, "red");
		process.exit(1);
	}
}
```

### Where It's Used

The function is used in two places:

1. **Line 143** in `runClaudeWithInterception()` - For running Claude with traffic interception
2. **Line 205** in `extractToken()` - For extracting the authentication token

### The Problem

Based on the task.md file, the issue is:

- When Claude is installed via the `/migrate` command, `which claude` returns a bash wrapper at `~/.claude/local/claude`
- This bash wrapper simply executes `/Users/badlogic/.claude/local/node_modules/.bin/claude`
- When Node.js tries to spawn the bash file directly with `spawn("node", ["--require", loaderPath, claudePath, ...])`, it fails with code -1 because Node can't execute a bash script

The function currently has a fallback that checks for the Node.js executable at `~/.claude/local/node_modules/.bin/claude`, but this fallback only runs when `which claude` throws an error. In this case, `which claude` succeeds but returns the wrong type of file (bash instead of Node.js script).

### Solution Needed

The function needs to be updated to:

1. Check if the path returned by `which claude` is a bash script
2. If it is, resolve to the actual Node.js executable that the bash script points to
3. Return the Node.js executable path that can be properly spawned with the `node` command

## Summary

I've analyzed how the claude-trace app handles the Claude executable path. Here's what I found:

### Current Implementation in claude-trace

1. **Path Discovery** (`getClaudeAbsolutePath()` in `/apps/claude-trace/src/cli.ts`):
   - First tries `which claude` to find Claude in PATH
   - If not found, falls back to checking local installation at `~/.claude/local/node_modules/.bin/claude`
   - Returns the absolute path to the Claude executable

2. **Spawning Process**:
   - Uses `spawn("node", ["--require", loaderPath, claudePath, ...claudeArgs])`
   - Passes the Claude path as an argument to Node.js
   - This approach works because Node.js will execute the JavaScript file directly

3. **The Claude Executable**:
   - Located at `~/.claude/local/node_modules/.bin/claude` (a symlink)
   - Points to `../@anthropic-ai/claude-code/cli.js`
   - The `cli.js` file has a shebang `#!/usr/bin/env node`, making it a Node.js script

### How It Handles Different Wrapper Types

The current implementation **does not** resolve symlinks or differentiate between bash wrappers and JS files. It simply:

1. Gets the path from `which` or the known location
2. Passes that path directly to Node.js as an argument

This works because:

- If the path points to a symlink to a JS file, Node.js will follow the symlink and execute the JS file
- If the path were a bash wrapper, this approach would fail (Node.js can't execute bash scripts)

### Key Observation

The claude-trace app assumes the Claude executable is always a Node.js script (or symlink to one) and doesn't handle cases where it might be a bash wrapper. This is why it uses `spawn("node", [claudePath])` rather than `spawn(claudePath)`.

The claude-bridge app has a similar approach with its `findClaudeExecutable()` function that also uses `which` to find the executable but doesn't resolve symlinks.

## Summary

Based on my analysis of the codebase, I found the following existing patterns for resolving symbolic links or following bash wrapper scripts:

### 1. **`findClaudeExecutable()` in claude-bridge/src/cli.ts (lines 386-403)**

- Uses `which` command to find executables in PATH
- Returns the path directly without resolving symbolic links
- Similar pattern to what claude-trace is using

### 2. **`getClaudeAbsolutePath()` in claude-trace/src/cli.ts (lines 97-107)**

- Also uses `which claude` to find the executable
- This is the function mentioned in the issue that finds the bash wrapper instead of the JS file

### 3. **Path utilities used in the codebase:**

- Node.js built-in `path` module is imported in many files (resolve, join, dirname, basename)
- `fs` module is used for file operations but no usage of `fs.realpath` or `fs.readlink` found
- No existing patterns for resolving symbolic links or following bash wrappers

### 4. **The specific issue:**

According to task.md:

- When Claude is installed via /migrate command, `which claude` returns a bash wrapper at `~/.claude/local/claude`
- This bash wrapper executes `~/.claude/local/node_modules/.bin/claude`
- Node.js spawn fails with code -1 when trying to execute the bash file
- Need to resolve the actual JS file path that the bash wrapper points to

### Recommendation:

The codebase currently lacks utilities for:

1. Resolving symbolic links (using `fs.realpath` or `fs.readlink`)
2. Parsing bash wrapper scripts to extract the actual executable path
3. Determining if a file is a bash script vs a Node.js executable

To fix the issue in claude-trace, you would need to:

1. Check if the path returned by `which` is a bash script (check shebang or file content)
2. If it's a bash wrapper, parse it to find the actual Node.js executable path
3. Use `fs.realpath` to resolve any symbolic links in the path
4. Return the final resolved path to the actual JavaScript file
