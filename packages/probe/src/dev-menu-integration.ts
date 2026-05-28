/**
 * dev-menu-integration — registers a "Toggle Re-agentation" entry in the
 * RN dev menu (Cmd+D / shake gesture) using `DevSettings.addMenuItem`.
 *
 * Useful when the floating toggle button is occluded by user UI.
 *
 * Status: SCAFFOLD. See Re-agentation plan §1-F.
 */

export interface DevMenuOptions {
  onToggle: () => void
}

export function registerDevMenuToggle(_opts: DevMenuOptions): () => void {
  // TODO(phase-1-A):
  //   import { DevSettings } from 'react-native'
  //   DevSettings.addMenuItem('Toggle Re-agentation', opts.onToggle)
  //   No unregister API exists; return a no-op cleanup.
  return () => {}
}
