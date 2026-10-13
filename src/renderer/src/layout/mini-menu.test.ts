import { describe, expect, it } from 'vitest'
import { loveAction, sleepAction } from '../queue/bar'
import { miniMenuItems, miniPick } from './mini-menu'

describe('Mini menu', () => {
  it('has the layouts, the pin, Settings, Minimize and Quit', () => {
    const items = miniMenuItems('mini', true)
    expect(items).toEqual([
      { id: 'layout:studio', label: 'Studio', checked: false },
      { id: 'layout:classic', label: 'Classic', checked: false },
      { id: 'layout:focus', label: 'Focus', checked: false },
      { id: 'layout:mini', label: 'Mini', checked: true },
      'line',
      { id: 'pin', label: 'Keep on top', checked: true },
      'line',
      { id: 'settings', label: 'Settings' },
      { id: 'minimize', label: 'Minimize' },
      { id: 'quit', label: 'Quit' }
    ])
    expect(miniMenuItems('mini', false)).toContainEqual({
      id: 'pin',
      label: 'Keep on top',
      checked: false
    })
  })

  it("has the bar's buttons, which a narrow bar hides", () => {
    const star = { id: 'some:star', kind: 'button' as const, label: 'Add to My stations' }
    const busy = { ...star, id: 'some:busy', busy: true }
    const items = miniMenuItems('mini', true, {
      buttons: [loveAction(true), star, busy, sleepAction(false, '')],
      sleep: undefined,
      live: false,
      shuffle: false
    })
    expect(items.slice(4, 9)).toEqual([
      'line',
      { id: 'act:core:love', label: 'Love', checked: true },
      { id: 'act:some:star', label: 'Add to My stations' },
      {
        label: 'Sleep timer',
        items: [
          { id: 'sleep:song', label: 'End of this song', checked: false },
          { id: 'sleep:album', label: 'End of this album', checked: false },
          { id: 'sleep:15', label: '15 minutes', checked: false },
          { id: 'sleep:30', label: '30 minutes', checked: false },
          { id: 'sleep:45', label: '45 minutes', checked: false },
          { id: 'sleep:60', label: '60 minutes', checked: false },
          { id: 'sleep:90', label: '90 minutes', checked: false }
        ]
      },
      'line'
    ])
    // a station's timer has no song end, and a set one can be cancelled
    const live = miniMenuItems('mini', true, {
      buttons: [sleepAction(true, '23m')],
      sleep: { pick: 30, end: 0 },
      live: true,
      shuffle: false
    })
    expect(live[5]).toEqual({
      label: 'Sleep timer',
      items: [
        { id: 'sleep:15', label: '15 minutes', checked: false },
        { id: 'sleep:30', label: '30 minutes', checked: true },
        { id: 'sleep:45', label: '45 minutes', checked: false },
        { id: 'sleep:60', label: '60 minutes', checked: false },
        { id: 'sleep:90', label: '90 minutes', checked: false },
        'line',
        { id: 'sleep:off', label: 'Cancel' }
      ]
    })
    // nothing playing: no extra rows
    expect(
      miniMenuItems('mini', true, { buttons: [], sleep: undefined, live: false, shuffle: false })
    ).toEqual(miniMenuItems('mini', true))
  })

  it('reads the row picked', () => {
    expect(miniPick('layout:focus')).toEqual({ layout: 'focus' })
    expect(miniPick('pin')).toBe('pin')
    expect(miniPick('quit')).toBe('quit')
    expect(miniPick('act:core:love')).toEqual({ act: 'core:love' })
    expect(miniPick('sleep:30')).toEqual({ sleep: 30 })
    expect(miniPick('sleep:song')).toEqual({ sleep: 'song' })
    expect(miniPick('sleep:off')).toEqual({ sleep: null })
    for (const id of [null, '', 'act:', 'sleep:7', 'layout:', 'layout:tiny', 'other'])
      expect(miniPick(id)).toBe(undefined)
  })
})
