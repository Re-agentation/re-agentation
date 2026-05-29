/**
 * probe-transport — HTTP client from the RN app to the Metro middleware.
 *
 * Auto-resolves Metro host from `NativeModules.SourceCode.scriptURL` so
 * iOS sim (`localhost`), Android emulator (`10.0.2.2`), and real device
 * (LAN IP) all work without configuration.
 */

import type { BatchPayload } from './types'

const FALLBACK_HOST = 'http://localhost:8081'

let cachedMetroHost: string | null = null

/**
 * Returns the origin of the Metro server as seen from inside the RN app.
 * Reads `NativeModules.SourceCode.scriptURL` once and caches.
 *
 * NOTE: This intentionally returns a string with no trailing slash.
 */
export function resolveMetroHost(override?: string): string {
  if (override) return override.replace(/\/$/, '')
  if (cachedMetroHost) return cachedMetroHost

  try {
    // Lazy require so unit tests don't blow up.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native')
    const scriptUrl: unknown = rn?.NativeModules?.SourceCode?.scriptURL
    if (typeof scriptUrl === 'string') {
      // scriptURL looks like:
      //   http://localhost:8081/index.bundle//&platform=ios&dev=true&...
      //   http://10.0.2.2:8081/index.bundle//&platform=android&...
      const m = /^(https?:\/\/[^/]+)\//.exec(scriptUrl)
      if (m && m[1]) {
        cachedMetroHost = m[1]
        return cachedMetroHost
      }
    }
  } catch {
    // ignore
  }

  cachedMetroHost = FALLBACK_HOST
  return cachedMetroHost
}

export interface TransportOptions {
  hostOverride?: string
  /** Retry policy. Defaults: 3 attempts, exp backoff (300, 900, 2700ms). */
  maxRetries?: number
  fetchImpl?: typeof fetch
}

export interface SendResult {
  ok: boolean
  attempts: number
  error?: string
}

export async function sendBatch(
  payload: BatchPayload,
  opts: TransportOptions = {},
): Promise<SendResult> {
  const host = resolveMetroHost(opts.hostOverride)
  const url = `${host}/__agentation__/batch`
  const fetchImpl = opts.fetchImpl ?? fetch
  const maxRetries = opts.maxRetries ?? 3

  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        return { ok: true, attempts: attempt }
      }
      // 4xx (other than 413) → permanent failure, don't retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 413) {
        return { ok: false, attempts: attempt, error: `metro ${res.status}` }
      }
      lastError = `metro ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    // Backoff
    if (attempt < maxRetries) {
      await sleep(300 * Math.pow(3, attempt - 1))
    }
  }
  return { ok: false, attempts: maxRetries, error: String(lastError) }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export type ItemStatus = 'queued' | 'processing' | 'done'

export interface BatchStatus {
  found: boolean
  fetchedAt: string | null
  items: Array<{ id: string; status: ItemStatus }>
}

/**
 * Poll a batch's live per-item status from the Metro middleware. When the
 * batch is fully acked + archived, the middleware reports `found: false`,
 * which the caller should treat as "all items done".
 */
export async function getBatchStatus(
  batchId: string,
  opts: TransportOptions = {},
): Promise<BatchStatus | null> {
  const host = resolveMetroHost(opts.hostOverride)
  const fetchImpl = opts.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(
      `${host}/__agentation__/status?batchId=${encodeURIComponent(batchId)}`,
      { method: 'GET' },
    )
    if (!res.ok) return null
    return (await res.json()) as BatchStatus
  } catch {
    return null
  }
}

/** Cancel (remove) a batch from the Metro queue so it is never processed. */
export async function cancelBatch(batchId: string, opts: TransportOptions = {}): Promise<boolean> {
  const host = resolveMetroHost(opts.hostOverride)
  const fetchImpl = opts.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(`${host}/__agentation__/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batchId }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Revert a batch's edits (restore the stashed original files). */
