/**
 * media-store — saves user-attached reference images/videos from the comment
 * sheet. Files land at:
 *   <projectRoot>/<storageDir>/media/<batchId>/<n>.<ext>
 * and are served back via GET /__agentation__/media/<batchId>/<file>.
 *
 * The apply-watcher reads these local paths and (for video) extracts frames
 * with ffmpeg before handing the images to `claude`.
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'

export interface MediaSaveResult {
  url: string
  path: string
  file: string
}

export interface MediaStore {
  save(args: {
    batchId: string
    base64: string
    ext: string
    kind: 'image' | 'video'
  }): Promise<MediaSaveResult>
  read(args: { batchId: string; file: string }): Promise<Buffer | null>
  dir(batchId: string): string
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const EXT_RE = /^[a-z0-9]{1,8}$/i
const FILE_RE = /^[A-Za-z0-9_.-]{1,128}$/

function safeId(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`invalid id: ${id}`)
  return id
}

function stripDataUri(b64: string): string {
  const i = b64.indexOf(',')
  return b64.startsWith('data:') && i > 0 ? b64.slice(i + 1) : b64
}

export function createMediaStore(
  projectRoot: string,
  storageDir = '.agentation',
  publicBaseUrl = '',
): MediaStore {
  const root = path.resolve(projectRoot, storageDir, 'media')
  // Per-batch monotonic counter so concurrent saves don't collide.
  const counters = new Map<string, number>()

  return {
    dir(batchId) {
      return path.join(root, safeId(batchId))
    },

    async save({ batchId, base64, ext, kind }) {
      const safeBatch = safeId(batchId)
      const safeExt = EXT_RE.test(ext) ? ext.toLowerCase() : kind === 'video' ? 'mp4' : 'png'
      const dir = path.join(root, safeBatch)
      await fs.mkdir(dir, { recursive: true })
      const n = (counters.get(safeBatch) ?? 0) + 1
      counters.set(safeBatch, n)
      const file = `${kind}-${n}.${safeExt}`
      const filePath = path.join(dir, file)
      await fs.writeFile(filePath, Buffer.from(stripDataUri(base64), 'base64'))
      return {
        url: `${publicBaseUrl}/__agentation__/media/${safeBatch}/${file}`,
        path: filePath,
        file,
      }
    },

    async read({ batchId, file }) {
      if (!FILE_RE.test(file)) return null
      try {
        return await fs.readFile(path.join(root, safeId(batchId), file))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw err
      }
    },
  }
}

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
}

export function contentTypeFor(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}
