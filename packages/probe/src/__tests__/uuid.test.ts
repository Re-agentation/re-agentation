import { describe, expect, it } from 'vitest'
import { uuid } from '../uuid'

describe('uuid', () => {
  it('produces v4-shaped strings', () => {
    const id = uuid()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('passes the [A-Za-z0-9_-]{1,128} guard used by snapshot-store', () => {
    expect(uuid()).toMatch(/^[A-Za-z0-9_-]{1,128}$/)
  })
  it('returns unique values', () => {
    const set = new Set<string>()
    for (let i = 0; i < 1000; i++) set.add(uuid())
    expect(set.size).toBe(1000)
  })
})
