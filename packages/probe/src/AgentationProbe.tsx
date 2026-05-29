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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { captureAt } from './fiber-walk'
import { ProgressRing } from './ProgressRing'
import { ShimmerBorder } from './ShimmerBorder'
import { HistoryScreen } from './HistoryScreen'
import { HistoryDetail } from './HistoryDetail'
import { ClockIcon } from './icons'
import { getCurrentRouteName } from './nav-ref'
import type { PickedMedia } from './media-picker'
import {
  cancelBatch,
  getBatchStatus,
  resolveMetroHost,
  sendBatch,
  undoBatch,
  uploadMedia,
  type HistoryEntry,
  type ItemStatus,
} from './probe-transport'
import { useBatch } from './useBatchStore'
import type { BatchItem, BatchPayload, CapturedElement, MediaAttachment } from './types'
import { uuid } from './uuid'

type Corner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
type Phase = 'idle' | 'armed' | 'commenting' | 'reviewing' | 'progress'

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
const SLOT_GAP = BTN + 8 // distance between stacked floating buttons
const MAX_BATCH = 3 // max annotations per Send (see fix #5)

/**
 * Offset (in px, relative to the draggable toggle at slot 0) for a secondary
 * floating button. Top corners stack DOWNWARD; bottom corners stack
 * HORIZONTALLY inward — otherwise a button below a bottom-corner toggle would
 * fall off-screen (bug #1) and a static-positioned one would overlap (bug #3).
 */
