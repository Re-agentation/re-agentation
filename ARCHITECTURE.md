# Architecture

Three packages, one flow.

```
┌─────────────────────────────────────────────────────────────────────┐
│ iOS/Android Simulator (your app, in dev mode)                       │
│                                                                     │
│  <AgentationProbe />  (dev-only, toggle-gated)                      │
│    │                                                                │
│    ├─ overlay catches taps when probe mode is ON                    │
│    ├─ DevTools hook → fiber tree → __source prop                    │
│    ├─ comment sheet → batch store                                   │
│    └─ tray sheet → "Send (N)" → HTTP POST                           │
│                                                                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ POST /__agentation__/batch
                                 │ (localhost:8081 / 10.0.2.2:8081)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Metro Dev Server (Mac)                                              │
│                                                                     │
│  @re-agentation/metro middleware                                    │
│    │                                                                │
│    ├─ POST /__agentation__/batch      → append batch to queue.jsonl │
│    ├─ POST /__agentation__/snapshot   → save PNG                    │
│    ├─ GET  /__agentation__/queue/recent                             │
│    └─ POST /__agentation__/ack        → archive completed batches   │
│                                                                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTP poll / SSE
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MCP Server (separate Node process, launched by Claude Code)         │
│                                                                     │
│  @re-agentation/mcp                                                 │
│    Transport: stdio  (Claude Code, Claude Desktop)                  │
│    Transport: HTTP/SSE  (Cursor, Windsurf, others)                  │
│                                                                     │
│    Tools exposed to the model:                                      │
│      • agentation.nextBatch()                                       │
│      • agentation.listBatches(limit)                                │
│      • agentation.ack({ batchId, itemIds? })                        │
│      • agentation.subscribe()                                       │
│                                                                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ MCP transport
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Claude Code (or Claude Desktop, Cursor, etc.)                       │
│                                                                     │
│  • Pulls batch via MCP tool                                         │
│  • Sees: { component, source: { file, line }, tree, props,          │
│           comment, screenshot? }  for each item                     │
│  • Edits files directly                                             │
│  • Calls ack                                                        │
│                                                                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ File edits
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Metro Fast Refresh (unchanged, already in your project)             │
│  → simulator updates in ~1s                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Why this shape

### Why a batch, not one-at-a-time

A user fixing a screen rarely has one issue. They have three: header too small, card too tight, button wrong color. Sending these one at a time means Claude reasons about them in isolation, Fast Refresh runs three times, and the user is forced to context-switch between simulator and editor between each one. Batches send the user's full intent as a single coherent unit, so Claude can:

- Group edits in the same file into one atomic change.
- Reason about cross-component consistency ("if you bumped header size, also bump card title").
- Trigger one Fast Refresh instead of three.

### Why Metro is the single source of truth

The queue lives on the Metro server's filesystem (`apps/mobile/.agentation/queue.jsonl`). The MCP server is a stateless adapter that talks HTTP to Metro. This avoids the worst pattern in MCP setups — duplicated state between processes — and means the queue survives MCP restarts (Claude Code reconnecting) but disappears when Metro restarts (which is what you want — you don't carry yesterday's annotations into today's session).

### Why `__source` and not `_debugSource`

React 19 removed `_debugSource` from fiber. But `@react-native/babel-preset` enables `@babel/plugin-transform-react-jsx-source` in dev, which puts `{ fileName, lineNumber }` directly into element props. This survives React version changes and is the reason the probe can show you the right file path even under React 19.

### Why Fabric only

RN 0.76+ defaults to the New Architecture, and Paper's hit-test APIs (`UIManager.findSubviewIn`) are gradually deprecated. Targeting Fabric only means a single hit-test code path: walk fibers via the DevTools hook, call `measureInWindow` on host fibers, find the smallest box containing the tap. Less to maintain, fewer surprises.

## Source mapping fallback ladder

In order of preference, the probe reads source location from:

1. `fiber.memoizedProps.__source` — Babel JSX-source plugin, dev default.
2. `fiber.memoizedProps._source` — React's JSX runtime element field, sometimes propagates.
3. `fiber._debugSource` — React 18 internal, gone in React 19.
4. `fiber.type.displayName ?? fiber.type.name` + tree — fallback identity. Claude greps for the component if the file path is missing.

If you find yourself in step 4 on a working RN 0.76+ project, add `@babel/plugin-transform-react-jsx-source` to your `babel.config.js` explicitly. The probe also prints a one-time warning telling you to do this.

## Production safety

Every line of probe code is wrapped in `if (__DEV__)`. The Metro middleware only registers when `process.env.NODE_ENV !== 'production'`. The MCP server is a separate process — production builds don't even know it exists.

CI sanity check: after a release build, grep the output bundle for `AgentationProbe`. It must not appear. The example apps wire this check into their CI.
