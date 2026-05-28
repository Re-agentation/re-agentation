/**
 * Fiber walk — given a tap coordinate, return:
 *   1. The user component fiber underneath the tap.
 *   2. Its source location (file + line), resolved via Metro symbolicate.
 *   3. Its user-component ancestor chain (e.g. ["TodayScreen", "AIBar"]).
 *
 * Strategy (decided after Phase 0 validation on 2026-05-29):
 *
 *   • Source channel = React 19's `_debugStack` (an `Error('react-stack-top-frame')`).
 *     Babel's `__source` prop is NOT propagated to fiber.memoizedProps in React 19,
 *     so we don't try it.
 *
 *   • Hit-test = host-fiber DFS + `measureInWindow`. We collect host fibers
 *     (tag === 5 in React 18, the HostComponent constant), measure each, and
 *     pick the smallest box containing the tap.
 *
 *   • From the picked host fiber, walk `_debugOwner` upward and collect
 *     user components (function/class with PascalCase displayName/name) up
 *     to a sane depth.
 *
 *   • For the leaf (closest user component), parse `_debugStack.stack`
 *     frame 2 — this is the owner's render call site — and symbolicate it
 *     to recover the original `.tsx:line`.
 *
 *   • Tree array = displayName chain root→leaf.
 *
 * If symbolicate fails or the stack can't be parsed, return the element
 * with `source: null` and `fallback: true` so Claude can grep by name.
 */

import type { CapturedElement } from './types'
import { symbolicate, type BundledFrame } from './symbolicate-client'

// React fiber tag constants (stable across React 18+).
// Source: react-reconciler ReactWorkTags.js
const HOST_COMPONENT = 5
const HOST_HOIST = 26 // ActivityComponent in some React 19 builds
const HOST_TEXT = 6

export interface TapHit {
  x: number
  y: number
}

export interface FiberWalkOptions {
  /** Metro host base, e.g. `http://localhost:8081`. */
  metroHost: string
  /** Workspace root for source-path normalization. */
  projectRoot?: string
  /** Max parent depth when collecting user components. Default 8. */
  maxDepth?: number
}

// Loose fiber typings — fiber is heavily duck-typed internal data structure.
// We intentionally don't import React internals.
type AnyFiber = {
  tag?: number
  type?: any
  elementType?: any
  stateNode?: any
  child?: AnyFiber | null
  sibling?: AnyFiber | null
  return?: AnyFiber | null
  _debugOwner?: AnyFiber | null
  _debugStack?: Error | null
  memoizedProps?: Record<string, unknown> | null
}

export async function captureAt(
  hit: TapHit,
  options: FiberWalkOptions,
): Promise<CapturedElement | null> {
  const root = getFiberRoot()
  if (!root) return null

  // 1. Collect all host fibers with their boxes.
  const hostFiber = await pickHostFiberAt(root.current, hit)
  if (!hostFiber) return null

  // 2. Walk debug owner chain to find user component ancestors.
  const ownerChain = userComponentChain(hostFiber, options.maxDepth ?? 8)
  if (ownerChain.length === 0) {
    // No user component above this host — give up.
    return null
  }

  const leaf = ownerChain[ownerChain.length - 1]!
  const treeNames = ownerChain.map((f) => displayNameOf(f))

  // 3. Parse _debugStack of the leaf to find its render call site.
  const ownerFrames = parseDebugStack(leaf._debugStack)

  // We want the frame that represents the parent's call to this component,
  // which is typically the SECOND frame (frame 0 = react-internal anonymous,
  // frame 1 = the actual owner's source line).
  const callSiteFrame = ownerFrames[1] ?? ownerFrames[0] ?? null

  // 4. Symbolicate.
  let source: { file: string; line: number; column?: number } | null = null
  let fallback = true
  if (callSiteFrame) {
    try {
      const [sym] = await symbolicate([callSiteFrame], {
        metroHost: options.metroHost,
        projectRoot: options.projectRoot,
      })
      if (sym?.file) {
        source = { file: sym.file, line: sym.lineNumber, column: sym.column }
        fallback = false
      }
    } catch {
      // swallow — fall through to fallback path
    }
  }

  // 5. Build CapturedElement.
  return {
    component: treeNames[treeNames.length - 1] ?? '<unknown>',
    tree: treeNames,
    source,
    props: shallowSafeProps(leaf.memoizedProps),
    // We flag fallback into a separate channel; the consumer of CapturedElement
    // (probe state machine) carries it onto BatchItem.fallback.
    ...({ __fallback: fallback } as any),
  }
}

