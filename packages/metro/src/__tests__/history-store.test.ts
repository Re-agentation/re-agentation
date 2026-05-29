/**
 * history-store tests — pagination, search, status filter, markUndone.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { createHistoryStore, type HistoryMeta } from '../history-store'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'reagentation-hist-test-'))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function seed(metas: Partial<HistoryMeta>[]): Promise<void> {
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i]!
    const id = m.id ?? `e${i}`
    const dir = path.join(root, '.agentation', 'history', id)
    await fs.mkdir(dir, { recursive: true })
    const full: HistoryMeta = {
      id,
      ts: m.ts ?? `2026-05-29T00:00:${String(i).padStart(2, '0')}.000Z`,
      batchId: 'b',
      itemId: id,
      component: m.component ?? 'Comp',
      comment: m.comment ?? 'change something',
      undone: m.undone,
    }
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(full))
  }
}

describe('history-store', () => {
  it('paginates newest-first', async () => {
    await seed(Array.from({ length: 25 }, (_, i) => ({ id: `e${i}`, comment: `c${i}` })))
    const store = createHistoryStore(root)
    const p1 = await store.list({ limit: 10, offset: 0 })
    const p2 = await store.list({ limit: 10, offset: 10 })
    expect(p1).toHaveLength(10)
    expect(p2).toHaveLength(10)
    expect(p1[0]!.id).toBe('e24') // newest first
    expect(p1.some((e) => p2.some((f) => f.id === e.id))).toBe(false) // no overlap
  })

  it('filters by query against comment + component', async () => {
    await seed([
      { id: 'a', comment: 'make the tiger bigger', component: 'Hero' },
      { id: 'b', comment: 'navy color', component: 'SignInButton' },
    ])
    const store = createHistoryStore(root)
    expect((await store.list({ query: 'tiger' })).map((e) => e.id)).toEqual(['a'])
    expect((await store.list({ query: 'signin' })).map((e) => e.id)).toEqual(['b'])
  })

  it('filters by status and markStatus flips it (applied/undone/failed)', async () => {
    await seed([
      { id: 'a', comment: 'one' },
      { id: 'b', comment: 'two' },
      { id: 'c', comment: 'three' },
    ])
    const store = createHistoryStore(root)
    expect(await store.list({ status: 'undone' })).toHaveLength(0)

    await store.markStatus('a', 'undone', '2026-05-29T01:00:00.000Z')
    await store.markStatus('c', 'failed', '2026-05-29T01:00:00.000Z')
    expect((await store.list({ status: 'undone' })).map((e) => e.id)).toEqual(['a'])
    expect((await store.list({ status: 'failed' })).map((e) => e.id)).toEqual(['c'])
    expect((await store.list({ status: 'applied' })).map((e) => e.id)).toEqual(['b'])
    expect(await store.list({ status: 'all' })).toHaveLength(3)

    const meta = await store.getMeta('a')
    expect(meta?.status).toBe('undone')
    expect(meta?.statusAt).toBe('2026-05-29T01:00:00.000Z')
  })

  it('deleteEntry removes an entry', async () => {
    await seed([{ id: 'x', comment: 'gone soon' }])
    const store = createHistoryStore(root)
    expect(await store.deleteEntry('x')).toBe(true)
    expect(await store.getMeta('x')).toBe(null)
    expect(await store.list({ status: 'all' })).toHaveLength(0)
  })
})
