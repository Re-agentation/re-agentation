import { describe, expect, it } from 'vitest'
import { normalizeSourcePath } from '../source-path'

describe('normalizeSourcePath', () => {
  it('strips http origin', () => {
    expect(normalizeSourcePath('http://localhost:8081/index.bundle//foo')).toBe(null)
  })

  it('strips project root prefix', () => {
    expect(
      normalizeSourcePath('/Users/jay/Desktop/Project/apps/mobile/src/Foo.tsx', {
        projectRoot: '/Users/jay/Desktop/Project',
      }),
    ).toBe('apps/mobile/src/Foo.tsx')
  })

  it('strips project root with trailing slash', () => {
    expect(
      normalizeSourcePath('/Users/jay/Desktop/Project/apps/mobile/src/Foo.tsx', {
        projectRoot: '/Users/jay/Desktop/Project/',
      }),
    ).toBe('apps/mobile/src/Foo.tsx')
  })

  it('skips node_modules', () => {
    expect(
      normalizeSourcePath('/Users/jay/Desktop/Project/node_modules/react/index.js', {
        projectRoot: '/Users/jay/Desktop/Project',
      }),
    ).toBe(null)
  })

  it('skips absolute node_modules paths even without a known project root', () => {
    // A tap often resolves first to an RN primitive (Pressable) whose top frame
    // lives in react-native itself — must be skipped so the next (app) frame wins.
    expect(
      normalizeSourcePath(
        '/Users/jay/Desktop/Project/node_modules/.pnpm/react-native@0.85.3/node_modules/react-native/Libraries/Components/Pressable/Pressable.js',
      ),
    ).toBe(null)
  })

  it('strips webpack and turbopack prefixes', () => {
    expect(normalizeSourcePath('webpack://_N_E/apps/landing/page.tsx')).toBe(
      'apps/landing/page.tsx',
    )
    expect(normalizeSourcePath('[project]/apps/admin/foo.tsx')).toBe('apps/admin/foo.tsx')
    expect(normalizeSourcePath('(turbopack)/foo.tsx')).toBe('foo.tsx')
  })

  it('returns null for empty / anonymous / invalid', () => {
    expect(normalizeSourcePath('')).toBe(null)
    expect(normalizeSourcePath('anonymous')).toBe(null)
    expect(normalizeSourcePath('<?>')).toBe(null)
  })

  it('returns null for bundled URL that survived', () => {
    expect(normalizeSourcePath('index.bundle//&platform=ios')).toBe(null)
  })

  it('returns null for App.bundle (bare RN 0.85 New-Arch entry)', () => {
    expect(
      normalizeSourcePath('http://localhost:8081/App.bundle?platform=ios&dev=true:43:50'),
    ).toBe(null)
    expect(normalizeSourcePath('App.bundle//&platform=ios')).toBe(null)
  })

  it('preserves path unchanged when project root not known', () => {
    expect(normalizeSourcePath('packages/ui/src/Button.tsx')).toBe('packages/ui/src/Button.tsx')
  })
})
