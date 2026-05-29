/**
 * BatchTraySheet — bottom sheet listing the current batch.
 *
 * Two modes:
 *   • review  (default): per-row edit/delete + "Send (N)" CTA.
 *   • progress (statusMap present): after Send, the sheet STAYS open and shows
 *     a live per-item progress bar (queued → processing → done) as Claude works
 *     through the batch. Footer shows "Processing N/M" then "Done ✓ (Close)".
 */

import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import type { BatchItem } from './types'
import type { ItemStatus } from './probe-transport'
import { CheckIcon, CloseIcon, PencilIcon, TrashIcon, UndoIcon } from './icons'

export interface BatchTraySheetProps {
  items: BatchItem[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onSend: () => void
  onClose: () => void
  /** Tapping outside the sheet minimizes it (keeps state) rather than closing. */
  onMinimize?: () => void
  /** Cancel an in-flight batch and roll back to review. */
  onCancel?: () => void
  /** Revert all applied edits (shown as "Undo" once done). */
  onUndo?: () => void
  sending?: boolean
  /** When present, the sheet is in live-progress mode (post-send). */
  statusMap?: Record<string, ItemStatus>
}

const BAR: Record<ItemStatus, { pct: `${number}%`; color: string; label: string }> = {
  queued: { pct: '12%', color: '#d4d4d8', label: 'Queued' },
  processing: { pct: '66%', color: '#3b82f6', label: 'Editing…' },
  done: { pct: '100%', color: '#22c55e', label: 'Done' },
}

export function BatchTraySheet({
  items,
  onEdit,
  onDelete,
  onSend,
  onClose,
  onMinimize,
  onCancel,
  onUndo,
  sending,
  statusMap,
}: BatchTraySheetProps) {
  const { width, height } = useWindowDimensions()
  const progressMode = !!statusMap
  const doneCount = progressMode ? items.filter((it) => statusMap![it.id] === 'done').length : 0
  const allDone = progressMode && items.length > 0 && doneCount === items.length

  return (
    <Pressable style={[styles.backdrop, { width, height }]} onPress={onMinimize ?? onClose}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {progressMode
              ? allDone
                ? 'All changes applied'
                : 'Applying changes…'
              : 'Pending annotations'}
          </Text>
          {!progressMode && (
            <Pressable onPress={onClose} hitSlop={10}>
              <CloseIcon size={18} color="#666" />
            </Pressable>
          )}
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {items.length === 0 ? (
            <Text style={styles.empty}>No annotations yet. Tap a component on screen.</Text>
          ) : (
            items.map((item, idx) => {
              const status: ItemStatus = statusMap?.[item.id] ?? 'queued'
              const bar = BAR[status]
              return (
                <View key={item.id} style={styles.row}>
                  <View style={[styles.rowBadge, progressMode && { backgroundColor: bar.color }]}>
                    {status === 'done' ? (
                      <CheckIcon size={14} color="#fff" />
                    ) : (
                      <Text style={styles.rowBadgeText}>{idx + 1}</Text>
                    )}
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowComponent} numberOfLines={1}>
                      {item.element.component}
                      {item.fallback && <Text style={styles.rowFallback}> · grep</Text>}
                    </Text>
                    <Text style={styles.rowComment} numberOfLines={2}>
                      {item.comment || <Text style={styles.rowCommentEmpty}>(no comment)</Text>}
                    </Text>
                    {progressMode && (
                      <View style={styles.track}>
                        <View
                          style={[styles.fill, { width: bar.pct, backgroundColor: bar.color }]}
                        />
                      </View>
                    )}
                  </View>
                  {progressMode ? (
                    <Text style={[styles.statusLabel, { color: bar.color }]}>{bar.label}</Text>
                  ) : (
                    <View style={styles.rowActions}>
                      <Pressable onPress={() => onEdit(item.id)} hitSlop={6} style={styles.iconBtn}>
                        <PencilIcon size={17} color="#71717a" />
                      </Pressable>
                      <Pressable
                        onPress={() => onDelete(item.id)}
                        hitSlop={6}
                        style={styles.iconBtn}
                      >
                        <TrashIcon size={17} color="#ef4444" />
                      </Pressable>
                    </View>
                  )}
                </View>
              )
            })
          )}
        </ScrollView>

        {progressMode ? (
          allDone ? (
            <View style={styles.footerRow}>
              <Pressable style={[styles.sendBtn, styles.doneBtn]} onPress={onClose}>
                <Text style={styles.sendBtnText}>Done</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={onUndo}>
                <UndoIcon size={16} color="#ef4444" />
                <Text style={styles.cancelBtnText}>Undo</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footerRow}>
              <View style={[styles.sendBtn, styles.applyingBtn]}>
                <Text style={styles.sendBtnText}>{`Applying ${doneCount}/${items.length}…`}</Text>
              </View>
              <Pressable style={[styles.cancelBtn]} onPress={onCancel}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </View>
          )
        ) : (
          <Pressable
            style={[styles.sendBtn, (items.length === 0 || sending) && styles.sendBtnDisabled]}
            disabled={items.length === 0 || sending}
            onPress={onSend}
          >
            <Text style={styles.sendBtnText}>
              {sending ? 'Sending…' : `Send (${items.length})`}
            </Text>
          </Pressable>
        )}
      </Pressable>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  closeX: { fontSize: 18, color: '#666' },
  list: { maxHeight: 380 },
  listContent: { gap: 10 },
  empty: { color: '#999', fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 10,
  },
  rowBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  rowComponent: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  rowFallback: { color: '#d97706', fontWeight: '500', fontSize: 11 },
  rowComment: { fontSize: 13, color: '#555', marginTop: 2 },
  rowCommentEmpty: { color: '#aaa', fontStyle: 'italic' },
  track: { height: 4, borderRadius: 2, backgroundColor: '#eee', marginTop: 8, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  statusLabel: { fontSize: 11, fontWeight: '600', minWidth: 52, textAlign: 'right' },
  rowActions: { flexDirection: 'row', gap: 6 },
  iconBtn: { padding: 6 },
  iconBtnText: { fontSize: 16 },
  sendBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  footerRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  applyingBtn: { flex: 2, marginTop: 0, backgroundColor: '#1a1a1a' },
  doneBtn: { flex: 2, marginTop: 0, backgroundColor: '#16a34a' },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  cancelBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 15 },
})
