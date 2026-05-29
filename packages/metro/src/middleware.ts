/**
 * createMiddleware — returns a Metro `enhanceMiddleware` wrapper that
 * mounts Re-agentation endpoints under `/__agentation__/` and passes all
 * other requests through to whatever middleware Metro already had.
 *
 * Endpoints:
 *   POST /__agentation__/batch                  → queue.appendBatch
 *   POST /__agentation__/snapshot               → snapshot.save
 *   GET  /__agentation__/snapshot/<batch>/<item>.png  → snapshot.read
 *   GET  /__agentation__/queue/recent?since=ts&limit=n
 *   POST /__agentation__/ack                    → queue.ack
 *   GET  /__agentation__/health                 → liveness
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import * as path from 'node:path'

import { BodyParseError, BodyTooLargeError, readJsonBody } from './read-body'
import { createQueue, type Queue } from './queue'
import { createSnapshotStore, type SnapshotStore } from './snapshot-store'
import { contentTypeFor, createMediaStore, type MediaStore } from './media-store'
import { createUndoStore, type UndoStore } from './undo-store'
import { createHistoryStore, type HistoryStore } from './history-store'

export interface MiddlewareOptions {
  /** Project root for storing queue/snapshots. Defaults to `process.cwd()`. */
  projectRoot?: string
  /** Subdirectory name under projectRoot. Defaults to `.agentation`. */
  storageDir?: string
  /** Verbose logging to Metro stdout. Defaults to `true`. */
  verbose?: boolean
  /** Inject your own queue (tests). */
  queue?: Queue
  /** Inject your own snapshot store (tests). */
  snapshotStore?: SnapshotStore
}

type NextFn = (err?: unknown) => void
type Middleware = (req: IncomingMessage, res: ServerResponse, next: NextFn) => void

const PREFIX = '/__agentation__/'

const SNAPSHOT_PATH_RE = /^\/__agentation__\/snapshot\/([^/]+)\/([^/]+)\.png$/
const MEDIA_PATH_RE = /^\/__agentation__\/media\/([^/]+)\/([^/]+)$/
const HISTORY_IMG_RE = /^\/__agentation__\/history\/([^/]+)\/(before|after)\.png$/
const HISTORY_UNDO_RE = /^\/__agentation__\/history\/([^/]+)\/undo$/
const HISTORY_REDO_RE = /^\/__agentation__\/history\/([^/]+)\/redo$/
const HISTORY_DELETE_RE = /^\/__agentation__\/history\/([^/]+)$/

