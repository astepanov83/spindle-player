import { describe, expect, it } from 'vitest'
import type { Action, Can } from '../plugins/types'
import {
  barOf,
  choiceView,
  liveWord,
  loveAction,
  loveId,
  loveNotice,
  sleepAction,
  sleepId,
  statusTip,
  type ChoiceAction
} from './bar'

const all: Can = { seek: true, pause: true, next: true, previous: true }
const save: Action = { id: 'save', kind: 'button', label: 'Save' }
const stream: ChoiceAction = {
  id: 'stream',
  kind: 'choice',
  label: 'Stream',
  short: '320',
  options: [
    { id: '0', label: '320 kbps mp3' },
    { id: '1', label: '128 kbps mp3' }
  ],
  picked: '0'
}

describe('barOf', () => {
  it('a live playable: LIVE, no seek bar, no Shuffle or Repeat', () => {
    const bar = barOf('live', { length: 'live', can: { ...all, seek: false } }, [])
    expect(bar).toMatchObject({ live: true, seek: false, order: false })
  })

  it('a length: the seek bar; a track item: Shuffle and Repeat', () => {
    expect(barOf('track', { length: 200, can: all }, [])).toMatchObject({
      live: false,
      seek: true,
      next: true,
      previous: true,
      order: true
    })
  })

  it('hides Next and Previous when the item can’t, and the seek bar when it can’t seek', () => {
    const can = { seek: false, pause: true, next: false, previous: false }
    expect(barOf('track', { length: 200, can }, [])).toMatchObject({
      seek: false,
      next: false,
      previous: false
    })
  })

  it('what the plugin says the item can do now wins over the playable', () => {
    const now = { ...all, next: false }
    expect(barOf('track', { length: 200, can: all }, [], now)).toMatchObject({ next: false })
  })

  it('with no playable yet: as for any song, or a live item with no Next', () => {
    expect(barOf('track', undefined, [])).toMatchObject({ live: false, seek: true, next: true })
    expect(barOf('live', undefined, [])).toMatchObject({ live: true, seek: false, next: false })
  })

  it('a song that can be loved gets the heart first, on when loved (ticket 117)', () => {
    const off = barOf('track', { length: 200, can: all }, [stream, save], undefined, false)
    expect(off.buttons).toEqual([loveAction(false), save])
    expect(off.buttons[0]).toMatchObject({
      id: loveId,
      icon: 'heart',
      on: false,
      plain: true,
      hint: 'Love (L)'
    })
    const on = barOf('track', { length: 200, can: all }, [], undefined, true)
    expect(on.buttons).toEqual([loveAction(true)])
    expect(on.buttons[0]).toMatchObject({ icon: 'heartOn', on: true, hint: 'Loved (L)' })
    // none said: no heart
    expect(barOf('track', { length: 200, can: all }, [save]).buttons).toEqual([save])
  })

  it('the sleep timer’s moon goes last, with the time left while set (ticket 111)', () => {
    const off = barOf('track', { length: 200, can: all }, [save], undefined, false, {
      on: false,
      text: ''
    })
    expect(off.buttons.map((b) => b.id)).toEqual([loveId, 'save', sleepId])
    expect(off.buttons[2]).toEqual(sleepAction(false, ''))
    expect(off.buttons[2]).toMatchObject({ icon: 'moon', on: false, plain: true })
    expect(off.buttons[2].text).toBeUndefined()
    const on = barOf('live', undefined, [save], undefined, undefined, { on: true, text: '23m' })
    expect(on.buttons.at(-1)).toMatchObject({
      icon: 'moonOn',
      on: true,
      text: '23m',
      hint: 'Sleep timer: 23m left'
    })
    expect(sleepAction(true, 'song').hint).toBe('Sleep timer: end of this song')
    // none said: no moon
    expect(barOf('track', undefined, []).buttons).toEqual([])
  })

  it('splits the actions into buttons and choices, in their order', () => {
    const bar = barOf('live', undefined, [stream, save])
    expect(bar.buttons).toEqual([save])
    expect(bar.choices).toEqual([stream])
  })
})

describe('choiceView', () => {
  it('a menu: short in the bar, the picked label in the stack', () => {
    expect(choiceView(stream, true)).toEqual({ kind: 'menu', text: '320', picked: '320 kbps mp3' })
    expect(choiceView(stream, false)).toEqual({
      kind: 'menu',
      text: '320 kbps mp3',
      picked: '320 kbps mp3'
    })
  })

  it('nothing picked: the menu says its label', () => {
    expect(choiceView({ ...stream, picked: '' }, true)).toEqual({
      kind: 'menu',
      text: 'Stream',
      picked: undefined
    })
  })

  it('one option: its label as text; none, or one not picked: nothing', () => {
    const one = { ...stream, options: [stream.options[0]] }
    expect(choiceView(one, true)).toEqual({ kind: 'text', text: '320 kbps mp3' })
    expect(choiceView({ ...one, picked: '' }, true)).toBeUndefined()
    expect(choiceView({ ...stream, options: [] }, true)).toBeUndefined()
  })
})

describe('the live status', () => {
  it('no status is stopped', () => {
    expect(liveWord(undefined)).toBe('off')
    expect(statusTip(undefined, 0)).toBe('Stopped')
    expect(liveWord({ state: 'reconnecting', text: 'x' })).toBe('reconnecting')
  })

  it('the tooltip counts down a wait, never below 1 s', () => {
    const s = { state: 'reconnecting' as const, text: 'Retry 1 of 3', until: 10_000 }
    expect(statusTip(s, 7_500)).toBe('Retry 1 of 3 in 3 s')
    expect(statusTip(s, 11_000)).toBe('Retry 1 of 3 in 1 s')
    expect(statusTip({ state: 'live', text: 'Live on 320 kbps' }, 0)).toBe('Live on 320 kbps')
  })
})

describe('loveNotice', () => {
  it('says what the L key did, with the title when there is one', () => {
    expect(loveNotice(true, 'Red Water')).toBe('Loved: "Red Water"')
    expect(loveNotice(false, 'Red Water')).toBe('Unloved: "Red Water"')
    expect(loveNotice(true, undefined)).toBe('Loved the song playing')
  })
})
