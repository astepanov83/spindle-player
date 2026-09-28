import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { endSplashWith, showWait } from './splash-end'

function setup(): { win: EventEmitter; page: EventEmitter; close: () => void } {
  const win = new EventEmitter()
  const page = new EventEmitter()
  const close = vi.fn()
  endSplashWith(win, page, close)
  return { win, page, close }
}

describe('endSplashWith', () => {
  it('closes the banner once the app window shows', () => {
    const { win, close } = setup()
    expect(close).not.toHaveBeenCalled()
    win.emit('show')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes it when the app window closes before showing', () => {
    const { win, close } = setup()
    win.emit('closed')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("closes it when the app page stops before showing, so it can't hang there", () => {
    const { page, close } = setup()
    page.emit('render-process-gone')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes it only once', () => {
    const { win, page, close } = setup()
    win.emit('show')
    win.emit('show')
    page.emit('render-process-gone')
    win.emit('closed')
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('showWait', () => {
  it('holds the app window until the banner was up for the minimum', () => {
    expect(showWait(1000, 1300, 1000)).toBe(700)
  })

  it('does not hold it once the minimum has passed', () => {
    expect(showWait(1000, 2500, 1000)).toBe(0)
  })

  it('does not hold it for a banner that never showed', () => {
    expect(showWait(undefined, 1300, 1000)).toBe(0)
  })
})
