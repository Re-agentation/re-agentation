/**
 * media-picker — thin lazy wrapper around `react-native-image-picker`.
 *
 * Optional peer dependency: if the host app doesn't have it installed, the
 * Attach button is hidden (isMediaPickerAvailable() === false) and the probe
 * still works for text-only annotations.
 */

export interface PickedMedia {
  type: 'image' | 'video'
  /** Base64 (no data-URI prefix). */
  base64: string
  ext: string
  name?: string
}

import { launchImageLibrary } from 'react-native-image-picker'

export function isMediaPickerAvailable(): boolean {
  return typeof launchImageLibrary === 'function'
}

/** Read a file:// URI into base64 (used for video, where the picker omits base64). */
async function uriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri)
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const s = String(reader.result ?? '')
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function extFromName(name: string | undefined, type: string | undefined, isVideo: boolean): string {
  const fromName = name?.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName
  if (type?.includes('png')) return 'png'
  if (type?.includes('mp4')) return 'mp4'
  if (type?.includes('quicktime')) return 'mov'
  return isVideo ? 'mp4' : 'jpg'
}

/** Launch the photo library; returns selected assets as base64. */
export async function pickMedia(): Promise<PickedMedia[]> {
  const result = (await launchImageLibrary({
    mediaType: 'mixed',
    includeBase64: true,
    selectionLimit: 0,
    quality: 0.8,
  })) as { didCancel?: boolean; assets?: Array<Record<string, unknown>> }

  if (result.didCancel || !result.assets) return []
  const out: PickedMedia[] = []
  for (const a of result.assets) {
    const type = a.type as string | undefined
    const fileName = a.fileName as string | undefined
    const uri = a.uri as string | undefined
    const isVideo = !!type?.startsWith('video') || /\.(mov|mp4|m4v)$/i.test(fileName ?? '')
    let base64 = (a.base64 as string | undefined) ?? ''
    if (!base64 && uri) {
      try {
        base64 = await uriToBase64(uri)
      } catch {
        base64 = ''
      }
    }
    if (!base64) continue
    out.push({
      type: isVideo ? 'video' : 'image',
      base64,
      ext: extFromName(fileName, type, isVideo),
      name: fileName,
    })
  }
  return out
}
