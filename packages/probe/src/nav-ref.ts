/**
 * nav-ref — optional bridge so the probe can deep-link the simulator to a
 * screen during history Undo.
 *
 * Host apps that use React Navigation can opt in with ONE line near their
 * NavigationContainer:
 *
 *   import { setReagentationNavRef } from '@re-agentation/probe'
 *   <NavigationContainer ref={(r) => setReagentationNavRef(r)}> … </NavigationContainer>
 *
 * If not set, deep-link nav is skipped and the probe warns the user.
 */

export interface ReagentationNavRef {
  navigate: (name: string, params?: unknown) => void
  getCurrentRoute?: () => { name?: string } | undefined
}

let navRef: ReagentationNavRef | null = null

export function setReagentationNavRef(ref: ReagentationNavRef | null): void {
  navRef = ref
}

export function getReagentationNavRef(): ReagentationNavRef | null {
  if (navRef) return navRef
  const g = (globalThis as { __RE_AGENTATION_NAV__?: ReagentationNavRef }).__RE_AGENTATION_NAV__
  return g ?? null
}

export function getCurrentRouteName(): string | null {
  try {
    return getReagentationNavRef()?.getCurrentRoute?.()?.name ?? null
  } catch {
    return null
  }
}
