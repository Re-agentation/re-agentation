/**
 * queue-client — HTTP client to the Metro middleware endpoints under
 * `/__agentation__/`. The MCP server is a stateless adapter; the queue
 * lives in Metro.
 */

const DEFAULT_METRO_HOST = 'http://localhost:8081'
const DEFAULT_POLL_INTERVAL_MS = 1500

export interface QueueClientOptions {
  /** e.g. `http://localhost:8081`. No trailing slash. */
  metroHost?: string
  /** Long-poll cadence for `subscribe()`. Default 1500ms. */
  pollIntervalMs?: number
  /** Test seam. */
  fetchImpl?: typeof fetch
}

export interface QueueEntry {
  batchId: string
  ts: string
  payload: unknown
  inflightItemIds: string[]
}

export interface AckArgs {
  batchId: string
  itemIds?: string[]
}

export interface AckResult {
  archived: boolean
  remainingItemIds: string[]
}

export interface QueueClient {
  nextBatch(): Promise<QueueEntry | null>
  listBatches(limit?: number): Promise<QueueEntry[]>
  ack(args: AckArgs): Promise<AckResult>
  health(): Promise<{ ok: true; inflight: number }>
  /**
   * Async iterator yielding newly-arrived batches. Polls Metro at the
   * configured cadence. Caller should pass an AbortSignal to stop.
   */
  subscribe(signal?: AbortSignal): AsyncIterable<QueueEntry>
}

export function createQueueClient(options: QueueClientOptions = {}): QueueClient {
  const metroHost = (options.metroHost ?? DEFAULT_METRO_HOST).replace(/\/$/, '')
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const f: typeof fetch = options.fetchImpl ?? fetch

  async function jsonFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await f(`${metroHost}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`metro ${method} ${path} → ${res.status} ${text}`)
    }
    return (await res.json()) as T
  }

  return {
    async nextBatch() {
      const { entries } = await jsonFetch<{ entries: QueueEntry[] }>(
        'GET',
        '/__agentation__/queue/recent?limit=1',
      )
      return entries[0] ?? null
    },

    async listBatches(limit = 10) {
      const { entries } = await jsonFetch<{ entries: QueueEntry[] }>(
        'GET',
        `/__agentation__/queue/recent?limit=${encodeURIComponent(String(limit))}`,
      )
      return entries
    },

    async ack(args) {
      return jsonFetch<AckResult>('POST', '/__agentation__/ack', args)
    },

    async health() {
      return jsonFetch<{ ok: true; inflight: number }>('GET', '/__agentation__/health')
    },

    async *subscribe(signal) {
      const seen = new Set<string>()
      while (!signal?.aborted) {
        try {
          const { entries } = await jsonFetch<{ entries: QueueEntry[] }>(
            'GET',
            '/__agentation__/queue/recent?limit=50',
          )
          for (const e of entries) {
            if (!seen.has(e.batchId)) {
              seen.add(e.batchId)
              yield e
            }
          }
        } catch {
          // Swallow transient errors (Metro restarting, etc.) and retry next tick.
        }
        await sleep(pollIntervalMs, signal)
      }
    },
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })
}
