# rn-cli-example

Smallest possible bare React Native CLI app (0.76+, New Architecture) wired up to Re-agentation.

## Run

From the monorepo root:

```bash
pnpm install

# iOS — requires Xcode and the native shell. Generate it via:
#   cd examples/rn-cli && npx @react-native-community/cli init . --skip-install
# (Native folders ios/ android/ are not committed.)
pnpm --filter rn-cli-example ios

# Android — requires Android Studio + emulator.
pnpm --filter rn-cli-example android
```

Once the app is up, tap the floating Re-agentation toggle in the top-right corner, then tap any of the demo cards / header / button.

## What this exercises

- `@re-agentation/probe` on bare RN CLI
- `@re-agentation/metro` with `@react-native/metro-config`'s `mergeConfig`
- `@react-native/babel-preset` (no extra plugin needed in dev)
- New Architecture / Fabric (default on RN 0.76+)

## Why no native folders are committed

`ios/` and `android/` are generated per machine via `react-native init`. We keep this example minimal — running `npx @react-native-community/cli init` once in the folder will scaffold them.
