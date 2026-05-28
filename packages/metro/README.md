# @re-agentation/metro

Metro custom middleware. Receives annotation batches from `@re-agentation/probe`, queues them on disk, exposes them to `@re-agentation/mcp`.

Part of [Re-agentation](https://github.com/re-agentation/re-agentation).

## Install

```bash
pnpm add -D @re-agentation/metro
```

## Setup

```js
// metro.config.js
const { withReagentation } = require('@re-agentation/metro')
const { getDefaultConfig } = require('@react-native/metro-config')

module.exports = withReagentation(getDefaultConfig(__dirname))
```

For Expo:

```js
// metro.config.js
const { withReagentation } = require('@re-agentation/metro')
const { getDefaultConfig } = require('expo/metro-config')

module.exports = withReagentation(getDefaultConfig(__dirname))
```

That's it. The middleware only runs when `NODE_ENV !== 'production'`.

## Endpoints

All under `/__agentation__/`:

| Method | Path                       | Purpose                                               |
| ------ | -------------------------- | ----------------------------------------------------- |
| `POST` | `/batch`                   | Receive a `BatchPayload` from probe, append to queue. |
| `POST` | `/snapshot`                | Receive a base64 PNG, store, return URL.              |
| `GET`  | `/queue/recent?since=<ts>` | Return batches added after `since`.                   |
| `POST` | `/ack`                     | Mark `{ batchId, itemIds? }` as processed.            |
| `GET`  | `/health`                  | Liveness.                                             |

## Storage

Queue: `<projectRoot>/.agentation/queue.jsonl` (one batch per line, JSONL).
Archive: `<projectRoot>/.agentation/archive/<date>.jsonl` (after ack).
Snapshots: `<projectRoot>/.agentation/snapshots/<batchId>/<itemId>.png`.

Add `.agentation/` to your `.gitignore`.

## License

MIT
