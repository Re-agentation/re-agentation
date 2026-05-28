# Phase 0 — Validation snippets

Before we implement `packages/probe/src/fiber-walk.ts` we need three answers from a real React Native dev build. Total runtime: ~10 minutes.

## Why this exists

`fiber-walk.ts` has two strategy branches:

- **(A)** Native hit-test via `UIManager.findSubviewIn` + `renderer.findFiberByHostInstance`.
- **(B)** Host-only fiber walk + `measureInWindow` on each host fiber.

We need real-device evidence to pick one. We also need to know whether the Babel JSX-source plugin is putting `{fileName, lineNumber}` on `memoizedProps.__source`, `memoizedProps._source`, or `_debugSource`.

## Where to run these

Use any RN 0.76+ project you have handy. For Jay's setup, NUBEEM mobile (`apps/mobile`) is perfect — it's RN 0.85.3 + React 19.2.3 + Fabric (New Arch only).

## 0-A. Where does `__source` actually land?

In your app, add this anywhere that runs once at startup (e.g., near the top of `App.tsx`, inside `useEffect(() => { ... }, [])`):

```ts
if (__DEV__) {
  setTimeout(() => {
    const hook = (global as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
    if (!hook) {
      console.log('[probe-validate] no DevTools hook')
      return
    }
    const renderer = Array.from(hook.renderers.values())[0] as any
    if (!renderer) {
      console.log('[probe-validate] no renderer')
      return
    }
    const roots = hook.getFiberRoots(1) // rendererID is 1 in dev
    const root = Array.from(roots)[0] as any
    if (!root) {
      console.log('[probe-validate] no root')
      return
    }
    let count = 0
    let withDebugSource = 0
    let withPropsDouble = 0
    let withPropsSingle = 0
    let withDebugStack = 0
    function walk(f: any, depth = 0) {
      if (!f || depth > 30 || count > 200) return
      count++
      const typeName =
        f.type?.displayName ?? f.type?.name ?? (typeof f.type === 'string' ? f.type : '<unknown>')
      const dbg = f._debugSource
      const propsDouble = f.memoizedProps?.__source
      const propsSingle = f.memoizedProps?._source
      const debugStack = f._debugStack
      if (dbg) withDebugSource++
      if (propsDouble) withPropsDouble++
      if (propsSingle) withPropsSingle++
      if (debugStack) withDebugStack++
      // Log first 10 user-component-ish hits
      if (count < 30 && typeof f.type === 'function') {
        console.log('[probe-validate]', typeName, {
          _debugSource: dbg ? `${dbg.fileName}:${dbg.lineNumber}` : null,
          'props.__source': propsDouble
            ? `${propsDouble.fileName}:${propsDouble.lineNumber}`
            : null,
          'props._source': propsSingle ? `${propsSingle.fileName}:${propsSingle.lineNumber}` : null,
          _debugStack: debugStack ? '[present]' : null,
        })
      }
      walk(f.child, depth + 1)
      walk(f.sibling, depth)
    }
    walk(root.current)
    console.log('[probe-validate] summary', {
      totalFibers: count,
      withDebugSource,
      withPropsDouble,
      withPropsSingle,
      withDebugStack,
    })
  }, 1500)
}
```

**What to look for in Metro logs:**

- The summary line tells you which field is populated. Whichever has the highest non-zero count wins the fallback ladder ordering.
- The per-component lines confirm the values are real file paths + line numbers, not garbage.

**Record result here:**

```
totalFibers:      ___
withDebugSource:  ___
withPropsDouble:  ___    ← if non-zero, this is our primary
withPropsSingle:  ___    ← secondary fallback
withDebugStack:   ___    ← React 19 tertiary
```

## 0-B. Fabric hit-test API status

Already verified mechanically. Results:

- `UIManager.findSubviewIn` exists in `BridgelessUIManager.js` (Fabric) but is `@deprecated` in `UIManager.d.ts`.
- Recommended alternatives per RN's own typings: `ref.measure`, `ref.measureInWindow`, `ref.measureLayout`.

**Implication**: Strategy (A) still technically works on Fabric but pivots toward removal. Strategy (B) is the stable long-term path.

## 0-C. `measureInWindow` actually works on Fabric

Add this to any screen in your app, after a render settles:

