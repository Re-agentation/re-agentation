/**
 * Queue — JSONL-backed batch queue with ack/archive semantics.
 *
 * Layout under `<projectRoot>/<storageDir>/`:
 *   queue.jsonl       — inflight (unacked) batches, one per line
 *   archive/YYYY-MM-DD.jsonl — fully-acked batches, daily-rotated
 *
 * Each line is a `QueueEntry`. `inflightItemIds` starts as the full set of
 * item ids and is whittled down by `ack`. When it becomes empty, the entry
 * moves to today's archive file.
 *
 * Concurrency: a single in-process mutex serializes writes. Metro is single-
 * process anyway, so this is sufficient. We do NOT use file locks across
 * processes — a second Re-agentation middleware in the same project would
 * be a misconfiguration, not a use case to support.
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'

export interface QueueEntry {
  batchId: string
  ts: string
  /** Full batch payload as received from the probe. Treated as opaque here. */
  payload: unknown
  /** Every item id in the batch (immutable). Used to compute per-item status. */
  allItemIds: string[]
  /** Items still awaiting ack. Initially all item ids from the batch. */
  inflightItemIds: string[]
  /** Set when the MCP server first fetches this batch (Claude picked it up). */
  fetchedAt?: string | null
}

/** Per-item live status for the probe's progress UI. */
export type ItemStatus = 'queued' | 'processing' | 'done'

export interface BatchStatus {
  found: boolean
  fetchedAt: string | null
  items: Array<{ id: string; status: ItemStatus }>
}

export interface AckRequest {
  batchId: string
  /** When omitted, ack the whole batch. */
  itemIds?: string[]
}

export interface AckResult {
  archived: boolean
  remainingItemIds: string[]
}

export interface Queue {
  appendBatch(payload: {
    batchId: string
    ts?: string
    items: Array<{ id: string }>
  }): Promise<QueueEntry>
  listRecent(sinceIsoTs?: string, limit?: number): Promise<QueueEntry[]>
  ack(req: AckRequest): Promise<AckResult>
  /** Mark a batch as picked up by the agent (flips its items to 'processing'). */
  markFetched(batchId: string): Promise<void>
  /** Live per-item status for the probe's progress UI. */
  getStatus(batchId: string): Promise<BatchStatus>
  /** Remove a batch from the queue without archiving (user cancelled). */
  cancel(batchId: string): Promise<{ cancelled: boolean }>
  health(): Promise<{ ok: true; inflight: number }>
}

export function createQueue(projectRoot: string, storageDir = '.agentation'): Queue {
  const baseDir = path.resolve(projectRoot, storageDir)
  const queuePath = path.join(baseDir, 'queue.jsonl')
  const archiveDir = path.join(baseDir, 'archive')

  // Single-flight mutex for write operations.
  let writeChain: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = writeChain.then(fn, fn)
    // Don't let a rejection kill the chain.
    writeChain = next.catch(() => undefined)
    return next
  }

  const ensureDirs = async (): Promise<void> => {
    await fs.mkdir(baseDir, { recursive: true })
    await fs.mkdir(archiveDir, { recursive: true })
  }

  const readAllEntries = async (): Promise<QueueEntry[]> => {
    try {
      const raw = await fs.readFile(queuePath, 'utf8')
      const out: QueueEntry[] = []
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          out.push(JSON.parse(trimmed) as QueueEntry)
        } catch {
          // Skip malformed lines rather than crash. They'll be GC'd on next rewrite.
        }
      }
      return out
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }

  const writeAllEntries = async (entries: QueueEntry[]): Promise<void> => {
    const tmp = `${queuePath}.tmp-${process.pid}-${Date.now()}`
    const body = entries.length === 0 ? '' : entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
    await fs.writeFile(tmp, body, 'utf8')
    await fs.rename(tmp, queuePath)
  }

  const archive = async (entry: QueueEntry): Promise<void> => {
    const day = entry.ts.slice(0, 10) || new Date().toISOString().slice(0, 10)
    const archivePath = path.join(archiveDir, `${day}.jsonl`)
    await fs.appendFile(archivePath, JSON.stringify(entry) + '\n', 'utf8')
  }

  return {
    async appendBatch(payload) {
      return enqueue(async () => {
        await ensureDirs()
        const ids = payload.items.map((it) => it.id)
        const entry: QueueEntry = {
          batchId: payload.batchId,
          ts: payload.ts ?? new Date().toISOString(),
          payload,
          allItemIds: ids,
          inflightItemIds: ids.slice(),
          fetchedAt: null,
        }
        await fs.appendFile(queuePath, JSON.stringify(entry) + '\n', 'utf8')
        return entry
      })
    },

    async listRecent(sinceIsoTs, limit = 50) {
      const entries = await readAllEntries()
      const filtered = sinceIsoTs ? entries.filter((e) => e.ts > sinceIsoTs) : entries
      // Oldest-first, capped.
      return filtered.slice(0, limit)
    },

    async ack(req) {
      return enqueue(async () => {
        const entries = await readAllEntries()
        const idx = entries.findIndex((e) => e.batchId === req.batchId)
        if (idx < 0) {
          return { archived: false, remainingItemIds: [] }
        }
        const entry = entries[idx]!
        let nextInflight: string[]
        if (!req.itemIds || req.itemIds.length === 0) {
          // Whole-batch ack.
          nextInflight = []
        } else {
          const ackedSet = new Set(req.itemIds)
          nextInflight = entry.inflightItemIds.filter((id) => !ackedSet.has(id))
        }
        if (nextInflight.length === 0) {
          // Move to archive.
          await archive(entry)
          const next = entries.slice()
          next.splice(idx, 1)
          await writeAllEntries(next)
          return { archived: true, remainingItemIds: [] }
        }
        const updatedEntry: QueueEntry = { ...entry, inflightItemIds: nextInflight }
        const next = entries.slice()
        next[idx] = updatedEntry
        await writeAllEntries(next)
        return { archived: false, remainingItemIds: nextInflight }
      })
    },

    async markFetched(batchId) {
      return enqueue(async () => {
        const entries = await readAllEntries()
        const idx = entries.findIndex((e) => e.batchId === batchId)
        if (idx < 0) return
        if (entries[idx]!.fetchedAt) return // already marked
        entries[idx] = { ...entries[idx]!, fetchedAt: new Date().toISOString() }
        await writeAllEntries(entries)
      })
    },

    async getStatus(batchId) {
      const entries = await readAllEntries()
      const entry = entries.find((e) => e.batchId === batchId)
      if (!entry) {
        // Not in the live queue → fully acked + archived → everything done.
        return { found: false, fetchedAt: null, items: [] }
      }
      const inflight = new Set(entry.inflightItemIds)
      const items = entry.allItemIds.map((id) => {
        let status: ItemStatus
        if (!inflight.has(id)) status = 'done'
        else if (entry.fetchedAt) status = 'processing'
        else status = 'queued'
        return { id, status }
      })
      return { found: true, fetchedAt: entry.fetchedAt ?? null, items }
    },

    async cancel(batchId) {
      return enqueue(async () => {
        const entries = await readAllEntries()
        const next = entries.filter((e) => e.batchId !== batchId)
        if (next.length === entries.length) return { cancelled: false }
        await writeAllEntries(next)
        return { cancelled: true }
      })
    },

    async health() {
      const entries = await readAllEntries()
      return { ok: true, inflight: entries.length }
    },
  }
}
