import { describe, expect, it, vi } from 'vitest'

import { createQueueClient, type QueueEntry } from '../queue-client'

function mockFetchOk(body: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}

describe('queue-client', () => {
  it('nextBatch returns first entry or null', async () => {
    const entry: QueueEntry = {
      batchId: 'b1',
      ts: '2026-05-29T00:00:00.000Z',
      payload: { foo: 'bar' },
      inflightItemIds: ['i1'],
    }
    const c = createQueueClient({
      metroHost: 'http://example/',
      fetchImpl: mockFetchOk({ entries: [entry] }),
    })
    const b = await c.nextBatch()
    expect(b?.batchId).toBe('b1')

    const c2 = createQueueClient({
      metroHost: 'http://example',
      fetchImpl: mockFetchOk({ entries: [] }),
    })
    expect(await c2.nextBatch()).toBeNull()
  })

  it('listBatches respects limit', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ entries: [] }), { status: 200 }),
    ) as unknown as typeof fetch
    const c = createQueueClient({ metroHost: 'http://example', fetchImpl })
    await c.listBatches(7)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://example/__agentation__/queue/recent?limit=7',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('ack posts batchId', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ archived: true, remainingItemIds: [] }), { status: 200 }),
    ) as unknown as typeof fetch
    const c = createQueueClient({ metroHost: 'http://example', fetchImpl })
    const r = await c.ack({ batchId: 'b1' })
    expect(r.archived).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://example/__agentation__/ack',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ batchId: 'b1' }),
      }),
    )
  })

  it('throws on non-200', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch
    const c = createQueueClient({ metroHost: 'http://example', fetchImpl })
    await expect(c.health()).rejects.toThrow(/500/)
  })
})
