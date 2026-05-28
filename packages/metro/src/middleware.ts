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

export function createMiddleware(options: MiddlewareOptions = {}): (inner: unknown) => Middleware {
  const projectRoot = options.projectRoot ?? process.cwd()
  const storageDir = options.storageDir ?? '.agentation'
  const verbose = options.verbose ?? true
  const queue = options.queue ?? createQueue(projectRoot, storageDir)
  const snapshotStore = options.snapshotStore ?? createSnapshotStore(projectRoot, storageDir)

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
      const batchId = m[1]!
      const itemId = m[2]!
      const buf = await snapshotStore.read({ batchId, itemId })
      if (!buf) return notFound(res)
      res.statusCode = 200
      res.setHeader('content-type', 'image/png')
      res.setHeader('cache-control', 'no-store')
      res.end(buf)
      return
    }

    switch (`${method} ${route}`) {
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
