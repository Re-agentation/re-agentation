/**
 * <AgentationProbe />
 *
 * Root-mounted dev-only overlay. Renders nothing in production. In dev,
 * shows a draggable floating toggle. When armed, captures the next tap and
 * routes it through the comment-sheet → batch-tray → send flow.
 *
 * The toggle can be dragged and snaps to the nearest screen corner, so it
 * never permanently blocks the component sitting underneath it.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { GestureResponderEvent } from 'react-native'
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'

import { BatchTraySheet } from './BatchTraySheet'
import { CommentSheet } from './CommentSheet'
import { MarkerLayer } from './MarkerLayer'
import { captureAt } from './fiber-walk'
import { resolveMetroHost, sendBatch } from './probe-transport'
import { useBatch } from './useBatchStore'
import type { BatchItem, BatchPayload, CapturedElement } from './types'
import { uuid } from './uuid'

type Corner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
type Phase = 'idle' | 'armed' | 'commenting' | 'reviewing'

export type ProbePosition = Corner

export interface AgentationProbeProps {
  metroHost?: string
  position?: Corner
  storageKey?: string
  /** Emit `[re-agentation]` capture diagnostics to the Metro console. */
  debug?: boolean
}

declare const __DEV__: boolean

const BTN = 44
const MARGIN = 16
const TOP_INSET = 60
const BOTTOM_INSET = 40

export function AgentationProbe(props: AgentationProbeProps = {}): React.ReactElement | null {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return null
  return <AgentationProbeInner {...props} />
}

