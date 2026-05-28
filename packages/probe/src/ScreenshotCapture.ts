/**
 * ScreenshotCapture — captures the rect of a host fiber as PNG and uploads
 * to Metro `POST /__agentation__/snapshot`. Uses optional peer dep
 * `react-native-view-shot` if available; otherwise no-op.
 *
 * Status: SCAFFOLD. See Re-agentation plan §1-D, §1-F.
 */

export interface CaptureOptions {
  metroHost: string
  batchId: string
  itemId: string
  reactTag: number
}

export async function captureScreenshot(_opts: CaptureOptions): Promise<string | null> {
  // TODO(phase-1-D):
  //   1. Dynamic import('react-native-view-shot') guarded behind try/catch.
  //   2. If unavailable, log once and return null.
  //   3. captureRef(reactTag, { format: 'png', quality: 0.8, result: 'base64' })
  //   4. POST base64 to metroHost + /__agentation__/snapshot → returns URL.
  return null
}
