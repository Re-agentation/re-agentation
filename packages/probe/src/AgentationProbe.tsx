/**
 * <AgentationProbe />
 *
 * Root-mounted dev-only overlay. Renders nothing in production. In dev,
 * shows a floating toggle. When toggled on, captures the next tap and
 * routes it through the comment-sheet → batch-tray → send flow.
 *
 * Designed to mount once at the top of the React tree (inside whatever
 * provider chain you already have). Doesn't add new providers.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { BatchTraySheet } from './BatchTraySheet'
import { CommentSheet } from './CommentSheet'
import { MarkerLayer } from './MarkerLayer'
import { captureAt } from './fiber-walk'
import { resolveMetroHost, sendBatch } from './probe-transport'
import { useBatch } from './useBatchStore'
import type { BatchItem, BatchPayload, CapturedElement } from './types'
import { uuid } from './uuid'

type Position = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
type Phase = 'idle' | 'armed' | 'commenting' | 'reviewing'

export type ProbePosition = Position

export interface AgentationProbeProps {
  metroHost?: string
  position?: Position
  storageKey?: string
}

declare const __DEV__: boolean

export function AgentationProbe(props: AgentationProbeProps = {}): React.ReactElement | null {
  // Hard prod gate. Most bundlers DCE this on production builds since __DEV__
  // is a const false then.
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return null
  }
  return <AgentationProbeInner {...props} />
}

function AgentationProbeInner({
  metroHost: metroHostOverride,
  position = 'top-right',
}: AgentationProbeProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('idle')
  const [captured, setCaptured] = useState<{ element: CapturedElement; fallback: boolean } | null>(
    null,
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const containerLayout = useRef<{ w: number; h: number }>({ w: 0, h: 0 })

  const metroHost = useMemo(() => resolveMetroHost(metroHostOverride), [metroHostOverride])
  const { items, actions } = useBatch()

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    containerLayout.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }
  }, [])

  // ─── tap interception ─────────────────────────────────────────────────

  const onCapture = useCallback(
    async (e: GestureResponderEvent) => {
      if (phase !== 'armed') return
      const { pageX, pageY } = e.nativeEvent
      try {
        const result = await captureAt({ x: pageX, y: pageY }, { metroHost })
        if (!result) {
          // Nothing was hit — return to armed.
          return
        }
        // capture-fallback flag is smuggled on the result; pull it off.
        const fallback = (result as any).__fallback === true
        const clean: CapturedElement = {
          component: result.component,
          tree: result.tree,
          source: result.source,
          props: result.props,
        }
        setCaptured({ element: clean, fallback })
        setPhase('commenting')
      } catch {
        // ignore — back to armed
      }
    },
    [phase, metroHost],
  )

  // ─── commenting actions ──────────────────────────────────────────────

  const finishCapture = useCallback(
    (comment: string, sendNow: boolean) => {
      if (!captured) return
      const item: BatchItem = {
        id: uuid(),
        element: captured.element,
        comment,
        fallback: captured.fallback,
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

  // ─── send ────────────────────────────────────────────────────────────

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
      if (result.ok) {
        actions.clear()
      } else {
        // Keep items in the batch so the user can retry.
        // eslint-disable-next-line no-console
        console.warn('[re-agentation] send failed:', result.error)
      }
    },
    [metroHost, actions],
  )

  // ─── render ──────────────────────────────────────────────────────────

  const toggleButtonStyle = positionStyle(position)
  const showCaptureLayer = phase === 'armed'
  const showBorder = phase === 'armed' || phase === 'commenting' || phase === 'reviewing'

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={onContainerLayout}>
      {/* Border indicator */}
      {showBorder && <View pointerEvents="none" style={styles.borderIndicator} />}

      {/* Tap capture layer (only when armed) */}
      {showCaptureLayer && (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onCapture}
        />
      )}

      {/* Markers (always shown when there are items) */}
      <MarkerLayer items={items} />

      {/* Floating toggle */}
      <Pressable
        style={[styles.toggle, toggleButtonStyle]}
        onPress={() => {
          if (phase === 'idle') setPhase('armed')
          else if (phase === 'armed') setPhase('idle')
        }}
        hitSlop={8}
      >
        <Text style={[styles.toggleText, phase === 'armed' && styles.toggleTextActive]}>
          {phase === 'idle' ? '◉' : '●'}
        </Text>
      </Pressable>

      {/* Tray button — visible while armed/reviewing if there are items */}
      {(phase === 'armed' || phase === 'reviewing') && items.length > 0 && (
        <Pressable
          style={[styles.tray, traySidePos(position)]}
          onPress={() => setPhase('reviewing')}
        >
          <Text style={styles.trayText}>{items.length}</Text>
        </Pressable>
      )}

      {/* Comment sheet */}
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

      {/* Edit sheet (re-uses CommentSheet) */}
      {editingItem && (
        <CommentSheet
          element={editingItem.element}
          isFallback={editingItem.fallback}
          onAdd={(c) => finishEdit(c)}
          onSendNow={(c) => {
            finishEdit(c)
            // Trigger send on next tick after store update settles.
            setTimeout(() => void doSend(items), 0)
          }}
          onCancel={() => {
            setEditingId(null)
            setPhase('reviewing')
          }}
        />
      )}

      {/* Tray sheet */}
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

// ─── positioning helpers ───────────────────────────────────────────────

function positionStyle(p: Position) {
  const offset = 60 // safe-area-ish
  switch (p) {
    case 'top-right':
      return { top: offset, right: 16 }
    case 'top-left':
      return { top: offset, left: 16 }
    case 'bottom-right':
      return { bottom: 32, right: 16 }
    case 'bottom-left':
      return { bottom: 32, left: 16 }
  }
}

function traySidePos(p: Position) {
  // Place tray opposite the toggle vertically, same horizontal side.
  switch (p) {
    case 'top-right':
      return { bottom: 32, right: 16 }
    case 'top-left':
      return { bottom: 32, left: 16 }
    case 'bottom-right':
      return { top: 60, right: 16 }
    case 'bottom-left':
      return { top: 60, left: 16 }
  }
}

const styles = StyleSheet.create({
  borderIndicator: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: '#ef4444',
    borderRadius: 0,
  },
  toggle: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
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
    minWidth: 44,
    height: 44,
    borderRadius: 22,
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
