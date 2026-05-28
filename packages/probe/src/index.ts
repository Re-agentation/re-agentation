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

export type { BatchItem, BatchPayload, CapturedElement, SourceLocation } from './types'
