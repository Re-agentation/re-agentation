/**
 * undo-store — reverts (Undo) or re-applies (Redo) the files an edit changed.
 *
 * Before editing, the apply-watcher stashes the before+after bytes of EVERY
 * file an item changed to
 *   <projectRoot>/<storageDir>/undo/<batchId>/<itemId>.json
 *     = { files: [{ file, before, after }] }
 * where `before`/`after` are the file's content before/after the edit (null
 * means the file didn't exist — undo deletes a created file; redo recreates it).
 *
 * Legacy shapes still accepted: `{ files: [{ file, content }|{ file, deleted }] }`
 * and `{ file, content }` (undo-only).
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'

interface UndoFile {
  file: string
  before?: string | null
  after?: string | null
  /** legacy fields */
  content?: string
  deleted?: boolean
}
export interface UndoStash {
  files?: UndoFile[]
  file?: string
  content?: string
}

export type UndoDirection = 'undo' | 'redo'

export interface UndoResult {
  restored: number
  files: string[]
}

export interface UndoStore {
  stashPath(batchId: string, itemId: string): string
  /** Restore (undo) or re-apply (redo) the stashed files for a batch/item. */
  restore(batchId: string, itemId?: string, direction?: UndoDirection): Promise<UndoResult>
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
function safeId(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`invalid id: ${id}`)
  return id
}

export function createUndoStore(projectRoot: string, storageDir = '.agentation'): UndoStore {
  const root = path.resolve(projectRoot, storageDir, 'undo')

  // Resolve relative paths (the common case) against projectRoot — the Metro
  // process cwd is not guaranteed to be the project root.
  const abs = (f: string): string => (path.isAbsolute(f) ? f : path.resolve(projectRoot, f))

  // The content to write for a given direction (null → the file should not
  // exist at that point, so it is deleted).
  const targetContent = (e: UndoFile, direction: UndoDirection): string | null => {
    if (direction === 'redo') return e.after ?? null
    // undo:
    if (e.deleted) return null // legacy: file was created → delete on undo
    if (typeof e.before === 'string') return e.before
    if (typeof e.content === 'string') return e.content // legacy single-content
    if (e.before === null) return null // new file → delete on undo
    return undefined as unknown as string | null // nothing to do
  }

  const applyFile = async (e: UndoFile, direction: UndoDirection, out: string[]): Promise<void> => {
    const content = targetContent(e, direction)
    if (content === undefined) return
    const target = abs(e.file)
    try {
      if (content === null) {
        await fs.rm(target, { force: true })
      } else {
        await fs.writeFile(target, content, 'utf8')
      }
      out.push(target)
    } catch {
      /* skip — this file can't be reverted/redone */
    }
  }

  const restoreOne = async (
    jsonPath: string,
    direction: UndoDirection,
    out: string[],
  ): Promise<void> => {
    let stash: UndoStash | null = null
    try {
      stash = JSON.parse(await fs.readFile(jsonPath, 'utf8')) as UndoStash
    } catch {
      return
    }
    const entries: UndoFile[] = Array.isArray(stash.files)
      ? stash.files
      : stash.file
        ? [{ file: stash.file, content: stash.content }]
        : []
    for (const e of entries) await applyFile(e, direction, out)
  }

  return {
    stashPath(batchId, itemId) {
      return path.join(root, safeId(batchId), `${safeId(itemId)}.json`)
    },

    async restore(batchId, itemId, direction = 'undo') {
      const dir = path.join(root, safeId(batchId))
      const files: string[] = []
      if (itemId) {
        await restoreOne(path.join(dir, `${safeId(itemId)}.json`), direction, files)
      } else {
        let entries: string[] = []
        try {
          entries = await fs.readdir(dir)
        } catch {
          return { restored: 0, files: [] }
        }
        for (const e of entries) {
          if (e.endsWith('.json')) await restoreOne(path.join(dir, e), direction, files)
        }
      }
      return { restored: files.length, files }
    },
  }
}
