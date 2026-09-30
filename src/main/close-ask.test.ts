import { describe, expect, it } from 'vitest'
import { closeStep, parseCloseAnswer } from './close-ask'

describe('closeStep', () => {
  const at = { closing: false, pageUp: true }

  it('asks when the user has not picked yet', () => {
    expect(closeStep('ask', at)).toBe('ask')
  })

  it('does the picked action without asking', () => {
    expect(closeStep('minimize', at)).toBe('minimize')
    expect(closeStep('quit', at)).toBe('quit')
  })

  it('lets a close through once it is decided, or the app quits', () => {
    for (const s of ['ask', 'minimize', 'quit'] as const)
      expect(closeStep(s, { ...at, closing: true })).toBe('close')
  })

  it('closes when the page cannot show the question', () => {
    expect(closeStep('ask', { ...at, pageUp: false })).toBe('close')
    // a picked choice needs no page
    expect(closeStep('minimize', { ...at, pageUp: false })).toBe('minimize')
  })
})

describe('parseCloseAnswer', () => {
  it('takes only minimize and quit', () => {
    expect(parseCloseAnswer('minimize')).toBe('minimize')
    expect(parseCloseAnswer('quit')).toBe('quit')
    for (const v of ['ask', 'close', undefined, 1, {}]) expect(parseCloseAnswer(v)).toBeUndefined()
  })
})