export async function undoBatch(batchId: string, opts: TransportOptions = {}): Promise<boolean> {
  const host = resolveMetroHost(opts.hostOverride)
  const fetchImpl = opts.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(`${host}/__agentation__/undo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batchId }),
    })
    return res.ok
  } catch {
    return false
  }
}

export interface HistoryEntry {
  id: string
  ts: string
  batchId: string
  itemId: string
  component: string
  comment: string
  file?: string | null
  line?: number | null
  route?: string | null
  changedFiles?: string[]
  status?: EntryStatus
  statusAt?: string
  undone?: boolean // legacy
}

export type EntryStatus = 'applied' | 'undone' | 'failed'
export type HistoryStatus = 'all' | EntryStatus

/** Effective status of an entry (tolerates legacy `undone` flag). */
export function entryStatus(e: HistoryEntry): EntryStatus {
  return e.status ?? (e.undone ? 'undone' : 'applied')
}

export interface HistoryQuery extends TransportOptions {
  /** Page size (default 10). */
  limit?: number
  /** Entries to skip (for infinite scroll). */
  offset?: number
  /** Filter by prompt/component substring. */
  q?: string
  /** Filter by applied vs undone (default 'all'). */
  status?: HistoryStatus
}

/** Fetch a page of applied-change history (newest first). */
export async function getHistory(opts: HistoryQuery = {}): Promise<HistoryEntry[]> {
  const host = resolveMetroHost(opts.hostOverride)
  const fetchImpl = opts.fetchImpl ?? fetch
  const params = new URLSearchParams()
  params.set('limit', String(opts.limit ?? 10))
  params.set('offset', String(opts.offset ?? 0))
  if (opts.q?.trim()) params.set('q', opts.q.trim())
  if (opts.status && opts.status !== 'all') params.set('status', opts.status)
  try {
    const res = await fetchImpl(`${host}/__agentation__/history?${params.toString()}`, {
      method: 'GET',
    })
    if (!res.ok) return []
    const data = (await res.json()) as { entries?: HistoryEntry[] }
    return data.entries ?? []
  } catch {
    return []
  }
}

/** Build the served URL for a history before/after image. */
export function historyImageUrl(
  entryId: string,
  which: 'before' | 'after',
  opts: TransportOptions = {},
): string {
  const host = resolveMetroHost(opts.hostOverride)
  return `${host}/__agentation__/history/${entryId}/${which}.png`
}

/**
 * Undo a single history entry (restore the original of every file it changed).
 * `restored` is the number of files reverted — 0 means there was nothing to
 * revert (e.g. a legacy entry recorded before multi-file undo existed).
 */
export async function undoHistory(
  entryId: string,
  opts: TransportOptions = {},
): Promise<{ ok: boolean; restored: number; legacy?: boolean; route?: string | null }> {
  const host = resolveMetroHost(opts.hostOverride)
  const fetchImpl = opts.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(`${host}/__agentation__/history/${entryId}/undo`, { method: 'POST' })
    if (!res.ok) return { ok: false, restored: 0 }
    const data = (await res.json()) as { route?: string | null; restored?: number; legacy?: boolean }
    return { ok: true, restored: data.restored ?? 0, legacy: data.legacy, route: data.route ?? null }
  } catch {
    return { ok: false, restored: 0 }
  }
}

/** Re-apply a previously-undone entry (Redo). `restored` = files re-applied. */
export async function redoHistory(
  entryId: string,
  opts: TransportOptions = {},
): Promise<{ ok: boolean; restored: number; route?: string | null }> {
  const host = resolveMetroHost(opts.hostOverride)
  const fetchImpl = opts.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(`${host}/__agentation__/history/${entryId}/redo`, { method: 'POST' })
    if (!res.ok) return { ok: false, restored: 0 }
    const data = (await res.json()) as { route?: string | null; restored?: number }
    return { ok: true, restored: data.restored ?? 0, route: data.route ?? null }
  } catch {
    return { ok: false, restored: 0 }
  }
}

/** Permanently delete one or more history entries. */
export async function deleteHistory(
  entryIds: string[],
  opts: TransportOptions = {},
): Promise<{ ok: boolean; deleted: number }> {
  const host = resolveMetroHost(opts.hostOverride)
  const fetchImpl = opts.fetchImpl ?? fetch
  let deleted = 0
  for (const id of entryIds) {
    try {
      const res = await fetchImpl(`${host}/__agentation__/history/${id}`, { method: 'DELETE' })
      if (res.ok) deleted++
    } catch {
      /* skip */
    }
  }
  return { ok: deleted === entryIds.length, deleted }
}

/** Upload a base64 media attachment; returns its served URL. */
export async function uploadMedia(
  args: { batchId: string; base64: string; ext: string; kind: 'image' | 'video' },
  opts: TransportOptions = {},
): Promise<string | null> {
  const host = resolveMetroHost(opts.hostOverride)
  const fetchImpl = opts.fetchImpl ?? fetch
  try {
    const res = await fetchImpl(`${host}/__agentation__/media`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { url?: string }
    return data.url ?? null
  } catch {
    return null
  }
}
