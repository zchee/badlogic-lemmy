# Issue #21: getClaudeAbsolutePath finds bash file, not js file

**Status:** Done
**Agent PID:** 8307

## Original Todo

- Issue #21: getClaudeAbsolutePath finds bash file, not js file
   - claude-trace fails when Claude is installed via /migrate command
   - `which claude` returns bash wrapper at ~/.claude/local/claude
   - This bash wrapper executes ~/.claude/local/node_modules/.bin/claude
   - Node.js spawn fails with code -1 when trying to execute the bash file
   - Need to resolve the actual JS file path that the bash wrapper points to

## Description

Fix the `getClaudeAbsolutePath` function in claude-trace to handle bash wrappers created by Claude's /migrate command. When `which claude` returns a bash wrapper, the function should parse the wrapper to find and return the actual Node.js executable path.

## Implementation Plan

The implementation plan will:

1. Detect if the path from `which claude` is a bash script by checking its shebang
2. Parse the bash wrapper to extract the actual Node.js executable path
3. Resolve any symbolic links to get the final JavaScript file
4. Add tests to verify the fix works with both direct executables and bash wrappers
5. Ensure backward compatibility with existing Claude installations

- [x] Update getClaudeAbsolutePath function to detect and handle bash wrappers (apps/claude-trace/src/cli.ts:97-117)
- [x] Add helper function to parse bash wrapper and extract exec command
- [x] Add helper function to resolve symbolic links to final JS file
- [x] User test: Install Claude via /migrate and verify claude-trace works

## Notes

The issue occurs because Node.js cannot directly execute bash scripts when spawned with `node --require loader.js bash-script`. We need to extract the actual JS file path from the bash wrapper.
