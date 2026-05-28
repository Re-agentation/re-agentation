import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { createSnapshotStore } from '../snapshot-store'

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reagentation-snap-test-'))
})

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

// A tiny 1x1 transparent PNG.
const PIXEL_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('snapshot-store', () => {
  it('saves a base64 PNG and reads it back', async () => {
    const store = createSnapshotStore(tmpRoot, '.agentation', 'http://localhost:8081')
    const saved = await store.save({ batchId: 'B1', itemId: 'I1', base64: PIXEL_B64 })
    expect(saved.url).toBe('http://localhost:8081/__agentation__/snapshot/B1/I1.png')

    const buf = await store.read({ batchId: 'B1', itemId: 'I1' })
    expect(buf).not.toBeNull()
    expect(buf!.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a') // PNG magic
  })

  it('rejects bad ids', async () => {
    const store = createSnapshotStore(tmpRoot)
    await expect(
      store.save({ batchId: '../../etc/passwd', itemId: 'x', base64: PIXEL_B64 }),
    ).rejects.toThrow(/invalid id/)
  })

  it('returns null for missing files', async () => {
    const store = createSnapshotStore(tmpRoot)
    expect(await store.read({ batchId: 'nope', itemId: 'nope' })).toBeNull()
  })

  it('strips data URI prefix', async () => {
    const store = createSnapshotStore(tmpRoot)
    const dataUri = `data:image/png;base64,${PIXEL_B64}`
    const saved = await store.save({ batchId: 'b', itemId: 'i', base64: dataUri })
    expect(saved.path.endsWith('i.png')).toBe(true)
  })
})
