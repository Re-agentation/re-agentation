/**
 * Queue smoke tests. Uses a temp dir per test so we don't pollute the repo.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { createQueue } from '../queue'

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'reagentation-queue-test-'))
})

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('queue', () => {
  it('appends, lists, and acks a single batch', async () => {
    const q = createQueue(tmpRoot)
    const e = await q.appendBatch({
      batchId: 'b1',
      ts: '2026-05-29T01:00:00.000Z',
      items: [{ id: 'i1' }, { id: 'i2' }],
    })
    expect(e.batchId).toBe('b1')
    expect(e.inflightItemIds).toEqual(['i1', 'i2'])

    const recent = await q.listRecent()
    expect(recent).toHaveLength(1)
    expect(recent[0]!.batchId).toBe('b1')

    const ack = await q.ack({ batchId: 'b1' })
    expect(ack.archived).toBe(true)

    const after = await q.listRecent()
    expect(after).toHaveLength(0)
  })

  it('partial ack keeps remaining items inflight', async () => {
    const q = createQueue(tmpRoot)
    await q.appendBatch({
      batchId: 'b2',
      ts: '2026-05-29T02:00:00.000Z',
      items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    })

    const ack = await q.ack({ batchId: 'b2', itemIds: ['a'] })
    expect(ack.archived).toBe(false)
    expect(ack.remainingItemIds.sort()).toEqual(['b', 'c'])

    const recent = await q.listRecent()
    expect(recent).toHaveLength(1)
    expect(recent[0]!.inflightItemIds.sort()).toEqual(['b', 'c'])
  })

  it('listRecent honors the `since` filter', async () => {
    const q = createQueue(tmpRoot)
    await q.appendBatch({ batchId: 'b3', ts: '2026-05-29T03:00:00.000Z', items: [{ id: 'x' }] })
    await q.appendBatch({ batchId: 'b4', ts: '2026-05-29T04:00:00.000Z', items: [{ id: 'y' }] })

    const all = await q.listRecent()
    expect(all.map((e) => e.batchId)).toEqual(['b3', 'b4'])

    const after = await q.listRecent('2026-05-29T03:30:00.000Z')
    expect(after.map((e) => e.batchId)).toEqual(['b4'])
  })

  it('archives by date and survives reads', async () => {
    const q = createQueue(tmpRoot)
    await q.appendBatch({
      batchId: 'b5',
      ts: '2026-05-29T05:00:00.000Z',
      items: [{ id: 'p' }],
    })
    const ack = await q.ack({ batchId: 'b5' })
    expect(ack.archived).toBe(true)

    const archivePath = path.join(tmpRoot, '.agentation', 'archive', '2026-05-29.jsonl')
    const archived = await fs.readFile(archivePath, 'utf8')
    expect(archived).toContain('b5')
  })

  it('returns empty arrays before any append', async () => {
    const q = createQueue(tmpRoot)
    expect(await q.listRecent()).toEqual([])
    const ack = await q.ack({ batchId: 'never-existed' })
    expect(ack.archived).toBe(false)
  })
})
