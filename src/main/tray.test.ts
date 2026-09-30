import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))
vi.mock('../../resources/icon.png?asset', () => ({ default: '' }))

const { hidesOnMinimize, parseHasOwner } = await import('./tray')

describe('hidesOnMinimize', () => {
  const host = (yes: boolean): (() => Promise<boolean>) => vi.fn(() => Promise.resolve(yes))

  it('hides on Windows', async () => {
    const ask = host(false)
    expect(await hidesOnMinimize('win32', ask)).toBe(true)
    expect(ask).not.toHaveBeenCalled()
  })

  it('keeps the normal minimize on macOS', async () => {
    expect(await hidesOnMinimize('darwin', host(true))).toBe(false)
  })

  it('hides on Linux only with a tray host', async () => {
    expect(await hidesOnMinimize('linux', host(true))).toBe(true)
    expect(await hidesOnMinimize('linux', host(false))).toBe(false)
  })
})

describe('parseHasOwner', () => {
  it('reads the gdbus answer', () => {
    expect(parseHasOwner('(true,)\n')).toBe(true)
    expect(parseHasOwner('(false,)\n')).toBe(false)
    expect(parseHasOwner('')).toBe(false)
  })
})