function slotOffset(corner: Corner, index: number): { dx: number; dy: number } {
  if (corner.startsWith('top')) return { dx: 0, dy: SLOT_GAP * index }
  const dir = corner.endsWith('right') ? -1 : 1
  return { dx: SLOT_GAP * index * dir, dy: 0 }
}

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
    route?: string | null
  } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sentBatchId, setSentBatchId] = useState<string | null>(null)
  const [statusMap, setStatusMap] = useState<Record<string, ItemStatus>>({})
  // Briefly hides the capture layer during a hit-test so it doesn't capture itself.
  const [captureHidden, setCaptureHidden] = useState(false)
  // Sheet minimized to the floating button (state preserved).
  const [minimized, setMinimized] = useState(false)
  // Full-screen history overlay.
  const [historyView, setHistoryView] = useState<'none' | 'list' | 'detail'>('none')
  const [historyEntry, setHistoryEntry] = useState<HistoryEntry | null>(null)
  // Per-capture namespace for media uploads (independent of the send batchId).
  const mediaNs = useRef<string>(uuid())

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
      // Hide the full-screen capture layer BEFORE hit-testing. Otherwise the
      // native hit-test (findNodeAtPoint) returns our own overlay instead of
      // the app component beneath it. The gesture is already finished (this is
      // onResponderRelease), so unmounting the layer now is safe. Wait two
      // frames so React commits the unmount into the native shadow tree.
      setCaptureHidden(true)
      await nextFrames(2)
      try {
        const result = await captureAt({ x: pageX, y: pageY }, { metroHost, debug })
        if (!result) {
          if (debug) console.log('[re-agentation] tap produced no capture at', pageX, pageY)
          setCaptureHidden(false)
          return
        }
        mediaNs.current = uuid()
        setCaptured({
          element: {
            component: result.component,
            tree: result.tree,
            source: result.source,
            props: result.props,
          },
          fallback: result.fallback,
          markerCoords: result.markerCoords,
          route: getCurrentRouteName(),
        })
        setCaptureHidden(false)
        setPhase('commenting')
      } catch (err) {
        if (debug) console.log('[re-agentation] capture threw', String(err))
        setCaptureHidden(false)
      }
    },
    [metroHost, debug],
  )

  // ─── commenting / batch actions ───────────────────────────────────────

  const finishCapture = useCallback(
    (comment: string, media: MediaAttachment[], sendNow: boolean) => {
      if (!captured) return
      // Cap the batch (bug #5): a Send applies at most MAX_BATCH items reliably,
      // so we refuse to grow the queue past that. The current capture is
      // discarded with a console note rather than silently dropped later.
      if (!sendNow && items.length >= MAX_BATCH) {
        // eslint-disable-next-line no-console
        console.warn(
          `[re-agentation] batch is full (max ${MAX_BATCH}) — send or remove an item first`,
        )
        setCaptured(null)
        setPhase('reviewing')
        return
      }
      const item: BatchItem = {
        id: uuid(),
        element: captured.element,
        comment,
        fallback: captured.fallback,
        markerCoords: captured.markerCoords,
        media: media.length ? media : undefined,
        route: captured.route ?? null,
      }
      actions.add(item)
      setCaptured(null)
      if (sendNow) {
        void doSend([...items, item].slice(0, MAX_BATCH))
      } else {
        setPhase('armed')
      }
    },
    [captured, items, actions], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Upload a picked asset under this capture's media namespace.
  const onUpload = useCallback(
    async (picked: PickedMedia): Promise<MediaAttachment | null> => {
      const url = await uploadMedia(
        { batchId: mediaNs.current, base64: picked.base64, ext: picked.ext, kind: picked.type },
        { hostOverride: metroHost },
      )
      return url ? { type: picked.type, url, name: picked.name } : null
    },
    [metroHost],
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
      const batchId = uuid()
      const payload: BatchPayload = {
        batchId,
        ts: new Date().toISOString(),
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        items: toSend,
      }
      const result = await sendBatch(payload, { hostOverride: metroHost })
      setSending(false)
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.warn('[re-agentation] send failed:', result.error)
        return // stay in the current sheet so the user can retry
      }
      // Enter live-progress mode: keep the tray open and poll status.
      setStatusMap(Object.fromEntries(toSend.map((it) => [it.id, 'queued' as ItemStatus])))
      setSentBatchId(batchId)
      setMinimized(false)
      setPhase('progress')
    },
    [metroHost],
  )

  const closeProgress = useCallback(() => {
    actions.clear()
    setStatusMap({})
    setSentBatchId(null)
    setMinimized(false)
    setPhase('idle')
  }, [actions])

  // Cancel an in-flight batch → roll back to review with items intact.
  const cancelProgress = useCallback(() => {
    const id = sentBatchId
    if (id) void cancelBatch(id, { hostOverride: metroHost })
    setStatusMap({})
    setSentBatchId(null)
    setMinimized(false)
    setPhase('reviewing')
  }, [sentBatchId, metroHost])

  const doneCount = items.filter((it) => statusMap[it.id] === 'done').length

  // Poll live per-item status while in progress mode.
  useEffect(() => {
    if (phase !== 'progress' || !sentBatchId) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const markAllDone = () =>
      setStatusMap((m) => {
        const n: Record<string, ItemStatus> = {}
        for (const k of Object.keys(m)) n[k] = 'done'
        return n
      })
    const poll = async () => {
      const st = await getBatchStatus(sentBatchId, { hostOverride: metroHost })
      if (!active) return
      if (!st || st.found === false) {
        markAllDone() // archived = fully acked
        return
      }
      const map: Record<string, ItemStatus> = {}
      for (const it of st.items) map[it.id] = it.status
      setStatusMap(map)
      const allDone = st.items.length > 0 && st.items.every((i) => i.status === 'done')
      if (!allDone) timer = setTimeout(poll, 400)
    }
    timer = setTimeout(poll, 300)
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [phase, sentBatchId, metroHost])

  // Transform for a secondary floating button at `index`, relative to the
  // draggable toggle (slot 0). Follows the toggle and lays out downward
  // (top corners) or horizontally inward (bottom corners).
  const slotTransform = useCallback(
    (index: number) => {
      const off = slotOffset(corner, index)
      return [
        { translateX: Animated.add(pan.x, off.dx) },
        { translateY: Animated.add(pan.y, off.dy) },
      ]
    },
    [corner, pan],
  )

  // ─── render ──────────────────────────────────────────────────────────

  const showCaptureLayer = phase === 'armed' && !captureHidden
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

      {/* Floating batch button (slot 2) — shows the count (review/armed) or a
          live progress ring (applying, minimized). Follows the toggle and never
          overlaps the history button. Tap to open/reopen the sheet. */}
      {(() => {
        const showArmedCount = phase === 'armed' && items.length > 0
        const showReviewMin = phase === 'reviewing' && minimized && items.length > 0
        const showProgressMin = phase === 'progress' && minimized
        if (!showArmedCount && !showReviewMin && !showProgressMin) return null
        return (
          <Animated.View style={[styles.slot, { transform: slotTransform(2) }]}>
            <Pressable
              style={[styles.tray, showProgressMin && styles.trayProgress]}
              onPress={() => {
                if (showProgressMin) setMinimized(false)
                else {
                  setMinimized(false)
                  setPhase('reviewing')
                }
              }}
            >
              {showProgressMin ? (
                <ProgressRing done={doneCount} total={items.length} />
              ) : (
                <Text style={styles.trayText}>{items.length}</Text>
              )}
            </Pressable>
          </Animated.View>
        )
      })()}

      {/* Draggable floating toggle (slot 0, always on top). */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.toggle, { transform: pan.getTranslateTransform() }]}
      >
        <Text style={[styles.toggleText, phase === 'armed' && styles.toggleTextActive]}>
          {phase === 'idle' ? '◉' : '●'}
        </Text>
      </Animated.View>

      {/* History button (slot 1) — follows the toggle, laid out downward (top
          corners) or horizontally inward (bottom corners). */}
      <Animated.View style={[styles.historyBtn, { transform: slotTransform(1) }]}>
        <Pressable style={styles.historyPress} hitSlop={8} onPress={() => setHistoryView('list')}>
          <ClockIcon size={20} color="#fff" />
        </Pressable>
      </Animated.View>

      {phase === 'commenting' && captured && (
        <CommentSheet
          element={captured.element}
          isFallback={captured.fallback}
          onAdd={(c, media) => finishCapture(c, media, false)}
          onSendNow={(c, media) => finishCapture(c, media, true)}
          onUpload={onUpload}
          onCancel={() => {
            setCaptured(null)
            setPhase('armed')
          }}
          onMinimize={() => {
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
          onMinimize={() => {
            setEditingId(null)
            setPhase('reviewing')
          }}
        />
      )}

      {phase === 'reviewing' && !editingItem && !minimized && (
        <BatchTraySheet
          items={items}
          sending={sending}
          onEdit={(id) => setEditingId(id)}
          onDelete={(id) => actions.remove(id)}
          onClose={() => setPhase('armed')}
          onMinimize={() => setMinimized(true)}
          onSend={() => void doSend(items)}
        />
      )}

      {/* Live-progress sheet: stays open after Send, shows per-item bars.
          Outside-tap minimizes to the ring button; Cancel rolls back. */}
      {phase === 'progress' && !minimized && (
        <BatchTraySheet
          items={items}
          statusMap={statusMap}
          onEdit={() => {}}
          onDelete={() => {}}
          onSend={() => {}}
          onClose={closeProgress}
          onMinimize={() => setMinimized(true)}
          onCancel={cancelProgress}
          onUndo={() => {
            const id = sentBatchId
            if (id) void undoBatch(id, { hostOverride: metroHost })
            closeProgress()
          }}
        />
      )}

      {/* Shimmer/glow border on each component while its change applies
          (shown even when the sheet is minimized). */}
      {phase === 'progress' &&
        items.map((it) =>
          it.markerCoords && statusMap[it.id] !== 'done' ? (
            <ShimmerBorder
              key={`shim-${it.id}`}
              rect={it.markerCoords}
              active={statusMap[it.id] === 'processing'}
            />
          ) : null,
        )}

      {/* Full-screen history overlay. */}
      {historyView === 'list' && (
        <HistoryScreen
          metroHost={metroHost}
          onClose={() => setHistoryView('none')}
          onOpen={(entry) => {
            setHistoryEntry(entry)
            setHistoryView('detail')
          }}
        />
      )}
      {historyView === 'detail' && historyEntry && (
        <HistoryDetail
          entry={historyEntry}
          metroHost={metroHost}
          onBack={() => setHistoryView('list')}
          onChanged={() => setHistoryView('list')}
        />
      )}
    </View>
  )
}

// Resolve after `n` animation frames — used to let React commit an unmount
// (hiding the capture layer) into the native shadow tree before hit-testing.
function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0
    const tick = () => {
      if (++count >= n) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
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
  slot: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tray: {
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
  trayProgress: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 0,
    width: 48,
    minWidth: 48,
    height: 48,
    borderRadius: 24,
  },
  historyBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    backgroundColor: '#3f3f46',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  historyPress: { width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center' },
})
