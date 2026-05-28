# @re-agentation/mcp

MCP server that hands Re-agentation annotation batches to your AI coding agent.

Part of [Re-agentation](https://github.com/re-agentation/re-agentation).

## Install

```bash
pnpm add -D @re-agentation/mcp
```

## Use with Claude Code (stdio)

```jsonc
// ~/.claude/claude_desktop_config.json  (or your Claude Code config file)
{
  "mcpServers": {
    "re-agentation": {
      "command": "npx",
      "args": ["re-agentation-mcp"],
    },
  },
}
```

## Use with Cursor / Windsurf / others (HTTP + SSE)

```bash
npx re-agentation-mcp-http --port 4747
```

Point your client at `http://localhost:4747/sse`.

## Tools exposed to the model

| Tool                                    | Returns                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `agentation.nextBatch()`                | Oldest unprocessed batch (full payload with all items), or `null`. |
| `agentation.listBatches(limit)`         | Up to `limit` recent unprocessed batches.                          |
| `agentation.ack({ batchId, itemIds? })` | Marks the batch (or specific items) as processed.                  |
| `agentation.subscribe()`                | Long-poll / SSE stream of new batches as they arrive.              |

The tool descriptions emphasize that **items inside a batch are one coherent user intent** so the model edits them together, not one-at-a-time.

## How it talks to Metro

The MCP server is a stateless adapter. It calls `http://localhost:8081/__agentation__/...` (the `@re-agentation/metro` middleware) for everything. Metro owns the queue file; if Metro restarts, the queue resets — which is what you want.

If your Metro runs on a non-default port:

```bash
npx re-agentation-mcp --metro http://localhost:8082
```

## License

MIT
