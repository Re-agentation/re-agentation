/**
 * BatchTraySheet — review sheet listing all pending items in the current batch.
 * Per-row edit/delete; bottom "Send (N)" CTA.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { BatchItem } from './types'

export interface BatchTraySheetProps {
  items: BatchItem[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onSend: () => void
  onClose: () => void
  sending?: boolean
}

export function BatchTraySheet({
  items,
  onEdit,
  onDelete,
  onSend,
  onClose,
  sending,
}: BatchTraySheetProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Pending annotations</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.closeX}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {items.length === 0 ? (
            <Text style={styles.empty}>No annotations yet. Tap a component on screen.</Text>
          ) : (
            items.map((item, idx) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rowBadge}>
                  <Text style={styles.rowBadgeText}>{idx + 1}</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowComponent} numberOfLines={1}>
                    {item.element.component}
                    {item.fallback && <Text style={styles.rowFallback}> · grep</Text>}
                  </Text>
                  <Text style={styles.rowComment} numberOfLines={2}>
                    {item.comment || <Text style={styles.rowCommentEmpty}>(no comment)</Text>}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable onPress={() => onEdit(item.id)} hitSlop={6} style={styles.iconBtn}>
                    <Text style={styles.iconBtnText}>✎</Text>
                  </Pressable>
                  <Pressable onPress={() => onDelete(item.id)} hitSlop={6} style={styles.iconBtn}>
                    <Text style={styles.iconBtnText}>🗑</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <Pressable
          style={[styles.sendBtn, (items.length === 0 || sending) && styles.sendBtnDisabled]}
          disabled={items.length === 0 || sending}
          onPress={onSend}
        >
          <Text style={styles.sendBtnText}>{sending ? 'Sending…' : `Send (${items.length})`}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
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
  list: { maxHeight: 360 },
  listContent: { gap: 8 },
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
})
