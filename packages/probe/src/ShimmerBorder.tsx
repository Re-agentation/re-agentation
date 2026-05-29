/**
 * ShimmerBorder — a thick, magical glowing border drawn around a component's
 * frame while its change is being applied ("transforming now").
 *
 * A glowing emitter head (cycling purple↔gold) travels CLOCKWISE around the
 * border and sprays "magic dust": each particle launches with the emitter's
 * tangential velocity (inertia), then gravity arcs it downward before it fades
 * out. The border cross-fades deep purple↔gold and breathes.
 *
 * Pure RN Animated (no Skia). A JS scheduler recycles a fixed particle pool,
 * stamping each particle with the emitter's live position + velocity on spawn.
 * pointerEvents="none" so it never blocks touches.
 */

import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'

export interface ShimmerBorderProps {
  rect: { x: number; y: number; w: number; h: number }
  active: boolean
}

const PURPLE = '#6d28d9' // deep violet
const GOLD = '#d4a017' // deep gold
const BORDER = 2 // half the previous 4
const POOL = 56 // ~3x the old density
const SPAWN_MS = 20
const SPEED = 38 // tangential launch (inertia)
const SCATTER = 34 // random spread
const POP = 14 // initial slight outward/up
const GHALF = 78 // 0.5 * gravity (downward, accelerating)

/** Point on the rectangle perimeter (clockwise from top-left), t in [0,1). */
function perimeter(t: number, w: number, h: number): { x: number; y: number } {
  const per = 2 * (w + h)
  let d = (t % 1) * per
  if (d < w) return { x: d, y: 0 }
  d -= w
  if (d < h) return { x: w, y: d }
  d -= h
  if (d < w) return { x: w - d, y: h }
  d -= w
  return { x: 0, y: h - d }
}

/** Unit tangent (clockwise) at perimeter position t. */
function tangent(t: number, w: number, h: number): { tx: number; ty: number } {
  const per = 2 * (w + h)
  let d = (t % 1) * per
  if (d < w) return { tx: 1, ty: 0 }
  d -= w
  if (d < h) return { tx: 0, ty: 1 }
  d -= h
  if (d < w) return { tx: -1, ty: 0 }
  return { tx: 0, ty: -1 }
}

const rand = (s: number) => (Math.random() - 0.5) * 2 * s

export function ShimmerBorder({ rect, active }: ShimmerBorderProps) {
  const w = rect.w
  const h = rect.h
  const glow = useRef(new Animated.Value(0)).current
  const orbit = useRef(new Animated.Value(0)).current
  const orbitRef = useRef(0)
  const pool = useRef(
    Array.from({ length: POOL }, (_, i) => ({
      ox: new Animated.Value(-999),
      oy: new Animated.Value(-999),
      vx: new Animated.Value(0),
      vy: new Animated.Value(0),
      anim: new Animated.Value(1),
      gold: i % 2 === 0,
      size: (1.5 + (i % 3) * 0.5) * 2.3, // 2.3× → ~3.5–5.8px
      dur: 800 + (i % 5) * 120,
    })),
  ).current

  useEffect(() => {
    if (!active || w <= 0 || h <= 0) return
    const orbitAnim = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    )
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    )
    orbitAnim.start()
    glowAnim.start()
    const lid = orbit.addListener(({ value }) => (orbitRef.current = value))

    let idx = 0
    const spawn = setInterval(() => {
      const p = pool[idx % POOL]!
      idx++
      const t = orbitRef.current
      const { x, y } = perimeter(t, w, h)
      const { tx, ty } = tangent(t, w, h)
      p.ox.setValue(x)
      p.oy.setValue(y)
      p.vx.setValue(tx * SPEED + rand(SCATTER))
      p.vy.setValue(ty * SPEED - POP + rand(SCATTER * 0.5))
      p.anim.setValue(0)
      Animated.timing(p.anim, {
        toValue: 1,
        duration: p.dur,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start()
    }, SPAWN_MS)

    return () => {
      clearInterval(spawn)
      orbit.removeListener(lid)
      orbitAnim.stop()
      glowAnim.stop()
    }
  }, [active, w, h, glow, orbit, pool])

  if (w <= 0 || h <= 0) return null

  const breathe = glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] })
  const scale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] })
  const goldOpacity = glow
  const purpleOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
  const headColor = glow.interpolate({ inputRange: [0, 1], outputRange: [PURPLE, GOLD] })

  const per = 2 * (w + h)
  const segs = [0, w / per, (w + h) / per, (2 * w + h) / per, 1]
  const headX = orbit.interpolate({ inputRange: segs, outputRange: [0, w, w, 0, 0] })
  const headY = orbit.interpolate({ inputRange: segs, outputRange: [0, 0, h, h, 0] })

  const layer = (
    color: string,
    opacity: Animated.AnimatedInterpolation<number> | Animated.Value,
  ) => (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: w,
        height: h,
        borderWidth: BORDER,
        borderColor: color,
        borderRadius: 10,
        opacity,
        shadowColor: color,
        shadowOpacity: 0.9,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  )

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: w,
        height: h,
        opacity: breathe,
        transform: [{ scale }],
      }}
    >
      {layer(PURPLE, purpleOpacity)}
      {layer(GOLD, goldOpacity)}

      {/* magic-dust particles: tangential inertia + gravity arc, then fade */}
      {pool.map((p, i) => {
        const a2 = Animated.multiply(p.anim, p.anim)
        const tx = Animated.add(p.ox, Animated.multiply(p.vx, p.anim))
        const ty = Animated.add(
          p.oy,
          Animated.add(Animated.multiply(p.vy, p.anim), Animated.multiply(a2, GHALF)),
        )
        const opacity = p.anim.interpolate({
          inputRange: [0, 0.12, 0.7, 1],
          outputRange: [0, 1, 0.8, 0],
        })
        const pscale = p.anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] })
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: -p.size / 2,
              top: -p.size / 2,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: p.gold ? GOLD : PURPLE,
              shadowColor: p.gold ? GOLD : PURPLE,
              shadowOpacity: 1,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 0 },
              opacity,
              transform: [{ translateX: tx }, { translateY: ty }, { scale: pscale }],
            }}
          />
        )
      })}

      {/* glowing emitter head orbiting the border (cycles purple↔gold) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -1.75,
          top: -1.75,
          width: 3.5,
          height: 3.5,
          borderRadius: 1.75,
          backgroundColor: headColor,
          shadowColor: GOLD,
          shadowOpacity: 1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
          transform: [{ translateX: headX }, { translateY: headY }],
        }}
      />
    </Animated.View>
  )
}