export function createMiddleware(options: MiddlewareOptions = {}): (inner: unknown) => Middleware {
  const projectRoot = options.projectRoot ?? process.cwd()
  const storageDir = options.storageDir ?? '.agentation'
  const verbose = options.verbose ?? true
  const queue = options.queue ?? createQueue(projectRoot, storageDir)
  const snapshotStore = options.snapshotStore ?? createSnapshotStore(projectRoot, storageDir)
  const mediaStore: MediaStore = createMediaStore(projectRoot, storageDir)
  const undoStore: UndoStore = createUndoStore(projectRoot, storageDir)
  const historyStore: HistoryStore = createHistoryStore(projectRoot, storageDir)

  const log = (...args: unknown[]): void => {
    if (verbose) console.log('[re-agentation]', ...args)
  }

  return (inner: unknown) => {
    const innerMw = typeof inner === 'function' ? (inner as Middleware) : null

    return (req, res, next) => {
      const url = req.url ?? ''
      if (!url.startsWith(PREFIX)) {
        if (innerMw) return innerMw(req, res, next)
        return next()
      }

      // Strip query string for routing.
      const qIdx = url.indexOf('?')
      const route = qIdx >= 0 ? url.slice(0, qIdx) : url
      const query = qIdx >= 0 ? new URLSearchParams(url.slice(qIdx + 1)) : new URLSearchParams()

      // Dispatch
      handleRoute(req, res, route, query).catch((err) => {
        log('error in', route, err)
        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'internal', message: String(err?.message ?? err) }))
        }
      })
    }
  }

  async function handleRoute(
    req: IncomingMessage,
    res: ServerResponse,
    route: string,
    query: URLSearchParams,
  ): Promise<void> {
    const method = req.method?.toUpperCase() ?? 'GET'

    // Snapshot serve (must come before generic POST snapshot).
    if (method === 'GET' && SNAPSHOT_PATH_RE.test(route)) {
      const m = SNAPSHOT_PATH_RE.exec(route)!
      const buf = await snapshotStore.read({ batchId: m[1]!, itemId: m[2]! })
      if (!buf) return notFound(res)
      return sendBuffer(res, buf, 'image/png')
    }

    // Media serve.
    if (method === 'GET' && MEDIA_PATH_RE.test(route)) {
      const m = MEDIA_PATH_RE.exec(route)!
      const buf = await mediaStore.read({ batchId: m[1]!, file: m[2]! })
      if (!buf) return notFound(res)
      return sendBuffer(res, buf, contentTypeFor(m[2]!))
    }

    // History image serve.
    if (method === 'GET' && HISTORY_IMG_RE.test(route)) {
      const m = HISTORY_IMG_RE.exec(route)!
      const buf = await historyStore.readImage(m[1]!, m[2] as 'before' | 'after')
      if (!buf) return notFound(res)
      return sendBuffer(res, buf, 'image/png')
    }

    // Per-entry history undo.
    if (method === 'POST' && HISTORY_UNDO_RE.test(route)) {
      const id = HISTORY_UNDO_RE.exec(route)![1]!
      const meta = await historyStore.getMeta(id)
      if (!meta) return notFound(res)
      // Legacy entries (no changedFiles) have a stale single-file stash that
      // could revert the wrong file — refuse and mark Failed instead.
      if (!meta.changedFiles || meta.changedFiles.length === 0) {
        await historyStore.markStatus(id, 'failed', new Date().toISOString())
        log(`history undo ${id} → legacy entry, marked failed`)
        return json(res, 200, { restored: 0, files: [], legacy: true, route: null })
      }
      const result = await undoStore.restore(meta.batchId, meta.itemId, 'undo')
      await historyStore.markStatus(
        id,
        result.restored > 0 ? 'undone' : 'failed',
        new Date().toISOString(),
      )
      log(`history undo ${id} → restored ${result.restored} file(s)`)
      return json(res, 200, { ...result, route: meta.route ?? null })
    }

    if (method === 'POST' && HISTORY_REDO_RE.test(route)) {
      const id = HISTORY_REDO_RE.exec(route)![1]!
      const meta = await historyStore.getMeta(id)
      if (!meta) return notFound(res)
      const result = await undoStore.restore(meta.batchId, meta.itemId, 'redo')
      if (result.restored > 0) await historyStore.markStatus(id, 'applied', new Date().toISOString())
      log(`history redo ${id} → re-applied ${result.restored} file(s)`)
      return json(res, 200, { ...result, route: meta.route ?? null })
    }

    if (method === 'DELETE' && HISTORY_DELETE_RE.test(route)) {
      const id = HISTORY_DELETE_RE.exec(route)![1]!
      const ok = await historyStore.deleteEntry(id)
      log(`history delete ${id} → ${ok ? 'ok' : 'not found'}`)
      return json(res, ok ? 200 : 404, { deleted: ok })
    }

    switch (`${method} ${route}`) {
      case 'GET /__agentation__/history': {
        const limNum = Number(query.get('limit'))
        const offNum = Number(query.get('offset'))
        const limit = Number.isFinite(limNum) && limNum > 0 ? limNum : 10
        const offset = Number.isFinite(offNum) && offNum > 0 ? offNum : 0
        const queryStr = query.get('q') ?? undefined
        const statusParam = query.get('status')
        const status =
          statusParam === 'applied' || statusParam === 'undone' || statusParam === 'failed'
            ? statusParam
            : 'all'
        return json(res, 200, {
          entries: await historyStore.list({ limit, offset, query: queryStr, status }),
        })
      }

      case 'POST /__agentation__/media':
        return handleMedia(req, res)

      case 'POST /__agentation__/undo':
        return handleUndo(req, res)

      case 'GET /__agentation__/health':
        return json(res, 200, await queue.health())

      case 'POST /__agentation__/batch':
        return handleBatch(req, res)

      case 'POST /__agentation__/snapshot':
        return handleSnapshot(req, res)

      case 'GET /__agentation__/queue/recent': {
        const since = query.get('since') ?? undefined
        const limit = query.get('limit') ? Number(query.get('limit')) : 50
        const entries = await queue.listRecent(since, isFinite(limit) ? limit : 50)
        return json(res, 200, { entries })
      }

      case 'POST /__agentation__/ack':
        return handleAck(req, res)

      case 'GET /__agentation__/status': {
        const batchId = query.get('batchId')
        if (!batchId) return json(res, 400, { error: 'invalid', message: 'batchId required' })
        return json(res, 200, await queue.getStatus(batchId))
      }

      case 'POST /__agentation__/fetched':
        return handleFetched(req, res)

      case 'POST /__agentation__/cancel':
        return handleCancel(req, res)

      default:
        return notFound(res)
    }
  }

  async function handleBatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readJsonBody<{
        batchId: string
        ts?: string
        items?: Array<{ id: string }>
      }>(req)
      if (!body?.batchId || !Array.isArray(body.items)) {
        return json(res, 400, { error: 'invalid', message: 'expected { batchId, items[] }' })
      }
      const entry = await queue.appendBatch({
        batchId: body.batchId,
        ts: body.ts,
        items: body.items,
      })
      log(`enqueued batch ${entry.batchId} with ${entry.inflightItemIds.length} items`)
      return json(res, 200, { ok: true, batchId: entry.batchId })
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        return json(res, 413, { error: 'too_large', limit: err.limit })
      }
      if (err instanceof BodyParseError) {
        return json(res, 400, { error: 'bad_json' })
      }
      throw err
    }
  }

  async function handleSnapshot(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readJsonBody<{ batchId: string; itemId: string; base64: string }>(req)
      if (!body?.batchId || !body?.itemId || !body?.base64) {
        return json(res, 400, { error: 'invalid', message: 'expected { batchId, itemId, base64 }' })
      }
      const saved = await snapshotStore.save(body)
      return json(res, 200, { ok: true, url: saved.url })
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        return json(res, 413, { error: 'too_large', limit: err.limit })
      }
      if (err instanceof BodyParseError) {
        return json(res, 400, { error: 'bad_json' })
      }
      throw err
    }
  }

  async function handleAck(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readJsonBody<{ batchId: string; itemIds?: string[] }>(req)
      if (!body?.batchId) {
        return json(res, 400, { error: 'invalid', message: 'expected { batchId, itemIds? }' })
      }
      const result = await queue.ack(body)
      log(
        `acked ${body.batchId}${result.archived ? ' (archived)' : ` (${result.remainingItemIds.length} remaining)`}`,
      )
      return json(res, 200, result)
    } catch (err) {
      if (err instanceof BodyParseError) {
        return json(res, 400, { error: 'bad_json' })
      }
      throw err
    }
  }

  async function handleFetched(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readJsonBody<{ batchId: string }>(req)
      if (!body?.batchId) {
        return json(res, 400, { error: 'invalid', message: 'expected { batchId }' })
      }
      await queue.markFetched(body.batchId)
      return json(res, 200, { ok: true })
    } catch (err) {
      if (err instanceof BodyParseError) {
        return json(res, 400, { error: 'bad_json' })
      }
      throw err
    }
  }

  async function handleCancel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readJsonBody<{ batchId: string }>(req)
      if (!body?.batchId) {
        return json(res, 400, { error: 'invalid', message: 'expected { batchId }' })
      }
      const result = await queue.cancel(body.batchId)
      log(`cancel ${body.batchId} → ${result.cancelled ? 'removed' : 'not found'}`)
      return json(res, 200, result)
    } catch (err) {
      if (err instanceof BodyParseError) {
        return json(res, 400, { error: 'bad_json' })
      }
      throw err
    }
  }

  async function handleUndo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readJsonBody<{ batchId: string; itemId?: string }>(req)
      if (!body?.batchId) {
        return json(res, 400, { error: 'invalid', message: 'expected { batchId, itemId? }' })
      }
      const result = await undoStore.restore(body.batchId, body.itemId)
      log(`undo ${body.batchId}${body.itemId ? `/${body.itemId}` : ''} → ${result.restored} file(s)`)
      return json(res, 200, result)
    } catch (err) {
      if (err instanceof BodyParseError) return json(res, 400, { error: 'bad_json' })
      throw err
    }
  }

  async function handleMedia(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Videos can be large — allow up to 128 MB for media uploads.
      const body = await readJsonBody<{
        batchId: string
        base64: string
        ext?: string
        kind?: 'image' | 'video'
      }>(req, 128 * 1024 * 1024)
      if (!body?.batchId || !body?.base64) {
        return json(res, 400, { error: 'invalid', message: 'expected { batchId, base64 }' })
      }
      const saved = await mediaStore.save({
        batchId: body.batchId,
        base64: body.base64,
        ext: body.ext ?? '',
        kind: body.kind ?? 'image',
      })
      log(`media saved ${saved.file} for ${body.batchId}`)
      return json(res, 200, { ok: true, url: saved.url, file: saved.file })
    } catch (err) {
      if (err instanceof BodyTooLargeError) return json(res, 413, { error: 'too_large', limit: err.limit })
      if (err instanceof BodyParseError) return json(res, 400, { error: 'bad_json' })
      throw err
    }
  }
}

function sendBuffer(res: ServerResponse, buf: Buffer, contentType: string): void {
  res.statusCode = 200
  res.setHeader('content-type', contentType)
  res.setHeader('cache-control', 'no-store')
  res.end(buf)
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function notFound(res: ServerResponse): void {
  json(res, 404, { error: 'not_found' })
}

// Re-exports for testing.
export { createQueue, createSnapshotStore, path }
