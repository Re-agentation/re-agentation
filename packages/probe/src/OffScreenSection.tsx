/**
 * OffScreenSection — section in BatchTraySheet for items whose fiber
 * could not be re-bound after a screen change. View/edit/delete still
 * works; markers reappear if the user returns to the originating screen.
 *
 * Status: SCAFFOLD. See Re-agentation plan §1-F (cross-screen batch).
 */

import type { BatchItem } from './types'

export interface OffScreenSectionProps {
  items: BatchItem[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function OffScreenSection(_props: OffScreenSectionProps): null {
  // TODO(phase-1-D): collapsible group.
  return null
}
