/**
 * source-path — normalize absolute / Metro-served paths to workspace-relative.
 *
 * Inputs we see in practice:
 *   - Absolute Mac paths from Metro symbolicate:
 *       /Users/jaehwajung/Desktop/Jay-Project/NUBEEM/apps/mobile/src/.../AIBar.tsx
 *   - Bundled URLs (when symbolicate fails):
 *       http://localhost:8081/index.bundle//&platform=ios&...&app=com.nubeem.mobile
 *   - Webpack-style synthetic prefixes from Turbopack / Next.js dev servers
 *       (web edge case, kept for completeness): `webpack://_N_E/`, `[project]/`, `(turbopack)/`
 *
 * Strategy:
 *   1. Strip URL origin.
 *   2. Strip webpack/turbopack synthetic prefixes.
 *   3. Strip the project root prefix if known.
 *   4. Skip node_modules / unknown paths (return null).
 */

export interface NormalizeOptions {
  /** Absolute project root, e.g. `/Users/jay/Desktop/Jay-Project/NUBEEM`. */
  projectRoot?: string
}

const HTTP_ORIGIN_RE = /^https?:\/\/[^/]+\//
const WEBPACK_RE = /^webpack:\/\/[^/]*\//
const TURBO_PROJECT_RE = /^\[project\]\//
const TURBO_INTERNAL_RE = /^\(turbopack\)\//

export function normalizeSourcePath(rawFile: string, opts: NormalizeOptions = {}): string | null {
  if (!rawFile || typeof rawFile !== 'string') return null

  let p = rawFile

  // 1. Strip URL origin if any.
  p = p.replace(HTTP_ORIGIN_RE, '')

  // 2. Strip webpack/turbopack synthetic prefixes.
  p = p.replace(WEBPACK_RE, '')
  p = p.replace(TURBO_PROJECT_RE, '')
  p = p.replace(TURBO_INTERNAL_RE, '')

  // 3. Strip project root if known.
  if (opts.projectRoot) {
    const root = opts.projectRoot.endsWith('/') ? opts.projectRoot.slice(0, -1) : opts.projectRoot
    if (p.startsWith(root + '/')) {
      p = p.slice(root.length + 1)
    } else if (p === root) {
      return null
    }
  }

  // 4. Skip nothings.
  if (!p) return null
  // Any path inside node_modules is library code, never the user's source —
  // skip it so the symbolicate consumer picks the next (app) frame. Checked on
  // the ORIGINAL absolute path too (a tap often resolves first to an RN
  // primitive like Pressable, whose top frame lives in react-native itself).
  if (p.startsWith('node_modules/') || p.includes('/node_modules/')) return null
  if (rawFile.includes('/node_modules/')) return null
  // Skip Metro bundle URLs that survived (symbolicate failed). The entry
  // bundle is `index.bundle` for most apps but `App.bundle` for bare RN 0.85
  // New-Arch builds, and Metro appends a `.bundle?...` query — match any.
  if (/^[^/]*\.bundle(\?|\/|$)/.test(p)) return null
  // Skip anonymous / unknown
  if (p === 'anonymous' || p === '<?>') return null

  return p
}
