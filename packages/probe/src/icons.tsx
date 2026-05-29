/**
 * Small SVG icons for the probe UI.
 *
 * `react-native-svg` is a peer dependency (statically imported so Metro bundles
 * it reliably — a dynamic optional require gets rewritten to a shim that throws
 * at runtime). Almost every RN app already has it.
 */

import Svg, { Path } from 'react-native-svg'

export interface IconProps {
  size?: number
  color?: string
}

function make(path: string) {
  return function Icon({ size = 18, color = '#666' }: IconProps) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={path} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }
}

// Feather-style 24x24 stroke paths.
export const PencilIcon = make('M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z')
export const ClockIcon = make('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2')
export const PaperclipIcon = make(
  'M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
)
export const UndoIcon = make('M3 7v6h6 M3.51 13a9 9 0 1 0 2.13-9.36L3 7')
export const TrashIcon = make(
  'M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6',
)
export const CloseIcon = make('M18 6 6 18 M6 6l12 12')

/** Check (status: done). */
export function CheckIcon({ size = 14, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 9 17l-5-5" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