// ─── helpers ────────────────────────────────────────────────────────────

function getFiberRoot(): { current: AnyFiber } | null {
  const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
  if (!hook?.renderers || !hook?.getFiberRoots) return null
  // Use renderer 1 — the default React renderer in dev. RN registers
  // additional renderers (e.g., react-test-renderer) but #1 is the live one.
  let roots: Set<{ current: AnyFiber }> | undefined
  try {
    roots = hook.getFiberRoots(1)
  } catch {
    return null
  }
  if (!roots) return null
  const arr = Array.from(roots)
  return arr[0] ?? null
}

/**
 * DFS the fiber tree, collect host fibers, measure each, pick the smallest
 * box containing the tap. Returns null if no host fiber matches.
 */
async function pickHostFiberAt(rootFiber: AnyFiber, hit: TapHit): Promise<AnyFiber | null> {
  const hosts: AnyFiber[] = []
  collectHostFibers(rootFiber, hosts)

  type Measured = { fiber: AnyFiber; x: number; y: number; w: number; h: number }
  const measured: Measured[] = []

  // Run all measurements in parallel. measureInWindow is a JNI/Fabric call;
  // running them serially would block for 100ms+ on a busy screen.
  await Promise.all(
    hosts.map(
      (fiber) =>
        new Promise<void>((resolve) => {
          const node = fiber.stateNode
          if (!node || typeof node.measureInWindow !== 'function') {
            resolve()
            return
          }
          let settled = false
          // Safety timeout in case measureInWindow never fires its callback
          // (happens for detached host nodes mid-unmount).
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true
              resolve()
            }
          }, 200)
          try {
            node.measureInWindow((x: number, y: number, w: number, h: number) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              if (
                typeof x === 'number' &&
                typeof y === 'number' &&
                typeof w === 'number' &&
                typeof h === 'number'
              ) {
                measured.push({ fiber, x, y, w, h })
              }
              resolve()
            })
          } catch {
            settled = true
            clearTimeout(timer)
            resolve()
          }
        }),
    ),
  )

  const containing = measured.filter(
    (m) =>
      hit.x >= m.x &&
      hit.x <= m.x + m.w &&
      hit.y >= m.y &&
      hit.y <= m.y + m.h &&
      m.w > 0 &&
      m.h > 0,
  )
  if (containing.length === 0) return null

  // Smallest area = innermost.
  containing.sort((a, b) => a.w * a.h - b.w * b.h)
  return containing[0]!.fiber
}

function collectHostFibers(node: AnyFiber | null | undefined, out: AnyFiber[]): void {
  if (!node) return
  if (node.tag === HOST_COMPONENT || node.tag === HOST_HOIST || node.tag === HOST_TEXT) {
    out.push(node)
  }
  collectHostFibers(node.child, out)
  collectHostFibers(node.sibling, out)
}

/**
 * Walk `_debugOwner` chain from a fiber, returning user components only.
 * "User component" = function or class with a non-anonymous name that isn't
 * a known internal/wrapper.
 *
 * Returns root→leaf order (oldest ancestor first).
 */
export function userComponentChain(start: AnyFiber, maxDepth: number): AnyFiber[] {
  const out: AnyFiber[] = []
  let f: AnyFiber | null | undefined = start
  let depth = 0
  while (f && depth < maxDepth * 4) {
    if (isUserComponent(f)) out.push(f)
    f = f._debugOwner ?? null
    depth++
  }
  // The leaf we tapped first is at out[0]; we want root→leaf.
  return out.reverse().slice(-maxDepth)
}

const INTERNAL_NAME_RE =
  /^(?:_LogBox|LogBox|DebuggingOverlay|AppContainer|NubeemMobile|withI18nextTranslation|Provider|Consumer)/
