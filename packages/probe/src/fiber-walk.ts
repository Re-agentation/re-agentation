/**
 * Fiber walk — given a tap coordinate, return:
 *   1. The user component under the tap (+ its ancestor chain).
 *   2. Its source location (file + line), resolved via Metro symbolicate.
 *   3. A frame box for the on-screen marker.
 *
 * Strategy (revised 2026-05-29 after on-device testing):
 *
 *   • HIT-TEST = React Native's own native hit-test, reached through the
 *     DevTools hook: `renderer.rendererConfig.getInspectorDataForViewAtPoint`.
 *     This is exactly what RN's built-in Element Inspector uses, so it is the
 *     verified Fabric path. (The earlier approach — measuring every host fiber
 *     with `measureInWindow` and doing JS-side point-in-rect — did not work
 *     reliably on Fabric and is gone.)
 *
 *   • The hit-test requires a root host instance as its first arg (a null
 *     `inspectedView` makes Fabric's `getNodeFromPublicInstance` return null
 *     and the hit-test no-ops). We get it by walking the fiber root's child
 *     chain to the first HostComponent's `stateNode`.
 *
 *   • SOURCE = React 19's `_debugStack` on the touched fiber (the proven
 *     channel from Phase 0), parsed for the owner call-site frame and run
 *     through Metro `/symbolicate`. Falls back to `viewData.componentStack`.
 *     If neither resolves, `source: null` + `fallback: true` (Claude greps).
 *
 *   • TREE / NAME = `viewData.hierarchy` (component-name chain), filtered to
 *     user components.
 */

import type { CapturedElement } from './types'
import { symbolicate, type BundledFrame } from './symbolicate-client'

const HOST_COMPONENT = 5

export interface TapHit {
  x: number
  y: number
}

export interface FiberWalkOptions {
  metroHost: string
  projectRoot?: string
  /** Emit `[re-agentation]` diagnostics to the Metro console. Default false. */
  debug?: boolean
}

/** Extra fields smuggled alongside CapturedElement back to the probe. */
export interface CaptureResult extends CapturedElement {
  fallback: boolean
  markerCoords?: { x: number; y: number; w: number; h: number }
}

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

interface HierarchyItem {
  name?: string | null
  getInspectorData?: unknown
}
interface ViewData {
  hierarchy?: HierarchyItem[]
  closestInstance?: unknown
  closestPublicInstance?: unknown
  componentStack?: string
  frame?: { top: number; left: number; width: number; height: number }
  selectedIndex?: number | null
}

