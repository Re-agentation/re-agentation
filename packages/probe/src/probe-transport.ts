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
