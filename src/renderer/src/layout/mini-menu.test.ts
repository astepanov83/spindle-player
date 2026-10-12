import { describe, expect, it } from 'vitest'
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

  it('reads the row picked', () => {
    expect(miniPick('layout:focus')).toEqual({ layout: 'focus' })
    expect(miniPick('pin')).toBe('pin')
    expect(miniPick('quit')).toBe('quit')
    for (const id of [null, '', 'layout:', 'layout:tiny', 'other'])
      expect(miniPick(id)).toBe(undefined)
  })
})