export async function captureAt(
  hit: TapHit,
  options: FiberWalkOptions,
): Promise<CaptureResult | null> {
  const log = (...a: unknown[]) => {
    if (options.debug) console.log('[re-agentation]', ...a)
  }

  const targets = getInspectorTargets()
  if (targets.length === 0) {
    log('capture: no renderer with getInspectorDataForViewAtPoint + root instance')
    return null
  }

  // RN can register several renderers (main surface + dev overlays). Only the
  // one whose tree contains the point fires with data — try each.
  let viewData: ViewData | null = null
  for (const t of targets) {
    viewData = await runHitTest(t.renderer, t.rootInstance, hit.x, hit.y)
    if (viewData && (viewData.hierarchy?.length ?? 0) > 0) break
    viewData = null
  }
  if (!viewData) {
    log('capture: hit-test returned nothing at', hit.x, hit.y)
    return null
  }

  const hierarchy = Array.isArray(viewData.hierarchy) ? viewData.hierarchy : []
  const allNames = hierarchy.map((h) => h?.name).filter((n): n is string => !!n)
  const userNames = allNames.filter(isUserComponentName)
  const tree = userNames.length > 0 ? userNames : allNames
  const component = tree[tree.length - 1] ?? allNames[allNames.length - 1] ?? '<unknown>'
  log('capture: hierarchy', allNames.join(' > '), '| user', tree.join(' > '))

  // Source resolution.
  const fiber = asFiber(viewData.closestInstance)
  const frames = collectSourceFrames(fiber, viewData.componentStack)
  log('capture: source frames', frames.length)

  let source: { file: string; line: number; column?: number } | null = null
  let fallback = true
  if (frames.length > 0) {
    try {
      const sym = await symbolicate(frames, {
        metroHost: options.metroHost,
        projectRoot: options.projectRoot,
      })
      const hitFrame = sym.find((s) => s.file)
      if (hitFrame?.file) {
        source = { file: hitFrame.file, line: hitFrame.lineNumber, column: hitFrame.column }
        fallback = false
      }
      log('capture: symbolicated ->', source ? `${source.file}:${source.line}` : 'no source')
    } catch (e) {
      log('capture: symbolicate threw', String(e))
    }
  }

  const props = fiber?.memoizedProps != null ? shallowSafeProps(fiber.memoizedProps) : {}

  // Prefer the inspected view's measured rect; fall back to a box around the
  // tap point so an empty-region pin still gets a shimmer target (the inspector
  // sometimes returns no frame for a bare container / blank area).
  const markerCoords = viewData.frame
    ? {
        x: viewData.frame.left,
        y: viewData.frame.top,
        w: viewData.frame.width,
        h: viewData.frame.height,
      }
    : { x: hit.x - 60, y: hit.y - 60, w: 120, h: 120 }

  return { component, tree, source, props, fallback, markerCoords }
}

// ─── renderer + root instance ─────────────────────────────────────────────

type Renderer = {
  rendererConfig?: {
    getInspectorDataForViewAtPoint?: (
      inspectedView: unknown,
      x: number,
      y: number,
      cb: (viewData: ViewData) => boolean,
    ) => void
  }
}

function getHook(): any {
  return (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
}

interface InspectorTarget {
  renderer: Renderer
  rootInstance: unknown
}

/**
 * Every renderer that (a) exposes the inspector and (b) has a resolvable root
 * public instance. RN registers multiple renderers (main surface + dev
 * overlays); we try each at hit-test time.
 *
 * On the New Architecture (Fabric), `fiber.stateNode` is the internal handle
 * `{ node, canonical }`, NOT a public instance — and
 * `getInspectorDataForViewAtPoint` calls `getNodeFromPublicInstance(view)`,
 * which returns null for the internal handle (so the native hit-test silently
 * no-ops). The public instance lives at `stateNode.canonical.publicInstance`.
 * Verified on RN 0.85.3 + React 19.2.3 (2026-05-29). Falls back to the raw
 * stateNode for the old architecture (Paper), where stateNode IS the public
 * instance.
 */
function getInspectorTargets(): InspectorTarget[] {
  const hook = getHook()
  const out: InspectorTarget[] = []
  if (!hook?.renderers || !hook?.getFiberRoots) return out
  let entries: Array<[number, unknown]> = []
  try {
    entries = Array.from(hook.renderers as Map<number, unknown>)
  } catch {
    return out
  }
  for (const [id, r] of entries) {
    const renderer = r as Renderer
    if (!renderer?.rendererConfig?.getInspectorDataForViewAtPoint) continue
    let roots: Set<{ current: AnyFiber }> | undefined
    try {
      roots = hook.getFiberRoots(id)
    } catch {
      continue
    }
    const root = roots ? Array.from(roots)[0] : undefined
    if (!root?.current) continue
    let f: AnyFiber | null | undefined = root.current.child
    let guard = 0
    let rootInstance: unknown = null
    while (f && guard++ < 60) {
      if (f.tag === HOST_COMPONENT && f.stateNode) {
        const sn = f.stateNode as { canonical?: { publicInstance?: unknown } }
        rootInstance = sn.canonical?.publicInstance ?? f.stateNode
        break
      }
      f = f.child
    }
    if (rootInstance) out.push({ renderer, rootInstance })
  }
  return out
}

function runHitTest(
  renderer: Renderer,
  rootInstance: unknown,
  x: number,
  y: number,
): Promise<ViewData | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: ViewData | null) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    try {
      renderer.rendererConfig!.getInspectorDataForViewAtPoint!(rootInstance, x, y, (viewData) => {
        finish(viewData)
        return true // stop after first hit
      })
    } catch {
      finish(null)
    }
    // Fabric's findNodeAtPoint callback is async (native round-trip).
    setTimeout(() => finish(null), 600)
  })
}

