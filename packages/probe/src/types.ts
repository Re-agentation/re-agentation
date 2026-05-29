/**
 * Shared types for probe / metro / mcp.
 *
 * Keep this file dependency-free so it can be re-published as
 * `@re-agentation/types` if we ever split it out.
 */

export interface SourceLocation {
  /** Workspace-relative path, e.g. `apps/mobile/src/screens/today/AIBar.tsx`. */
  file: string
  line: number
  column?: number
}

export interface CapturedElement {
  /** Component display name, e.g. `AIBar`. */
  component: string
  /** User-component chain root→leaf, e.g. `["TodayScreen", "TodayHeader", "AIBar"]`. */
  tree: string[]
  /** Resolved source location (may be `null` if all probe fallbacks fail). */
  source: SourceLocation | null
  /** A shallow, JSON-safe snapshot of memoizedProps. Functions become `"[Function]"`. */
  props: Record<string, unknown>
}

export interface MediaAttachment {
  type: 'image' | 'video'
  /** Metro-served URL, e.g. `http://host/__agentation__/media/<batchId>/<file>`. */
  url: string
  name?: string
}

export interface BatchItem {
  id: string
  element: CapturedElement
  comment: string
  /** `true` if source could not be resolved and Claude should grep by `component` + `tree`. */
  fallback: boolean
  /** Local absolute coords (logical pixels) used for marker rendering. */
  markerCoords?: { x: number; y: number; w: number; h: number }
  /** URL to a PNG screenshot of the component, served by the Metro middleware. */
  screenshotUrl?: string
  /** User-attached reference images/videos that guide the edit. */
  media?: MediaAttachment[]
  /** Best-effort current navigation route name, for history deep-link nav. */
  route?: string | null
}

export interface BatchPayload {
  batchId: string
  ts: string
  platform: 'ios' | 'android'
  /** Best-effort screen name from the closest screen-like ancestor in the tree. */
  screenHint?: string
  items: BatchItem[]
}
