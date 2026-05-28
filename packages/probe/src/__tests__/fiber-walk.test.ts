import { describe, expect, it } from 'vitest'
import { parseDebugStack } from '../fiber-walk'

const REAL_STACK = [
  'Error: react-stack-top-frame',
  '    at anonymous (http://localhost:8081/index.bundle//&platform=ios&app=com.nubeem.mobile:25670:77)',
  '    at ThemeProvider (http://localhost:8081/index.bundle//&platform=ios&app=com.nubeem.mobile:225528:50)',
  '    at react_stack_bottom_frame (http://localhost:8081/index.bundle//&platform=ios&app=com.nubeem.mobile:17792:29)',
  '    at renderWithHooks (http://localhost:8081/index.bundle//&platform=ios&app=com.nubeem.mobile:12428:40)',
].join('\n')

describe('parseDebugStack', () => {
  it('parses real RN 0.85 react-stack-top-frame Error', () => {
    const err = new Error('react-stack-top-frame')
    err.stack = REAL_STACK
    const frames = parseDebugStack(err)
    expect(frames.length).toBeGreaterThanOrEqual(4)
    expect(frames[0]?.methodName).toBe('anonymous')
    expect(frames[1]?.methodName).toBe('ThemeProvider')
    expect(frames[1]?.lineNumber).toBe(225528)
    expect(frames[1]?.column).toBe(50)
    expect(frames[1]?.file).toContain('index.bundle')
  })

  it('returns empty for null/undefined/non-Error', () => {
    expect(parseDebugStack(null)).toEqual([])
    expect(parseDebugStack(undefined)).toEqual([])
    expect(parseDebugStack({} as Error)).toEqual([])
  })

  it('handles a stack without `at` prefix', () => {
    const err = new Error('x')
    err.stack = 'Error: x\nno-at-prefix line'
    expect(parseDebugStack(err)).toEqual([])
  })
})

describe('parseDebugStack — Metro App.bundle frames', () => {
  it('parses bare-RN App.bundle owner frames (RN 0.85)', () => {
    const err = new Error('react-stack-top-frame')
    err.stack = [
      'Error: react-stack-top-frame',
      '    at anonymous (http://localhost:8081/App.bundle//&platform=ios&app=com.nubeem.mobile:25670:77)',
      '    at ThemeProvider (http://localhost:8081/App.bundle//&platform=ios&app=com.nubeem.mobile:225528:50)',
    ].join('\n')
    const frames = parseDebugStack(err)
    expect(frames[1]?.methodName).toBe('ThemeProvider')
    expect(frames[1]?.file).toContain('App.bundle')
    expect(frames[1]?.lineNumber).toBe(225528)
  })
})
