/**
 * Stream → JSON body parser with size cap.
 *
 * Re-agentation payloads are bounded — a batch with 50 items + a few props
 * each lands well under 1 MB. We cap at 16 MB to allow snapshot PNG uploads
 * (the only large payload). Larger requests are rejected with 413.
 */

import type { IncomingMessage } from 'node:http'

const DEFAULT_LIMIT = 16 * 1024 * 1024 // 16 MB

export class BodyTooLargeError extends Error {
  readonly limit: number
  constructor(limit: number) {
    super(`body exceeds ${limit} bytes`)
    this.limit = limit
    this.name = 'BodyTooLargeError'
  }
}

export class BodyParseError extends Error {
  override readonly cause: unknown
  constructor(cause: unknown) {
    super('invalid JSON body')
    this.cause = cause
    this.name = 'BodyParseError'
  }
}

export async function readJsonBody<T = unknown>(
  req: IncomingMessage,
  limit: number = DEFAULT_LIMIT,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let total = 0
    const chunks: Buffer[] = []
    let aborted = false

    req.on('data', (chunk: Buffer) => {
      if (aborted) return
      total += chunk.length
      if (total > limit) {
        aborted = true
        reject(new BodyTooLargeError(limit))
        // Don't keep buffering.
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (aborted) return
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.length === 0) {
        resolve({} as T)
        return
      }
      try {
        resolve(JSON.parse(raw) as T)
      } catch (err) {
        reject(new BodyParseError(err))
      }
    })

    req.on('error', reject)
  })
}
