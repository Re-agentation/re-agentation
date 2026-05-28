# Re-agentation

> Tap a component in your iOS or Android simulator. Add a comment. Claude edits the right file.
> Like [Agentation](https://github.com/benjitaylor/agentation), but for React Native.

[![CI](https://github.com/re-agentation/re-agentation/actions/workflows/ci.yml/badge.svg)](https://github.com/re-agentation/re-agentation/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zero telemetry](https://img.shields.io/badge/telemetry-zero-brightgreen.svg)](#privacy)

<!-- Hero GIF goes here once recorded. See docs/assets/demo.gif -->

## What it is

`Re-agentation` is a dev-only React Native overlay + Metro middleware + MCP server that lets you:

1. Toggle a probe mode in your running simulator/emulator.
2. Tap any component on screen.
3. Type a natural-language comment ("make this bigger", "use brand color").
4. Stack as many of these as you want into a **batch**.
5. Hit send — Claude Code receives the batch over MCP and edits the exact files.
6. Metro Fast Refresh paints the changes back into your simulator within a second.

No browser. No `react-native-web`. No source maps to wire up. Works with your real native app.

## Quick start

```bash
pnpm add -D @re-agentation/probe @re-agentation/metro @re-agentation/mcp
```

```tsx
// App.tsx
import { AgentationProbe } from '@re-agentation/probe'

export default function App() {
  return (
    <>
      <YourApp />
      {__DEV__ && <AgentationProbe />}
    </>
  )
}
```

```js
// metro.config.js
const { withReagentation } = require('@re-agentation/metro')
const { getDefaultConfig } = require('@react-native/metro-config')

module.exports = withReagentation(getDefaultConfig(__dirname))
```

```jsonc
// Claude Code MCP config
{
  "mcpServers": {
    "re-agentation": {
      "command": "npx",
      "args": ["re-agentation-mcp"],
    },
  },
}
```

That's it. `pnpm start` → simulator → probe button → tap → comment → batch → send → Claude edits → Fast Refresh.

## Compatibility

| Surface      | Supported                                                         |
| ------------ | ----------------------------------------------------------------- |
| React Native | 0.76+                                                             |
| Architecture | New Architecture (Fabric)                                         |
| React        | 18 & 19                                                           |
| Setup        | Bare RN CLI + Expo (SDK 52+)                                      |
| JS engine    | Hermes & JSC                                                      |
| Platform     | iOS Simulator, Android Emulator (real device works with LAN host) |

Verified end-to-end on RN 0.85.3 + React 19.2.3 + Hermes + Fabric (iOS Simulator):
the capture → `_debugStack` parse → Metro `/symbolicate` pipeline resolves taps to
exact `App.tsx:line:col` source locations. See [docs/phase-0-validation.md](docs/phase-0-validation.md).

For Next.js / DOM apps use the original [Agentation](https://github.com/benjitaylor/agentation) — it already works there.

## Packages

| Package                                  | Purpose                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| [`@re-agentation/probe`](packages/probe) | RN component — overlay, batch store, comment sheet, fiber walk               |
| [`@re-agentation/metro`](packages/metro) | Metro custom middleware — receives batches, queues them, exposes them to MCP |
| [`@re-agentation/mcp`](packages/mcp)     | MCP server — stdio (Claude Code, Claude Desktop) + HTTP/SSE (Cursor, etc.)   |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how they connect.

## Privacy

This tool runs entirely on your dev machine. Zero telemetry. No network calls outside `localhost`. The only thing that ever leaves your machine is what Claude Code itself sends to Anthropic when you ask it to edit code — same as any other Claude Code session.

## Inspired by

The annotate-then-edit UX is borrowed from [Agentation](https://github.com/benjitaylor/agentation) by [@benjitaylor](https://github.com/benjitaylor). Agentation pioneered this pattern for DOM/React. Re-agentation is an independent re-implementation focused on the React Native fiber tree, Babel `__source` prop, and Fabric renderer.

## License

MIT. See [LICENSE](./LICENSE).
