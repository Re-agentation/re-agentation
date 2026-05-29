# @re-agentation/metro

> Metro dev-server middleware for [**Re-agentation**](https://github.com/Re-agentation/re-agentation) — receives annotation batches from the probe and exposes the queue, change history, undo/redo stash, and media uploads to the apply watcher / MCP server.

<p align="center">
  <img src="https://raw.githubusercontent.com/Re-agentation/re-agentation/main/.github/assets/hero.gif" alt="Point at a component, describe the change, watch it transform" width="320" />
</p>

👉 **See the [root README](https://github.com/Re-agentation/re-agentation#readme) for the full story, architecture, and setup.**

## Install

```bash
pnpm add -D @re-agentation/metro
```

## Use

```js
// metro.config.js
const { withReagentation } = require('@re-agentation/metro')
const { getDefaultConfig } = require('@react-native/metro-config')

module.exports = withReagentation(getDefaultConfig(__dirname))
```

This mounts endpoints under `/__agentation__/` on the Metro dev server:

- `POST /batch` — enqueue a batch from the probe
- `GET /status` · `GET /queue/recent` · `POST /ack` · `POST /cancel`
- `GET /history` (`limit` · `offset` · `q` · `status`) + per-entry `undo` / `redo` / `DELETE`
- `POST /media` + media / before-after screenshot serving

All state lives on your machine under `.agentation/` — zero telemetry, nothing uploaded. (Add `.agentation/` to `.gitignore`.)

## Production safety

The middleware only runs inside the Metro **dev server**. A release build ships a static bundle with no Metro, so none of this exists in production.

## License

MIT © Jaehwa Jung & Re-agentation contributors
