/**
 * symbolicate-client — wraps Metro's `/symbolicate` endpoint so we can turn
 * a bundled URL+line+col back into an original `<workspace-relative>:line`.
 *
 * Metro's symbolicate is the standard RN debugging endpoint:
 *
 *   POST <metroHost>/symbolicate
 *   { stack: [{ file, lineNumber, column, methodName? }, ...] }
 *   → { stack: [{ file, lineNumber, column, methodName }, ...] }
 *
 * `file` in the response is an absolute path on the developer's machine.
 * We strip the longest common prefix with the runtime-discovered project
 * root to get a `apps/mobile/src/.../File.tsx` style result.
 */

import { normalizeSourcePath } from './source-path'

export interface BundledFrame {
  /** Bundled URL, e.g. `http://localhost:8081/index.bundle//...&app=...`. */
  file: string
  lineNumber: number
  column: number
  methodName?: string
}

export interface SymbolicatedFrame {
  /** Workspace-relative path, e.g. `apps/mobile/src/screens/today/AIBar.tsx`. */
  file: string | null
  /** Absolute path as returned by Metro (kept for debugging). */
  absoluteFile: string | null
  lineNumber: number
  column: number
  methodName: string | null
}

export interface SymbolicateOptions {
  metroHost: string
  projectRoot?: string
  fetchImpl?: typeof fetch
  /** Per-call timeout. Default 4000ms. */
  timeoutMs?: number
}

export async function symbolicate(
  frames: BundledFrame[],
  options: SymbolicateOptions,
): Promise<SymbolicatedFrame[]> {
  if (frames.length === 0) return []

  const { metroHost, projectRoot, fetchImpl = fetch, timeoutMs = 4000 } = options
  const url = `${metroHost.replace(/\/$/, '')}/symbolicate`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let raw: unknown
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stack: frames }),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`symbolicate ${res.status}`)
    }
    raw = await res.json()
  } finally {
    clearTimeout(timer)
  }

  const stack = (raw as { stack?: unknown[] })?.stack
  if (!Array.isArray(stack)) {
    return frames.map((f) => ({
      file: null,
      absoluteFile: null,
      lineNumber: f.lineNumber,
      column: f.column,
      methodName: f.methodName ?? null,
    }))
  }

  return stack.map((entry, i) => {
    const e = entry as Partial<BundledFrame> & { file?: string }
    const absoluteFile = e.file ?? null
    const file = absoluteFile ? normalizeSourcePath(absoluteFile, { projectRoot }) : null
    const orig = frames[i]
    return {
      file,
      absoluteFile,
      lineNumber: e.lineNumber ?? orig?.lineNumber ?? 0,
      column: e.column ?? orig?.column ?? 0,
      methodName: e.methodName ?? orig?.methodName ?? null,
    }
  })
}
