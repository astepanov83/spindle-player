import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notice } from './notice.svelte'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  notice.hide()
  vi.useRealTimers()
})

describe('notice', () => {
  it('goes away by itself', () => {
    notice.show('Cleared the queue')
    expect(notice.text).toBe('Cleared the queue')
    expect(notice.action).toBeUndefined()
    vi.advanceTimersByTime(4000)
    expect(notice.text).toBe('')
  })

  it('stays longer with a button, which runs once and hides it', () => {
    const run = vi.fn()
    notice.show('Removed Metal Only', { label: 'Undo', run })
    expect(notice.action?.label).toBe('Undo')
    vi.advanceTimersByTime(4000)
    expect(notice.text).toBe('Removed Metal Only')
    notice.press()
    notice.press()
    expect(run).toHaveBeenCalledOnce()
    expect(notice.text).toBe('')
    expect(notice.action).toBeUndefined()
  })

  it('a newer notice drops the older one and its button', () => {
    const run = vi.fn()
    notice.show('Removed Metal Only', { label: 'Undo', run })
    notice.show('Added 3 songs to Blue Hours')
    expect(notice.action).toBeUndefined()
    notice.press()
    expect(run).not.toHaveBeenCalled()
  })

  it('waits while the pointer is on it, then gives the full time again', () => {
    notice.show('Removed Metal Only', { label: 'Undo', run: () => {} })
    notice.hold()
    vi.advanceTimersByTime(60_000)
    expect(notice.text).toBe('Removed Metal Only')
    notice.release()
    vi.advanceTimersByTime(7000)
    expect(notice.text).toBe('Removed Metal Only')
    vi.advanceTimersByTime(1000)
    expect(notice.text).toBe('')
  })

  it('a pressed button lets the next notice time out, though the pointer never left', () => {
    notice.show('Removed Metal Only', { label: 'Undo', run: () => {} })
    notice.hold()
    notice.press()
    notice.show('Cleared the queue')
    vi.advanceTimersByTime(4000)
    expect(notice.text).toBe('')
  })
})
