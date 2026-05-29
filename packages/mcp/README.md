# @re-agentation/mcp

> The agent side of [**Re-agentation**](https://github.com/Re-agentation/re-agentation): an MCP server (stdio + HTTP/SSE) that hands annotation batches to Claude Code, plus `re-agentation-apply` — a local watcher that runs headless Claude to apply the edits, snapshots files for Undo/Redo, and captures before/after screenshots.

<p align="center">
  <img src="https://raw.githubusercontent.com/Re-agentation/re-agentation/main/.github/assets/hero.gif" alt="Point at a component, describe the change, watch it transform" width="320" />
</p>

👉 **See the [root README](https://github.com/Re-agentation/re-agentation#readme) for the full story, architecture, and setup.**

## Install

```bash
pnpm add -D @re-agentation/mcp
```

## MCP server

```jsonc
// .mcp.json (Claude Code / Claude Desktop)
{
  "mcpServers": {
    "re-agentation": { "command": "npx", "args": ["re-agentation-mcp"] },
  },
}
```

Then ask Claude Code: _"re-agentation, process my batch"_ — it pulls the queued annotations over MCP and edits the files.

## Auto-apply watcher (recommended)

Run once in your project root and leave it running — every **Send** in the app applies automatically:

```bash
npx re-agentation-apply
```

The watcher snapshots the working tree with `git` before each edit (so **Undo/Redo revert every file a change touches**), runs `claude -p` against the resolved file, triggers a clean reload only when an import/asset changes, and captures before/after screenshots for the History view. It uses `xcrun simctl` and `ffmpeg` when present (degrades gracefully).

> Adding a brand-new npm dependency? Install it and restart Metro — a reload alone can't pick up a newly-installed package.

## License

MIT © Jaehwa Jung & Re-agentation contributors
