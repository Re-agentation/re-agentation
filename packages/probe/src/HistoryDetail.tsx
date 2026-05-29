/**
 * HistoryDetail — before/after of one change with Undo / Redo / Delete.
 *
 * - applied  → Undo (restores originals, best-effort nav to the saved route)
 * - undone   → Redo (re-applies the change)
 * - any      → Delete (with confirm modal; removes the history entry only)
 *
 * Legacy entries (no `changedFiles`) can't be safely reverted — Undo is blocked.
 */

import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  deleteHistory,
  entryStatus,
  historyImageUrl,
  redoHistory,
  undoHistory,
  type HistoryEntry,
} from './probe-transport'
import { UndoIcon, TrashIcon } from './icons'
import { getCurrentRouteName, getReagentationNavRef } from './nav-ref'
import { ConfirmModal } from './ConfirmModal'

export interface HistoryDetailProps {
  entry: HistoryEntry
  metroHost: string
  onBack: () => void
  /** Called after undo / redo / delete so the parent can refresh the list. */
  onChanged: () => void
}

export function HistoryDetail({ entry, metroHost, onBack, onChanged }: HistoryDetailProps) {
  const { width, height } = useWindowDimensions()
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [page, setPage] = useState(0) // 0 = before, 1 = after
  const PEEK = 30 // sliver of the adjacent screenshot shown as a swipe hint
  const GAP = 14 // space between the before/after screenshots
  const itemW = width - 32 - PEEK * 2
  const itemH = itemW * (height / width) // true device aspect, no crop
  const stride = itemW + GAP

  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / stride)
    if (i !== page) setPage(i)
  }

  const status = entryStatus(entry)
  const canUndo = Array.isArray(entry.changedFiles) && entry.changedFiles.length > 0

  const tryNavigate = () => {
    const route = entry.route
    const nav = getReagentationNavRef()
    if (!route || !nav) return
    const current = getCurrentRouteName()
    const go = () => {
      try {
        nav.navigate(route)
      } catch {
        /* deep link broken — stay put */
      }
    }
    if (current && current !== route) {
      Alert.alert('현재 화면이 달라요', `저장된 화면("${route}")으로 이동할까요?`, [
        { text: '취소', style: 'cancel' },
        { text: '이동', onPress: go },
      ])
    } else {
      go()
    }
  }

  const onUndo = async () => {
    if (!canUndo) {
      Alert.alert(
        '되돌릴 수 없는 항목',
        '예전 형식이라 안전하게 되돌릴 수 없습니다. 새로 만든 항목은 정상 Undo됩니다.',
      )
      return
    }
    setBusy(true)
    const { ok, restored } = await undoHistory(entry.id, { hostOverride: metroHost })
    setBusy(false)
    if (!ok || restored === 0) {
      Alert.alert('되돌릴 변경이 없어요', '복원할 원본이 없습니다.')
      return
    }
    tryNavigate()
    onChanged()
  }

  const onRedo = async () => {
    setBusy(true)
    const { ok, restored } = await redoHistory(entry.id, { hostOverride: metroHost })
    setBusy(false)
    if (!ok || restored === 0) {
      Alert.alert('Redo 실패', '다시 적용할 내용이 없습니다.')
      return
    }
    tryNavigate()
    onChanged()
  }

  const onDelete = async () => {
    setConfirmDelete(false)
    setBusy(true)
    await deleteHistory([entry.id], { hostOverride: metroHost })
    setBusy(false)
    onChanged()
  }

  const isUndone = status === 'undone'

  return (
    <View style={[styles.root, { width, height }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.backText}>‹ History</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.component}>{entry.component}</Text>
        <Text style={styles.comment}>{entry.comment}</Text>
        {entry.file && (
          <Text style={styles.file} numberOfLines={2}>
            {entry.file}
            {entry.line ? `:${entry.line}` : ''}
          </Text>
        )}
        <Text style={styles.hint}>← swipe to compare before · after →</Text>
        <Text style={styles.label}>{page === 0 ? 'Before' : 'After'}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={stride}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: PEEK, paddingVertical: 6 }}
          onMomentumScrollEnd={onCarouselScroll}
        >
          {(['before', 'after'] as const).map((which, i) => (
            <Image
              key={which}
              source={{ uri: historyImageUrl(entry.id, which, { hostOverride: metroHost }) }}
              style={[styles.img, { width: itemW, height: itemH, marginRight: i === 0 ? GAP : 0 }]}
              resizeMode="contain"
            />
          ))}
        </ScrollView>
        <View style={styles.dots}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.dot, page === i && styles.dotActive]} />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isUndone ? (
          <Pressable
            style={[styles.primary, styles.redo, busy && styles.disabled]}
            disabled={busy}
            onPress={onRedo}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <UndoIcon size={18} color="#fff" />
                <Text style={styles.primaryText}>Redo this change</Text>
              </>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primary, canUndo ? styles.undo : styles.legacy, busy && styles.disabled]}
            disabled={busy}
            onPress={onUndo}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <UndoIcon size={18} color="#fff" />
                <Text style={styles.primaryText}>
                  {canUndo ? 'Undo this change' : 'Undo unavailable (legacy)'}
                </Text>
              </>
            )}
          </Pressable>
        )}
        <Pressable
          style={[styles.deleteBtn, busy && styles.disabled]}
          disabled={busy}
          onPress={() => setConfirmDelete(true)}
        >
          <TrashIcon size={18} color="#ef4444" />
        </Pressable>
      </View>

      <ConfirmModal
        visible={confirmDelete}
        title="Delete this entry"
        message="Remove this from history? This can't be undone. (Your code changes are not affected.)"
        confirmLabel="Delete"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  backText: { fontSize: 16, color: '#3b82f6', fontWeight: '600' },
  body: { padding: 16, paddingBottom: 110, gap: 8 },
  component: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  comment: { fontSize: 15, color: '#333' },
  file: { fontSize: 12, color: '#3b82f6', fontFamily: 'Menlo', marginBottom: 8 },
  hint: { fontSize: 12, color: '#a1a1aa', textAlign: 'center', marginTop: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#999', marginTop: 4 },
  img: {
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5e5',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  dots: { flexDirection: 'row', gap: 8, alignSelf: 'center', marginTop: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d4d4d8' },
  dotActive: { backgroundColor: '#1a1a1a', width: 22 },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 10,
  },
  primary: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undo: { backgroundColor: '#ef4444' },
  redo: { backgroundColor: '#16a34a' },
  legacy: { backgroundColor: '#9ca3af' }, // opaque grey — pressable, shows info popup
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  disabled: { opacity: 0.5 },
})
