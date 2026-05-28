/**
 * uuid — RFC-4122-ish v4-like id generator without a peer dep.
 *
 * Re-agentation uses ids for traceability, not security. Math.random() is
 * sufficient and avoids pulling in a crypto polyfill on RN. Pattern matches
 * `[A-Za-z0-9_-]{1,128}` so the snapshot-store id guard accepts it.
 */
export function uuid(): string {
  const bytes = new Array<number>(16)
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  // Set version 4 (random) and variant bits per RFC 4122.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  return (
    hex.slice(0, 8) +
    '-' +
    hex.slice(8, 12) +
    '-' +
    hex.slice(12, 16) +
    '-' +
    hex.slice(16, 20) +
    '-' +
    hex.slice(20, 32)
  )
}
