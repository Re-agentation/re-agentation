/**
 * ConfirmModal — a centered confirm dialog used for destructive actions
 * (delete one / delete N). Always asks before deleting.
 */

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

export interface ConfirmModalProps {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, destructive ? styles.danger : styles.confirm]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  title: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  message: { fontSize: 14, color: '#555', marginTop: 8, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  cancel: { backgroundColor: '#f4f4f5' },
  cancelText: { color: '#1a1a1a', fontWeight: '600', fontSize: 15 },
  confirm: { backgroundColor: '#1a1a1a' },
  danger: { backgroundColor: '#ef4444' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
