# Contributing

Thanks for your interest. Re-agentation is small and focused — most contributions land in under 200 lines.

## Getting set up

```bash
git clone https://github.com/re-agentation/re-agentation.git
cd re-agentation
pnpm install
pnpm build
pnpm test
```

You need Node 20+ and pnpm 10+.

## Working on a package

```bash
# Watch-build a single package while you edit
pnpm --filter @re-agentation/probe dev

# Type-check the whole tree
pnpm typecheck

# Lint + format
pnpm lint
pnpm format
```

## Trying it against a real RN app

```bash
# In the package you changed:
cd packages/probe
yalc publish

# In your RN app:
yalc add @re-agentation/probe
```

The `examples/expo` and `examples/rn-cli` apps in this repo are wired to consume the workspace packages directly — you can also `pnpm --filter expo-example ios` to test changes end-to-end without yalc.

## Submitting a change

1. Open an issue first if the change is non-trivial. Less than 50 lines + no public API change can skip this.
2. Fork, branch, code.
3. Add a changeset: `pnpm changeset` — pick the package(s), pick patch/minor/major, write one line.
4. Push, open PR. CI runs lint + typecheck + tests + build + example smoke.
5. A maintainer will review. We aim for first response within a week.

## Scope

Re-agentation stays narrow on purpose:

- **In scope**: RN 0.76+, Fabric, Metro, Bare + Expo, iOS sim + Android emulator, stdio + HTTP/SSE MCP.
- **Out of scope**: Paper (old architecture), `react-native-web`, Next.js/Webpack/Vite/Turbopack (use the original Agentation for these), real-device LAN auto-discovery, telemetry of any kind, hosted services.

If you have a use case that doesn't fit, open an issue and we'll talk before you build it.

## Code of conduct

By participating you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).