function AgentationProbeInner({
  metroHost: metroHostOverride,
  position = 'top-right',
  debug = false,
}: AgentationProbeProps): React.ReactElement {
  const { width, height } = useWindowDimensions()
  const [phase, setPhase] = useState<Phase>('idle')
  const [corner, setCorner] = useState<Corner>(position)
  const [captured, setCaptured] = useState<{
    element: CapturedElement
    fallback: boolean
    markerCoords?: BatchItem['markerCoords']
  } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const metroHost = useMemo(() => resolveMetroHost(metroHostOverride), [metroHostOverride])
  const { items, actions } = useBatch()

  const cornerXY = useCallback(
    (c: Corner) => {
      const left = c.endsWith('left') ? MARGIN : width - MARGIN - BTN
      const top = c.startsWith('top') ? TOP_INSET : height - BOTTOM_INSET - BTN
      return { x: left, y: top }
    },
    [width, height],
  )

  // Draggable toggle position.
  const pan = useRef(new Animated.ValueXY(cornerXY(position))).current
  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  const nearestCorner = useCallback(
    (px: number, py: number): Corner => {
      const right = px + BTN / 2 > width / 2
      const bottom = py + BTN / 2 > height / 2
      return `${bottom ? 'bottom' : 'top'}-${right ? 'right' : 'left'}` as Corner
    },
    [width, height],
  )

  const onToggle = useCallback(() => {
    setPhase((p) => (p === 'idle' ? 'armed' : p === 'armed' ? 'idle' : p))
  }, [])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
        onPanResponderGrant: () => {
          const cur = cornerXY(corner)
          // @ts-expect-error _value is internal but stable
          pan.setOffset({ x: pan.x._value ?? cur.x, y: pan.y._value ?? cur.y })
          pan.setValue({ x: 0, y: 0 })
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_e, g) => {
          pan.flattenOffset()
          const moved = Math.hypot(g.dx, g.dy) > 6
          if (!moved) {
            onToggle()
            // settle back exactly to the current corner
            Animated.spring(pan, {
              toValue: cornerXY(corner),
              useNativeDriver: false,
              friction: 7,
            }).start()
            return
          }
          // @ts-expect-error _value internal
          const px = pan.x._value as number
          // @ts-expect-error _value internal
          const py = pan.y._value as number
          const next = nearestCorner(px, py)
          setCorner(next)
          Animated.spring(pan, {
            toValue: cornerXY(next),
            useNativeDriver: false,
            friction: 7,
          }).start()
        },
      }),
    [pan, corner, cornerXY, nearestCorner, onToggle],
  )

  // ─── tap interception ─────────────────────────────────────────────────

  const onCapture = useCallback(
    async (e: GestureResponderEvent) => {
      if (phaseRef.current !== 'armed') return
      const { pageX, pageY } = e.nativeEvent
      try {
        const result = await captureAt({ x: pageX, y: pageY }, { metroHost, debug })
        if (!result) {
          if (debug) console.log('[re-agentation] tap produced no capture at', pageX, pageY)
          return
        }
        setCaptured({
          element: {
            component: result.component,
            tree: result.tree,
            source: result.source,
            props: result.props,
          },
          fallback: result.fallback,
          markerCoords: result.markerCoords,
        })
        setPhase('commenting')
      } catch (err) {
        if (debug) console.log('[re-agentation] capture threw', String(err))
      }
    },
    [metroHost, debug],
  )

  // ─── commenting / batch actions ───────────────────────────────────────

  const finishCapture = useCallback(
    (comment: string, sendNow: boolean) => {
      if (!captured) return
      const item: BatchItem = {
        id: uuid(),
        element: captured.element,
        comment,
        fallback: captured.fallback,
        markerCoords: captured.markerCoords,
      }
      actions.add(item)
      setCaptured(null)
      if (sendNow) {
        void doSend([...items, item])
        setPhase('idle')
      } else {
        setPhase('armed')
      }
    },
    [captured, items, actions], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const editingItem = useMemo(
    () => (editingId ? (items.find((it) => it.id === editingId) ?? null) : null),
    [editingId, items],
  )

  const finishEdit = useCallback(
    (comment: string) => {
      if (!editingId) return
      actions.update(editingId, { comment })
      setEditingId(null)
      setPhase('reviewing')
    },
    [editingId, actions],
  )

  const doSend = useCallback(
    async (toSend: BatchItem[]): Promise<void> => {
      if (toSend.length === 0) return
      setSending(true)
      const payload: BatchPayload = {
        batchId: uuid(),
        ts: new Date().toISOString(),
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        items: toSend,
      }
      const result = await sendBatch(payload, { hostOverride: metroHost })
      setSending(false)
      if (result.ok) actions.clear()
      // eslint-disable-next-line no-console
      else console.warn('[re-agentation] send failed:', result.error)
    },
    [metroHost, actions],
  )

  // ─── render ──────────────────────────────────────────────────────────

  const showCaptureLayer = phase === 'armed'
  const showBorder = phase !== 'idle'

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {showBorder && <View pointerEvents="none" style={styles.borderIndicator} />}

      {/* Tap capture layer (only when armed). Sits BELOW the toggle so the
          toggle stays draggable/tappable while armed. */}
      {showCaptureLayer && (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onCapture}
        />
      )}

      <MarkerLayer items={items} />

      {/* Tray button — follows the toggle's corner, offset inward. */}
      {(phase === 'armed' || phase === 'reviewing') && items.length > 0 && (
        <Pressable
          style={[styles.tray, trayPos(corner, width, height)]}
          onPress={() => setPhase('reviewing')}
        >
          <Text style={styles.trayText}>{items.length}</Text>
        </Pressable>
      )}

      {/* Draggable floating toggle (always on top). */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.toggle, { transform: pan.getTranslateTransform() }]}
      >
        <Text style={[styles.toggleText, phase === 'armed' && styles.toggleTextActive]}>
          {phase === 'idle' ? '◉' : '●'}
        </Text>
      </Animated.View>

      {phase === 'commenting' && captured && (
        <CommentSheet
          element={captured.element}
          isFallback={captured.fallback}
          onAdd={(c) => finishCapture(c, false)}
          onSendNow={(c) => finishCapture(c, true)}
          onCancel={() => {
            setCaptured(null)
            setPhase('armed')
          }}
        />
      )}

      {editingItem && (
        <CommentSheet
          element={editingItem.element}
          isFallback={editingItem.fallback}
          onAdd={(c) => finishEdit(c)}
          onSendNow={(c) => {
            finishEdit(c)
            setTimeout(() => void doSend(items), 0)
          }}
          onCancel={() => {
            setEditingId(null)
            setPhase('reviewing')
          }}
        />
      )}

      {phase === 'reviewing' && !editingItem && (
        <BatchTraySheet
          items={items}
          sending={sending}
          onEdit={(id) => setEditingId(id)}
          onDelete={(id) => actions.remove(id)}
          onClose={() => setPhase('armed')}
          onSend={async () => {
            await doSend(items)
            setPhase('idle')
          }}
        />
      )}
    </View>
  )
}

// Tray sits just inside the toggle's corner, offset along the vertical edge
// so the two never overlap.
function trayPos(corner: Corner, width: number, height: number) {
  const left = corner.endsWith('left') ? MARGIN : width - MARGIN - BTN
  const top = corner.startsWith('top')
    ? TOP_INSET + BTN + 12
    : height - BOTTOM_INSET - BTN - BTN - 12
  return { left, top }
}

const styles = StyleSheet.create({
  borderIndicator: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: '#ef4444',
  },
  toggle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  toggleText: { color: '#fff', fontSize: 22, lineHeight: 24 },
  toggleTextActive: { color: '#ef4444' },
  tray: {
    position: 'absolute',
    minWidth: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  trayText: { color: '#fff', fontSize: 17, fontWeight: '700' },
})