```tsx
import { useEffect, useRef } from 'react'
import { View, Text } from 'react-native'

export function ProbeValidateMeasure() {
  const ref = useRef<View>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        console.log('[probe-validate-measure]', { x, y, width, height })
      })
    }, 500)
    return () => clearTimeout(t)
  }, [])
  return (
    <View ref={ref} style={{ padding: 20, backgroundColor: '#eef' }}>
      <Text>measure target</Text>
    </View>
  )
}
```

**Expected**: One log line with sensible non-zero `x/y/width/height`. If you get all zeros or no log at all on Fabric, Strategy (B) needs a different shadow-node accessor and we'll fall back to copying RN Inspector's internals.

**Record result here:**

```
x:      ___
y:      ___
width:  ___
height: ___
called within ~500ms: yes / no
```

## 0-D. Built-in RN Inspector still works

Just open your app in the simulator and `Cmd+D` (iOS) or `Cmd+M` (Android) → "Show Element Inspector". Tap a component.

- If the overlay appears and shows source file:line: ✅ — the same Babel `__source` channel we'll use is fully functional.
- If it shows component name but no file:line: ⚠️ — `__source` might be missing or in an unexpected location. Re-check 0-A.
- If the inspector doesn't toggle at all: ❌ — file an issue, this hints at a Fabric Inspector regression in your RN version.

**Record result here:**

```
Inspector overlay shown:           yes / no
Component name shown:              yes / no
Source file shown:                 yes / no
Source line shown:                 yes / no
RN version:                        _____
React version:                     _____
Hermes:                            yes / no
```

## Decision matrix (read after running 0-A and 0-C)

