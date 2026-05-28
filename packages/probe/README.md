# @re-agentation/probe

React Native dev-only overlay. Tap a component, annotate it, batch annotations, hit send — Claude Code edits the right files via MCP.

Part of [Re-agentation](https://github.com/re-agentation/re-agentation). See the root README for the full picture.

## Install

```bash
pnpm add -D @re-agentation/probe
```

Peer deps: `react` ≥ 18, `react-native` ≥ 0.76. Optional: `react-native-view-shot` for screenshot attachment.

## Use

```tsx
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

That's it. Production builds tree-shake the probe out because every line is wrapped in `if (__DEV__)`.

## Required: Metro middleware

The probe POSTs annotations to `http://localhost:8081/__agentation__/batch` (Android emulator: `10.0.2.2`). Install the middleware:

```bash
pnpm add -D @re-agentation/metro
```

See [`@re-agentation/metro`](../metro) for setup.

## API

```ts
import { AgentationProbe } from '@re-agentation/probe'

// Optional props (all have sensible defaults)
<AgentationProbe
  metroHost?: string              // override the auto-detected host
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  storageKey?: string             // AsyncStorage key for unsent batch backup
/>
```

## Compatibility

- RN 0.76+ (New Architecture / Fabric only)
- React 18 & 19
- Hermes & JSC
- iOS Simulator + Android Emulator (real device works with manual host config)

## License

MIT
