# @re-agentation/probe

> Tap a component in your React Native simulator, describe the change in plain language, and Claude edits the right file — while your app is still running.

<p align="center">
  <img src="https://raw.githubusercontent.com/Re-agentation/re-agentation/main/.github/assets/hero.gif" alt="Point at a component, describe the change, watch it transform" width="320" />
</p>

The in-app overlay for [**Re-agentation**](https://github.com/Re-agentation/re-agentation) — a dev-only probe + Metro middleware + MCP server. This package is the on-device piece: the floating probe, tap-to-capture, the comment/batch sheets, the change **History** (search · before/after · Undo/Redo/Delete), and the magic-dust apply effect.

👉 **See the [root README](https://github.com/Re-agentation/re-agentation#readme) for the full story, architecture, and setup.**

## Install

```bash
pnpm add -D @re-agentation/probe @re-agentation/metro @re-agentation/mcp
```

Peer deps: `react` ≥ 18, `react-native` ≥ 0.76 (New Architecture / Fabric), `react-native-svg` ≥ 13. Optional: `react-native-image-picker` ≥ 7 (image/video attachments).

## Use

```tsx
// App.tsx — gate the require behind __DEV__ so the probe is tree-shaken
// out of production builds entirely.
const AgentationProbe: () => React.ReactElement | null = __DEV__
  ? require('@re-agentation/probe').AgentationProbe
  : () => null

export default function App() {
  return (
    <>
      <YourApp />
      {__DEV__ && <AgentationProbe />}
    </>
  )
}
```

Then add the [`@re-agentation/metro`](https://www.npmjs.com/package/@re-agentation/metro) middleware and run the [`re-agentation-apply`](https://www.npmjs.com/package/@re-agentation/mcp) watcher (or drive it from Claude Code over MCP). Full setup in the root README.

## Production safety

Dev-only by construction: the probe returns `null` when `__DEV__` is false, the `__DEV__ ? require(...)` pattern lets Metro tree-shake the package out of release bundles, and its backend only exists in the Metro dev server. Zero telemetry.

## Compatibility

- React Native 0.76+ · New Architecture (Fabric) · React 18 & 19
- Hermes & JSC · iOS Simulator + Android Emulator (real device works with a LAN host)

## License

MIT © Jaehwa Jung & Re-agentation contributors