const ANON_RE = /^anonymous$|^Object$|^<\?>$/

function isUserComponent(f: AnyFiber): boolean {
  const t = f.type ?? f.elementType
  if (!t) return false
  // Function/class component, or wrapper (forwardRef/memo) which is an
  // object with React internals, or a synthetic shape with `displayName`.
  const isFunction = typeof t === 'function'
  const isReactWrapper =
    typeof t === 'object' && t !== null && (t.$$typeof || t.render || t.type || t.displayName)
  if (!isFunction && !isReactWrapper) return false

  const name = displayNameOfRaw(t)
  if (!name) return false
  if (ANON_RE.test(name)) return false
  if (INTERNAL_NAME_RE.test(name)) return false
  // PascalCase guard
  return /^[A-Z]/.test(name)
}

function displayNameOf(f: AnyFiber): string {
  return displayNameOfRaw(f.type ?? f.elementType) ?? '<?>'
}

function displayNameOfRaw(type: any): string | null {
  if (!type) return null
  if (typeof type === 'string') return type
  if (type.displayName) return type.displayName
  if (type.name) return type.name
  // forwardRef / memo wrappers
  if (type.render?.displayName) return type.render.displayName
  if (type.render?.name) return type.render.name
  if (type.type?.displayName) return type.type.displayName
  if (type.type?.name) return type.type.name
  return null
}

// ─── _debugStack parsing ────────────────────────────────────────────────

// Match V8-style "    at <method> (<url>:<line>:<col>)" frames. The URL may
// itself contain `:` (e.g. `http://localhost:8081/...`) so we rely on the
// trailing `:<digits>:<digits>)` to anchor where the URL ends.
const FRAME_PAREN_RE = /^\s*at\s+(\S+)\s+\((.+):(\d+):(\d+)\)\s*$/
// Fallback for frames without parens: "    at <url>:<line>:<col>"
const FRAME_NO_PAREN_RE = /^\s*at\s+(.+):(\d+):(\d+)\s*$/

export function parseDebugStack(err: Error | null | undefined): BundledFrame[] {
  if (!err || typeof err !== 'object') return []
  const stack = (err as Error).stack
  if (typeof stack !== 'string') return []

  const frames: BundledFrame[] = []
  for (const line of stack.split('\n')) {
    // Skip header line ("Error: react-stack-top-frame") which has no `at `.
    if (!/^\s*at\s/.test(line)) continue

    const mParen = FRAME_PAREN_RE.exec(line)
    if (mParen) {
      const [, methodName, file, lineStr, colStr] = mParen
      if (file && lineStr && colStr) {
        frames.push({
          file,
          lineNumber: Number(lineStr),
          column: Number(colStr),
          methodName: methodName || undefined,
        })
        continue
      }
    }
    const mNoParen = FRAME_NO_PAREN_RE.exec(line)
    if (mNoParen) {
      const [, file, lineStr, colStr] = mNoParen
      if (file && lineStr && colStr) {
        frames.push({
          file,
          lineNumber: Number(lineStr),
          column: Number(colStr),
        })
      }
    }
  }
  return frames
}

// ─── props serialization ────────────────────────────────────────────────

function shallowSafeProps(
  props: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!props || typeof props !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children') {
      out.children = Array.isArray(v) ? `[${v.length} children]` : v != null ? '[children]' : null
      continue
    }
    out[k] = serializeValue(v)
  }
  return out
}

function serializeValue(v: unknown, depth = 0): unknown {
  if (v == null) return v
  const t = typeof v
  if (t === 'function') return '[Function]'
  if (t === 'symbol') return v.toString()
  if (t === 'bigint') return (v as bigint).toString() + 'n'
  if (t !== 'object') return v
  if (depth > 1) return '[…]'
  if (Array.isArray(v)) {
    return v.slice(0, 8).map((x) => serializeValue(x, depth + 1))
  }
  const out: Record<string, unknown> = {}
  let count = 0
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (count++ >= 12) {
      out['…'] = `[+${Object.keys(v as object).length - 12} more]`
      break
    }
    out[k] = serializeValue(val, depth + 1)
  }
  return out
}
