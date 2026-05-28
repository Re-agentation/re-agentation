/**
 * MarkerLayer — absolute-positioned numbered badges over captured components.
 * Pure visual layer; pointerEvents="none" so it never intercepts taps.
 */

import { View, Text, StyleSheet } from 'react-native'
import type { BatchItem } from './types'

export interface MarkerLayerProps {
  items: BatchItem[]
}

export function MarkerLayer({ items }: MarkerLayerProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((item, idx) => {
        const c = item.markerCoords
        if (!c) return null
        return (
          <View
            key={item.id}
            style={[
              styles.badge,
              {
                left: c.x + c.w - 14,
                top: c.y - 14,
              },
            ]}
          >
            <Text style={styles.badgeText}>{idx + 1}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
})
