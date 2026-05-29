/**
 * HistoryCard — one entry in the History list: prompt + timestamp + status
 * badge on top, before→after screenshots below. Supports a selection checkbox
 * for bulk delete.
 */

import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  entryStatus,
  historyImageUrl,
  type EntryStatus,
  type HistoryEntry,
} from './probe-transport'
import { CheckIcon } from './icons'

const BADGE: Record<EntryStatus, { label: string; bg: string; fg: string } | null> = {
  applied: null,
  undone: { label: 'Undo', bg: '#dbeafe', fg: '#1e40af' },
  failed: { label: 'Failed', bg: '#fee2e2', fg: '#991b1b' },
}

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}
function absTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export interface HistoryCardProps {
  entry: HistoryEntry
  metroHost: string
  thumbW: number
  thumbAspect: number
  selecting: boolean
  selected: boolean
  onPress: () => void
  onLongPress: () => void
}

export function HistoryCard({
  entry: e,
  metroHost,
  thumbW,
  thumbAspect,
  selecting,
  selected,
  onPress,
  onLongPress,
}: HistoryCardProps) {
  const badge = BADGE[entryStatus(e)]
  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.cardHead}>
        {selecting && (
          <View style={[styles.checkbox, selected && styles.checkboxOn]}>
            {selected && <CheckIcon size={12} color="#fff" />}
          </View>
        )}
        <Text style={styles.cardComponent} numberOfLines={1}>
          {e.component}
        </Text>
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTime}>{`${timeAgo(e.ts)} · ${absTime(e.ts)}`}</Text>
      <Text style={styles.cardComment} numberOfLines={3}>
        {e.comment}
      </Text>
      <View style={styles.thumbRow}>
        {(['before', 'after'] as const).map((which) => (
          <View key={which} style={{ width: thumbW }}>
            <Image
              source={{ uri: historyImageUrl(e.id, which, { hostOverride: metroHost }) }}
              style={[styles.thumb, { width: thumbW, aspectRatio: thumbAspect }]}
              resizeMode="contain"
            />
            <Text style={styles.thumbLabel}>{which}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardSelected: { borderColor: '#3b82f6' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#c4c4c8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  cardComponent: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', flexShrink: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 'auto' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardTime: { fontSize: 12, color: '#999', marginTop: 2 },
  cardComment: { fontSize: 14, color: '#333', marginTop: 8, marginBottom: 12 },
  thumbRow: { flexDirection: 'row', gap: 10 },
  thumb: { borderRadius: 10, backgroundColor: '#f0f0f0' },
  thumbLabel: { fontSize: 11, color: '#999', marginTop: 4, textAlign: 'center' },
})
