import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }))

const { blockNavigation } = await import('./web-guard')
const { isFromPage } = await import('./page-ipc')

describe('blockNavigation', () => {
  it('stops every navigation of the page and its frames', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const handlers = new Map<string, (e: unknown) => void>()
    const contents = { on: (name: string, fn: (e: unknown) => void) => handlers.set(name, fn) }
    blockNavigation(contents as never)
    for (const name of ['will-navigate', 'will-frame-navigate']) {
      const e = { url: 'file:///tmp/x.html', preventDefault: vi.fn() }
      handlers.get(name)!(e)
      expect(e.preventDefault).toHaveBeenCalled()
    }
  })
})

describe('isFromPage', () => {
  const frame = { processId: 4, routingId: 1 }
  const page = { isDestroyed: () => false, mainFrame: frame }

  it('takes the main frame of the app page', () => {
    expect(isFromPage({ sender: page, senderFrame: { processId: 4, routingId: 1 } }, page)).toBe(
      true
    )
  })

  it('refuses other windows, frames inside the page, and a gone page', () => {
    const cover = { isDestroyed: () => false, mainFrame: { processId: 7, routingId: 1 } }
    expect(isFromPage({ sender: cover, senderFrame: cover.mainFrame }, page)).toBe(false)
    expect(isFromPage({ sender: page, senderFrame: { processId: 4, routingId: 9 } }, page)).toBe(
      false
    )
    expect(isFromPage({ sender: page, senderFrame: null }, page)).toBe(false)
    expect(isFromPage({ sender: page, senderFrame: frame }, undefined)).toBe(false)
    const gone = { ...page, isDestroyed: () => true }
    expect(isFromPage({ sender: gone, senderFrame: frame }, gone)).toBe(false)
  })
})