// ─── source frames ──────────────────────────────────────────────────────

function asFiber(x: unknown): AnyFiber | null {
  if (!x || typeof x !== 'object') return null
  const f = x as AnyFiber
  // Heuristic: a fiber has at least one of these internal fields.
  if ('_debugStack' in f || '_debugOwner' in f || 'memoizedProps' in f || 'tag' in f) return f
  return null
}

/**
 * Gather candidate source frames, best-first:
 *   1. The touched fiber's own `_debugStack` (owner call site = frame 1).
 *   2. Its `_debugOwner`'s `_debugStack` (one level up), in case the leaf is
 *      a host element with no useful stack.
 *   3. The inspector's `componentStack` string.
 */
function collectSourceFrames(fiber: AnyFiber | null, componentStack?: string): BundledFrame[] {
  const out: BundledFrame[] = []
  const pushFrom = (err: Error | null | undefined, skipFirst: boolean) => {
    const fr = parseDebugStack(err)
    // frame 0 is usually react-internal ("anonymous"); the owner call site is
    // frame 1. Keep frame 1 onward, then frame 0 as a last resort.
    if (skipFirst && fr.length > 1) out.push(...fr.slice(1), fr[0]!)
    else out.push(...fr)
  }
  if (fiber?._debugStack) pushFrom(fiber._debugStack, true)
  if (fiber?._debugOwner?._debugStack) pushFrom(fiber._debugOwner._debugStack, true)
  if (componentStack) pushFrom({ stack: componentStack } as Error, false)
  return out
}

// ─── name helpers ─────────────────────────────────────────────────────────

const INTERNAL_NAME_RE =
  /^(?:_?LogBox|DebuggingOverlay|AppContainer|RCT|View$|Text$|ScrollView$|Image$|TextInput$|Pressable$|Touchable\w*|SafeAreaView$|KeyboardAvoidingView$|FlatList$|SectionList$|VirtualizedList\w*|Animated|GestureHandlerRootView$|RNGestureHandler\w*|RNS\w*|Provider$|Consumer$|.*Provider$|.*Context$|withDevTools|ForwardRef|Memo|Suspense|Fragment)/
const ANON_RE = /^anonymous$|^Object$|^<\?>$|^unknown$/

function isUserComponentName(name: string): boolean {
  if (!name) return false
  if (ANON_RE.test(name)) return false
  if (INTERNAL_NAME_RE.test(name)) return false
  return /^[A-Z]/.test(name)
}

// ─── _debugStack parsing (unchanged) ──────────────────────────────────────

const FRAME_PAREN_RE = /^\s*at\s+(\S+)\s+\((.+):(\d+):(\d+)\)\s*$/
const FRAME_NO_PAREN_RE = /^\s*at\s+(.+):(\d+):(\d+)\s*$/

export function parseDebugStack(err: Error | null | undefined): BundledFrame[] {
  if (!err || typeof err !== 'object') return []
  const stack = (err as Error).stack
  if (typeof stack !== 'string') return []

  const frames: BundledFrame[] = []
  for (const line of stack.split('\n')) {
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
        frames.push({ file, lineNumber: Number(lineStr), column: Number(colStr) })
      }
    }
  }
  return frames
}

// ─── props serialization (unchanged) ──────────────────────────────────────

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
  if (Array.isArray(v)) return v.slice(0, 8).map((x) => serializeValue(x, depth + 1))
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
