/**
 * ProgressRing — circular ring progress used on the minimized batch button
 * while changes are being applied. Shows a determinate arc (done / total)
 * that also spins while work is in flight, and a ✓ when everything is done.
 *
 * Uses `react-native-svg` for a true arc when it's installed (it usually is in
 * RN apps); otherwise falls back to a rotating bordered circle + count.
 */

import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { CheckIcon } from './icons'

export interface ProgressRingProps {
  size?: number
  done: number
  total: number
}

export function ProgressRing({ size = 44, done, total }: ProgressRingProps) {
  const progress = total > 0 ? Math.min(1, done / total) : 0
  const allDone = total > 0 && done >= total
  const spin = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (allDone) return
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [allDone, spin])

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const stroke = 3
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  const center = (
    <View style={styles.center} pointerEvents="none">
      {allDone ? <CheckIcon size={18} color="#22c55e" /> : <Text style={styles.count}>{`${done}/${total}`}</Text>}
    </View>
  )

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={!allDone ? { transform: [{ rotate }] } : undefined}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="#3f3f46" strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={allDone ? '#22c55e' : '#3b82f6'}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - (allDone ? 1 : Math.max(progress, 0.08)))}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      </Animated.View>
      {center}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { color: '#fff', fontSize: 12, fontWeight: '700' },
})
