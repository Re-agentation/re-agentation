/**
 * @re-agentation/probe — public entry.
 *
 * Everything exported here is dev-only and gated by `__DEV__` inside the
 * implementation. Production builds tree-shake the runtime away (the
 * top-level `if (__DEV__) return null` in <AgentationProbe /> + the
 * `__DEV__` checks in fiber-walk / transport).
 */

export { AgentationProbe } from './AgentationProbe'
export type { AgentationProbeProps, ProbePosition } from './AgentationProbe'

export { resolveMetroHost } from './probe-transport'

// Advanced / testing: programmatic capture at a screen coordinate.
export { captureAt } from './fiber-walk'
export type { CaptureResult, TapHit, FiberWalkOptions } from './fiber-walk'

export type { BatchItem, BatchPayload, CapturedElement, SourceLocation } from './types'
