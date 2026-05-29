/**
 * CommentSheet — bottom sheet that appears after a tap.
 * Captured element identity + comment input + optional image/video
 * attachments + Add/Send Now actions. Tapping outside minimizes/cancels.
 */

import { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import type { CapturedElement, MediaAttachment } from './types'
import { PaperclipIcon } from './icons'
import { isMediaPickerAvailable, pickMedia, type PickedMedia } from './media-picker'

export interface CommentSheetProps {
  element: CapturedElement
  isFallback?: boolean
  onAdd: (comment: string, media: MediaAttachment[]) => void
  onSendNow: (comment: string, media: MediaAttachment[]) => void
  onCancel: () => void
  onMinimize?: () => void
  /** Uploads a picked asset → returns a served MediaAttachment (probe owns the host). */
  onUpload?: (picked: PickedMedia) => Promise<MediaAttachment | null>
}

export function CommentSheet({
  element,
  isFallback,
  onAdd,
  onSendNow,
  onCancel,
  onMinimize,
  onUpload,
}: CommentSheetProps) {
  const [comment, setComment] = useState('')
  const [media, setMedia] = useState<MediaAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const { width, height } = useWindowDimensions()

  const canAttach = !!onUpload && isMediaPickerAvailable()

  const onAttach = async () => {
    if (!onUpload) return
    setUploading(true)
    try {
      const picked = await pickMedia()
      const uploaded: MediaAttachment[] = []
      for (const p of picked) {
        const att = await onUpload(p)
        if (att) uploaded.push(att)
      }
      if (uploaded.length) setMedia((m) => [...m, ...uploaded])
    } finally {
      setUploading(false)
    }
  }

  const sourceText =
    element.source != null
      ? `${element.source.file}:${element.source.line}`
      : 'source not resolved — Claude will grep by name'

  return (
    <Pressable style={[styles.backdrop, { width, height }]} onPress={onMinimize ?? onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <Pressable style={styles.sheet} onPress={() => {}}>
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

          {media.length > 0 && (
            <ScrollView horizontal style={styles.thumbs} contentContainerStyle={styles.thumbsRow}>
              {media.map((m, i) => (
                <View key={i} style={styles.thumb}>
                  {m.type === 'image' ? (
                    <Image source={{ uri: m.url }} style={styles.thumbImg} />
                  ) : (
                    <View style={[styles.thumbImg, styles.thumbVideo]}>
                      <Text style={styles.thumbVideoText}>▶</Text>
                    </View>
                  )}
                  <Pressable
                    style={styles.thumbX}
                    onPress={() => setMedia((arr) => arr.filter((_, j) => j !== i))}
                  >
                    <Text style={styles.thumbXText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            {canAttach && (
              <Pressable
                style={[styles.attachBtn, uploading && styles.btnDisabled]}
                disabled={uploading}
                onPress={onAttach}
              >
                <PaperclipIcon size={18} color="#1a1a1a" />
              </Pressable>
            )}
            <Pressable
              style={[styles.btn, styles.btnSecondary, !comment.trim() && styles.btnDisabled]}
              disabled={!comment.trim()}
              onPress={() => onSendNow(comment.trim(), media)}
            >
              <Text style={styles.btnSecondaryText}>Send now</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, !comment.trim() && styles.btnDisabled]}
              disabled={!comment.trim()}
              onPress={() => onAdd(comment.trim(), media)}
            >
              <Text style={styles.btnPrimaryText}>Add to batch</Text>
            </Pressable>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
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
  kav: { width: '100%' },
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
  thumbs: { marginBottom: 12 },
  thumbsRow: { gap: 8 },
  thumb: { width: 64, height: 64 },
  thumbImg: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#eee' },
  thumbVideo: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  thumbVideoText: { color: '#fff', fontSize: 22 },
  thumbX: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbXText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  attachBtn: {
    width: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e5e5e5' },
  btnGhostText: { color: '#666', fontWeight: '600' },
  btnSecondary: { backgroundColor: '#f4f4f5' },
  btnSecondaryText: { color: '#1a1a1a', fontWeight: '600' },
  btnPrimary: { backgroundColor: '#1a1a1a' },
  btnPrimaryText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
})
