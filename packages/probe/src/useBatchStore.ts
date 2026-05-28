/**
 * useBatchStore — the running batch of annotation items.
 *
 * In-memory + opt-in AsyncStorage backup. Subscribed to via React's
 * `useSyncExternalStore`. Designed to be cheap: subscribers fire only on
 * structural changes.
 */

import { useSyncExternalStore } from 'react'
import type { BatchItem } from './types'

interface Snapshot {
  items: BatchItem[]
  version: number
}

interface BatchStoreImpl {
  getSnapshot(): Snapshot
  subscribe(cb: () => void): () => void
  add(item: BatchItem): void
  update(id: string, patch: Partial<BatchItem>): void
  remove(id: string): void
  reorder(fromId: string, toIndex: number): void
  clear(): void
  /** Replace store contents (used by restoreFromStorage). */
  hydrate(items: BatchItem[]): void
}

function createStore(): BatchStoreImpl {
  let snapshot: Snapshot = { items: [], version: 0 }
  const listeners = new Set<() => void>()

  const commit = (next: BatchItem[]): void => {
    snapshot = { items: next, version: snapshot.version + 1 }
    listeners.forEach((l) => l())
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    add: (item) => commit([...snapshot.items, item]),
    update: (id, patch) =>
      commit(snapshot.items.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    remove: (id) => commit(snapshot.items.filter((it) => it.id !== id)),
    reorder: (fromId, toIndex) => {
      const arr = snapshot.items.slice()
      const fromIdx = arr.findIndex((it) => it.id === fromId)
      if (fromIdx < 0) return
      const [moved] = arr.splice(fromIdx, 1)
      if (!moved) return
      arr.splice(Math.max(0, Math.min(toIndex, arr.length)), 0, moved)
      commit(arr)
    },
    clear: () => commit([]),
    hydrate: (items) => commit(items),
  }
}

// Module-level singleton — there's only ever one probe per app instance.
const store = createStore()

export interface BatchStoreActions {
  add(item: BatchItem): void
  update(id: string, patch: Partial<BatchItem>): void
  remove(id: string): void
  reorder(fromId: string, toIndex: number): void
  clear(): void
}

export function useBatch(): { items: BatchItem[]; actions: BatchStoreActions } {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return {
    items: snap.items,
    actions: {
      add: store.add,
      update: store.update,
      remove: store.remove,
      reorder: store.reorder,
      clear: store.clear,
    },
  }
}

/** Direct (non-hook) access for non-React code (e.g. fetch retry restore). */
export function getBatchSnapshot(): BatchItem[] {
  return store.getSnapshot().items
}

export function hydrateBatch(items: BatchItem[]): void {
  store.hydrate(items)
}
