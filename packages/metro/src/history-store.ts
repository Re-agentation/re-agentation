/**
 * history-store — lists applied-change history with before/after screenshots.
 *
 * The apply-watcher writes each entry to
 *   <projectRoot>/<storageDir>/history/<entryId>/
 *     before.png, after.png, meta.json
 * meta.json = { id, ts, batchId, itemId, component, comment, file, line, route? }
 *
 * This store lists entries (newest first) and serves the PNGs. Undo is
 * delegated to the undo-store via (batchId, itemId) on the meta.
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'

/** Per-entry lifecycle: applied (in effect) · undone (reverted) · failed (undo failed). */
export type EntryStatus = 'applied' | 'undone' | 'failed'
/** Filter value (adds 'all'). */
export type HistoryStatus = 'all' | EntryStatus

export interface HistoryMeta {
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
  /** legacy flag (pre-status); read as status='undone'. */
  undone?: boolean
}

/** Effective status of an entry, tolerating legacy shapes. */
export function entryStatus(m: HistoryMeta): EntryStatus {
  return m.status ?? (m.undone ? 'undone' : 'applied')
}

export interface HistoryListOptions {
  /** Page size (default 10). */
  limit?: number
  /** Number of (filtered, newest-first) entries to skip. */
  offset?: number
  /** Case-insensitive substring match against comment + component. */
  query?: string
  /** Filter by lifecycle status (default 'all'). */
  status?: HistoryStatus
}

export interface HistoryStore {
  entryDir(entryId: string): string
  list(opts?: HistoryListOptions): Promise<HistoryMeta[]>
  readImage(entryId: string, which: 'before' | 'after'): Promise<Buffer | null>
  getMeta(entryId: string): Promise<HistoryMeta | null>
  /** Set an entry's lifecycle status (applied / undone / failed). */
  markStatus(entryId: string, status: EntryStatus, at: string): Promise<void>
  /** Permanently delete a history entry. Returns true if it existed. */
  deleteEntry(entryId: string): Promise<boolean>
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
function safeId(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`invalid id: ${id}`)
  return id
}

export function createHistoryStore(projectRoot: string, storageDir = '.agentation'): HistoryStore {
  const root = path.resolve(projectRoot, storageDir, 'history')

  return {
    entryDir(entryId) {
      return path.join(root, safeId(entryId))
    },

    async getMeta(entryId) {
      try {
        const raw = await fs.readFile(path.join(root, safeId(entryId), 'meta.json'), 'utf8')
        return JSON.parse(raw) as HistoryMeta
      } catch {
        return null
      }
    },

    async markStatus(entryId, status, at) {
      try {
        const metaPath = path.join(root, safeId(entryId), 'meta.json')
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as HistoryMeta
        meta.status = status
        meta.statusAt = at
        meta.undone = status === 'undone' // keep legacy flag consistent
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2))
      } catch {
        /* entry gone — ignore */
      }
    },

    async deleteEntry(entryId) {
      try {
        await fs.rm(path.join(root, safeId(entryId)), { recursive: true, force: true })
        return true
      } catch {
        return false
      }
    },

    async list(opts = {}) {
      const { limit = 10, offset = 0, query, status = 'all' } = opts
      let dirs: string[] = []
      try {
        dirs = await fs.readdir(root)
      } catch {
        return []
      }
      const metas: HistoryMeta[] = []
      for (const d of dirs) {
        try {
          const raw = await fs.readFile(path.join(root, d, 'meta.json'), 'utf8')
          metas.push(JSON.parse(raw) as HistoryMeta)
        } catch {
          /* skip incomplete entry */
        }
      }
      metas.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)) // newest first
      const q = query?.trim().toLowerCase()
      const filtered = metas.filter((m) => {
        if (status !== 'all' && entryStatus(m) !== status) return false
        if (q && !(m.comment?.toLowerCase().includes(q) || m.component?.toLowerCase().includes(q)))
          return false
        return true
      })
      return filtered.slice(offset, offset + limit)
    },

    async readImage(entryId, which) {
      try {
        return await fs.readFile(path.join(root, safeId(entryId), `${which}.png`))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw err
      }
    },
  }
}
