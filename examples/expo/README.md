# expo-example

Smallest possible Expo app wired up to Re-agentation. Used for the README demo GIF and as a smoke surface for CI.

## Run

From the monorepo root:

```bash
pnpm install
pnpm --filter expo-example start
```

Then press `i` for iOS sim or `a` for Android emulator.

Once the app is up, tap the floating Re-agentation toggle in the top-right corner, then tap any of the demo cards / header / button.

## What this exercises

- `@re-agentation/probe` (`AgentationProbe` mount)
- `@re-agentation/metro` (`withReagentation` wrap in `metro.config.js`)
- Babel `__source` injection from `babel-preset-expo` (no extra plugin needed)
- New Architecture / Fabric (enabled via `app.json` `newArchEnabled: true`)