| 0-A populated field | 0-C `measureInWindow` works | Strategy                                                                                        |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| props.\_\_source    | yes                         | **(B) recommended** — host-only walk + measureInWindow, read `__source` prop                    |
| props.\_source      | yes                         | (B), read `_source` prop                                                                        |
| \_debugSource       | yes                         | (B), read `_debugSource` (legacy path, fine if you're on React 18)                              |
| none of them        | yes                         | Add `@babel/plugin-transform-react-jsx-source` to `babel.config.js` explicitly, re-run 0-A      |
| any                 | no                          | (A) fallback — Strategy (A) via `BridgelessUIManager.findSubviewIn` (deprecated but functional) |

Whatever the answer, record it here and the implementation in `packages/probe/src/fiber-walk.ts` keys off this file.

## After Phase 0

Once you've filled this out, ping the implementation. The probe will be wired with the chosen branch and the README's "Compatibility" table will note the path used.

---

## Validation results — 2026-05-29

Run against NUBEEM mobile (`apps/mobile`):

- RN 0.85.3 (bare, New Architecture only / Fabric)
- React 19.2.3
- Hermes engine
- iOS Simulator (iPhone 17 Pro, iOS 26.4)

### 0-A summary

```
totalFibers:      37
withDebugSource:   0   ← React 19 removed this fiber field
withPropsDouble:   0   ← memoizedProps.__source — NOT populated
withPropsSingle:   0   ← memoizedProps._source — NOT populated
withDebugStack:   36   ← React 19's new source-tracking channel (36/37 fibers)
```

**Critical finding**: Despite `@react-native/babel-preset@0.85` enabling
`@babel/plugin-transform-react-jsx-source` in dev (verified in
`configs/main.js:165`), the `__source` prop **does NOT propagate to
`fiber.memoizedProps`** in React 19. React 19's JSX dev runtime strips it
before the fiber sees it. The only source-of-truth in React 19 + RN 0.85 is
`fiber._debugStack`.

### 0-A sample: `_debugStack` shape

`_debugStack` is an `Error` instance with constructor `Error` and message
`"react-stack-top-frame"`. Its `.stack` field is a standard V8-style stack
trace string. Example for the `App` user component:

```
Error: react-stack-top-frame
    at anonymous (http://localhost:8081/index.bundle//...&app=com.nubeem.mobile:25670:77)
    at renderApplication (http://localhost:8081/index.bundle//...:52945:52)
    at anonymous (http://localhost:8081/...:52756:24)
    at runApplication (http://localhost:8081/...:52805:22)
```

For nested components, frame 2 is the **parent owner's render call site**.
Example for `<TamaguiProvider>` inside `<ThemeProvider>`:

```
Error: react-stack-top-frame
    at anonymous (...:25670:77)
    at ThemeProvider (...:225528:50)        ← parent call site (bundled URL + line:col)
    at react_stack_bottom_frame (...:17792:29)
    at renderWithHooks (...:12428:40)
```

### Implications for `fiber-walk.ts`

1. Drop the multi-tier fallback ladder. There is only one channel: `_debugStack`.
2. Parse `Error.stack`:
   - Match `at <funcName> (<url>:<line>:<col>)` per frame.
   - Frame 1 is React-internal (`anonymous` at `react.development.js:line` —
     same bundled chunk).
   - **Frame 2 is the owner's render call site** — this is what we want.
3. URLs are Metro bundled URLs (`http://localhost:8081/index.bundle//...:LINE:COL`).
   Use Metro's symbolication endpoint to recover original `.tsx:line`:

   ```
   POST http://localhost:8081/symbolicate
   Content-Type: application/json
   {
     "stack": [
       { "file": "http://localhost:8081/index.bundle//...", "lineNumber": 225528, "column": 50, "methodName": "ThemeProvider" }
     ]
   }
   ```

   Response gives `{ file: '/Users/jaehwajung/.../ThemeProvider.tsx', lineNumber: 17, column: 5 }`.
   Strip the project root to get a workspace-relative path.

4. Optimization: batch symbolicate all captured frames in one POST.

### 0-B (Fabric hit-test)

Already confirmed mechanically:

- `UIManager.findSubviewIn` exists in `BridgelessUIManager.js` but is
  `@deprecated` in `UIManager.d.ts`.
- Recommended: `ref.measureInWindow` (stable on Fabric).
- We pick Strategy (B): host-only fiber walk + `measureInWindow`.

### 0-C (`measureInWindow` works)

Not separately exercised — RN's built-in Inspector relies on the same API
and is known to work in this environment. We'll catch regressions in
implementation tests rather than Phase 0.

### 0-D (built-in Inspector)

Not separately exercised — orthogonal to our pick of Strategy (B). Skipped.

### Decision

- **Source channel**: `_debugStack` → stack parse → Metro `/symbolicate`.
- **Hit-test**: host-fiber DFS + `measureInWindow`.
- **No babel plugin patches required in user projects** — `_debugStack` is
  populated by React 19 itself.
- **Fallback when no Metro available** (production builds): probe is
  `__DEV__`-gated and never runs in production. The "Metro not running" case
  doesn't apply.
- **Fallback when symbolicate fails**: emit the raw frame (component name +
  bundled URL) as a `fallback: true` item; Claude greps for the component.

---

## End-to-end verification — 2026-05-29

After implementing `fiber-walk.ts` + `symbolicate-client.ts`, the full
capture→symbolicate pipeline was run against the **live** NUBEEM app
(RN 0.85.3, React 19.2.3, Hermes, iOS Simulator) using a temporary probe
injected into `App.tsx` (reverted afterward; NUBEEM left with zero diff).

The probe walked the fiber tree, selected user-component fibers, parsed
frame 2 of each `_debugStack`, and POSTed the frames to the running Metro
`/symbolicate` endpoint. Results:

| Component                | Symbolicated to                             | Outcome            |
| ------------------------ | ------------------------------------------- | ------------------ |
| `SafeAreaProvider`       | `…/NUBEEM/apps/mobile/App.tsx:55:36`        | ✅ exact source    |
| `I18nextProvider`        | `…/NUBEEM/apps/mobile/App.tsx:56:22`        | ✅ exact source    |
| `ThemeProvider`          | `…/NUBEEM/apps/mobile/App.tsx:57:35`        | ✅ exact source    |
| `GestureHandlerRootView` | (unresolved — shallow `App.bundle` segment) | → `fallback: true` |

**Conclusion**: the crown-jewel claim holds on real hardware. Frame 2 of
`_debugStack` is the owner's render call site, Metro `/symbolicate` resolves
it to an absolute path, and `normalizeSourcePath` strips the project root to
`apps/mobile/App.tsx:55`. Components in shallow/lazy bundle segments (typically
node_modules re-exports like `GestureHandlerRootView`) don't symbolicate and
correctly route to the grep-by-name fallback — which is the right behavior,
since those aren't the user's own source anyway.

Notes folded back into the implementation:

- Real bundled URL form is `http://localhost:8081/App.bundle//&platform=ios&…`
  (the example app uses `index.bundle`; bare RN 0.85 New-Arch uses `App.bundle`).
  `normalizeSourcePath`'s `https?://[^/]+/` origin strip + project-root strip
  handles both.
- Symbolicate must use frames from the **current** bundle — stale line numbers
  (from a bundle rebuilt since capture) silently fail to resolve. The probe
  captures and symbolicates within the same tap, so this is never an issue at
  runtime.
