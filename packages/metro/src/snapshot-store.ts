/**
 * snapshot-store — saves base64 PNGs from the probe.
 *
 * Files land at:
 *   <projectRoot>/<storageDir>/snapshots/<batchId>/<itemId>.png
 *
 * The middleware also serves them back via
 *   GET /__agentation__/snapshot/<batchId>/<itemId>.png
 * so MCP payloads can embed plain HTTP URLs that Claude Code can fetch.
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'

export interface SnapshotSaveResult {
  url: string
  path: string
}

export interface SnapshotStore {
  save(args: { batchId: string; itemId: string; base64: string }): Promise<SnapshotSaveResult>
  read(args: { batchId: string; itemId: string }): Promise<Buffer | null>
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

function safeId(id: string): string {
  if (!ID_RE.test(id)) {
    throw new Error(`invalid id: ${id}`)
  }
  return id
}

function stripDataUriPrefix(b64: string): string {
  const i = b64.indexOf(',')
  if (b64.startsWith('data:') && i > 0) return b64.slice(i + 1)
  return b64
}

export function createSnapshotStore(
  projectRoot: string,
  storageDir = '.agentation',
  /** Base URL Metro serves at, used to construct the public URL. */
  publicBaseUrl = '',
): SnapshotStore {
  const root = path.resolve(projectRoot, storageDir, 'snapshots')

  return {
    async save({ batchId, itemId, base64 }) {
      const safeBatch = safeId(batchId)
      const safeItem = safeId(itemId)
      const dir = path.join(root, safeBatch)
      await fs.mkdir(dir, { recursive: true })
      const filePath = path.join(dir, `${safeItem}.png`)
      const buf = Buffer.from(stripDataUriPrefix(base64), 'base64')
      await fs.writeFile(filePath, buf)
      const url = `${publicBaseUrl}/__agentation__/snapshot/${safeBatch}/${safeItem}.png`
      return { url, path: filePath }
    },

    async read({ batchId, itemId }) {
      try {
        const filePath = path.join(root, safeId(batchId), `${safeId(itemId)}.png`)
        return await fs.readFile(filePath)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw err
      }
    },
  }
}
