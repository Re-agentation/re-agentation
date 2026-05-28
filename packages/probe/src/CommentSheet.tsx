/**
 * CommentSheet — bottom sheet that appears after a tap.
 * Shows captured element identity + a comment input + Add/Send Now actions.
 */

import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { CapturedElement } from './types'

export interface CommentSheetProps {
  element: CapturedElement
  isFallback?: boolean
  onAdd: (comment: string) => void
  onSendNow: (comment: string) => void
  onCancel: () => void
}

export function CommentSheet({
  element,
  isFallback,
  onAdd,
  onSendNow,
  onCancel,
}: CommentSheetProps) {
  const [comment, setComment] = useState('')

  const sourceText =
    element.source != null
      ? `${element.source.file}:${element.source.line}`
      : 'source not resolved — Claude will grep by name'

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.wrapper}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.componentName}>{element.component}</Text>
          {element.tree.length > 1 && (
            <Text style={styles.tree} numberOfLines={1}>
              {element.tree.slice(0, -1).join(' › ')}
            </Text>
          )}
          <Text style={[styles.source, isFallback && styles.sourceFallback]} numberOfLines={2}>
            {sourceText}
          </Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="What should change? e.g. 'make this bigger' or 'use brand color'"
          placeholderTextColor="#999"
          multiline
          value={comment}
          onChangeText={setComment}
          autoFocus
        />

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnSecondary, !comment.trim() && styles.btnDisabled]}
            disabled={!comment.trim()}
            onPress={() => onSendNow(comment.trim())}
          >
            <Text style={styles.btnSecondaryText}>Send now</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnPrimary, !comment.trim() && styles.btnDisabled]}
            disabled={!comment.trim()}
            onPress={() => onAdd(comment.trim())}
          >
            <Text style={styles.btnPrimaryText}>Add to batch</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrapper: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 8,
    elevation: 8,
  },
  header: { marginBottom: 12 },
  componentName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  tree: { fontSize: 12, color: '#999', marginTop: 2 },
  source: {
    fontSize: 11,
    color: '#3b82f6',
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sourceFallback: { color: '#d97706' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 12,
    minHeight: 90,
    fontSize: 15,
    color: '#1a1a1a',
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e5e5e5' },
  btnGhostText: { color: '#666', fontWeight: '600' },
  btnSecondary: { backgroundColor: '#f4f4f5' },
  btnSecondaryText: { color: '#1a1a1a', fontWeight: '600' },
  btnPrimary: { backgroundColor: '#1a1a1a' },
  btnPrimaryText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
})
