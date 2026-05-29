/**
 * HistoryScreen — applied changes as cards (prompt + timestamp on top, before→
 * after screenshots below). Lazy infinite scroll, prompt search, and an
 * All / Applied / Undo / Failed status filter. Supports multi-select bulk
 * delete (with a confirm modal showing the count). Tapping a card opens detail.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { deleteHistory, getHistory, type HistoryEntry, type HistoryStatus } from './probe-transport'
import { CloseIcon, TrashIcon } from './icons'
import { ConfirmModal } from './ConfirmModal'
import { HistoryCard } from './HistoryCard'

export interface HistoryScreenProps {
  metroHost: string
  onClose: () => void
  onOpen: (entry: HistoryEntry) => void
}

const PAGE = 10
const TABS: Array<{ key: HistoryStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'applied', label: 'Applied' },
  { key: 'undone', label: 'Undo' },
  { key: 'failed', label: 'Failed' },
]
export function HistoryScreen({ metroHost, onClose, onOpen }: HistoryScreenProps) {
  const { width, height } = useWindowDimensions()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<HistoryStatus>('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const reqId = useRef(0)

  const thumbW = (width - 16 * 2 - 14 * 2 - 10) / 2
  const thumbAspect = width / height

  const loadPage = useCallback(
    async (reset: boolean, q: string, st: HistoryStatus) => {
      const offset = reset ? 0 : entries.length
      const myReq = ++reqId.current
      if (reset) setLoading(true)
      else setLoadingMore(true)
      const page = await getHistory({ hostOverride: metroHost, limit: PAGE, offset, q, status: st })
      if (myReq !== reqId.current) return
      setEntries((prev) => (reset ? page : [...prev, ...page]))
      setHasMore(page.length === PAGE)
      setLoading(false)
      setLoadingMore(false)
    },
    [metroHost, entries.length],
  )

  useEffect(() => {
    const t = setTimeout(() => void loadPage(true, query, status), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, metroHost])

  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loading) void loadPage(false, query, status)
  }, [hasMore, loadingMore, loading, loadPage, query, status])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exitSelect = useCallback(() => {
    setSelecting(false)
    setSelected(new Set())
  }, [])

  const doDelete = useCallback(async () => {
    const ids = [...selected]
    setConfirmDelete(false)
    await deleteHistory(ids, { hostOverride: metroHost })
    setEntries((prev) => prev.filter((e) => !selected.has(e.id)))
    exitSelect()
  }, [selected, metroHost, exitSelect])

  const renderItem = useCallback(
    ({ item: e }: { item: HistoryEntry }) => (
      <HistoryCard
        entry={e}
        metroHost={metroHost}
        thumbW={thumbW}
        thumbAspect={thumbAspect}
        selecting={selecting}
        selected={selected.has(e.id)}
        onPress={() => (selecting ? toggleSelect(e.id) : onOpen(e))}
        onLongPress={() => {
          setSelecting(true)
          toggleSelect(e.id)
        }}
      />
    ),
    [metroHost, onOpen, thumbW, thumbAspect, selecting, selected, toggleSelect],
  )

  return (
    <View style={[styles.root, { width, height }]}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => (selecting ? exitSelect() : setSelecting(true))} hitSlop={10}>
            <Text style={styles.selectBtn}>{selecting ? 'Cancel' : 'Select'}</Text>
          </Pressable>
          <Pressable onPress={onClose} hitSlop={12}>
            <CloseIcon size={22} color="#1a1a1a" />
          </Pressable>
        </View>
      </View>

      <View style={styles.controls}>
        <TextInput
          style={styles.search}
          placeholder="Search your prompts…"
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = status === t.key
            return (
              <Pressable
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setStatus(t.key)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>{query ? 'No matching changes.' : 'Nothing here yet.'}</Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} /> : null
          }
        />
      )}

      {selecting && (
        <View style={[styles.selectBar, { width }]}>
          <Pressable
            style={[styles.deleteBtn, selected.size === 0 && styles.disabled]}
            disabled={selected.size === 0}
            onPress={() => setConfirmDelete(true)}
          >
            <TrashIcon size={18} color="#fff" />
            <Text style={styles.deleteText}>{`Delete (${selected.size})`}</Text>
          </Pressable>
        </View>
      )}

      <ConfirmModal
        visible={confirmDelete}
        title="Delete history"
        message={`Delete ${selected.size} selected ${selected.size === 1 ? 'entry' : 'entries'}? This can't be undone. (Your code changes are not affected.)`}
        confirmLabel={`Delete ${selected.size}`}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, backgroundColor: '#f2f2f5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  selectBtn: { fontSize: 16, color: '#3b82f6', fontWeight: '600' },
  controls: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  search: {
    backgroundColor: '#f4f4f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
  },
  tabs: { flexDirection: 'row', backgroundColor: '#ececed', borderRadius: 9, padding: 3 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 7, alignItems: 'center' },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: '#71717a' },
  tabTextActive: { color: '#1a1a1a' },
  empty: { textAlign: 'center', color: '#999', marginTop: 48, fontSize: 15 },
  list: { padding: 16, paddingBottom: 100 },
  selectBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  deleteBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.4 },
})
