import { describe, expect, it } from 'vitest'
import { parsePopupItems, popupTemplate } from './popup-menu'

describe('parsePopupItems', () => {
  it('keeps rows, lines and ticks', () => {
    expect(
      parsePopupItems(
        [{ id: 'a', label: 'Studio' }, 'line', { id: 'pin', label: 'Keep on top', checked: false }],
        'linux'
      )
    ).toEqual([
      { id: 'a', label: 'Studio' },
      'line',
      { id: 'pin', label: 'Keep on top', checked: false }
    ])
  })

  it('doubles "&" where it marks a shortcut key', () => {
    expect(parsePopupItems([{ id: 'a', label: 'Rock & Roll' }], 'win32')).toEqual([
      { id: 'a', label: 'Rock && Roll' }
    ])
    expect(parsePopupItems([{ id: 'a', label: 'Rock & Roll' }], 'darwin')).toEqual([
      { id: 'a', label: 'Rock & Roll' }
    ])
  })

  it('keeps a submenu, one level deep', () => {
    const sub = { label: 'Sleep & rest', items: [{ id: 's', label: 'A & B', checked: true }] }
    expect(parsePopupItems([sub, 'line', { id: 'q', label: 'Quit' }], 'linux')).toEqual([
      { label: 'Sleep && rest', items: [{ id: 's', label: 'A && B', checked: true }] },
      'line',
      { id: 'q', label: 'Quit' }
    ])
    for (const raw of [
      [{ label: 'Empty', items: [] }],
      [{ label: 'Bad', items: 'line' }],
      [{ label: 'Bad', items: [{ id: '', label: 'x' }] }],
      [{ label: 'Deep', items: [{ label: 'Deeper', items: [{ id: 'a', label: 'A' }] }] }],
      [{ label: '', items: [{ id: 'a', label: 'A' }] }]
    ])
      expect(parsePopupItems(raw, 'linux')).toBe(null)
  })

  it('counts the rows of submenus too', () => {
    const row = { id: 'a', label: 'A' }
    const sub = (n: number): unknown => ({ label: 'S', items: Array(n).fill(row) })
    expect(parsePopupItems([sub(39)], 'linux')).not.toBe(null)
    expect(parsePopupItems([sub(39), row], 'linux')).toBe(null)
  })

  it('drops a menu with a bad row', () => {
    for (const raw of [
      undefined,
      [],
      'line',
      [{ id: '', label: 'x' }],
      [{ id: 'a' }],
      [{ id: 'a', label: 'x', checked: 'yes' }],
      [null],
      Array.from({ length: 41 }, (_, i) => ({ id: `${i}`, label: 'x' }))
    ])
      expect(parsePopupItems(raw, 'linux')).toBeNull()
  })
})

describe('popupTemplate', () => {
  it('gives each row its click and a check box when it has a tick', () => {
    const picked: string[] = []
    const t = popupTemplate(
      [{ id: 'a', label: 'A' }, 'line', { id: 'b', label: 'B', checked: true }],
      (id) => picked.push(id)
    )
    expect(t[1]).toEqual({ type: 'separator' })
    expect(t[2]).toMatchObject({ label: 'B', type: 'checkbox', checked: true })
    expect(t[0]).not.toHaveProperty('type')
    ;(t[0].click as () => void)()
    ;(t[2].click as () => void)()
    expect(picked).toEqual(['a', 'b'])
  })

  it('gives a submenu its rows, which pick as the others do', () => {
    const picked: string[] = []
    const t = popupTemplate([{ label: 'S', items: [{ id: 'x', label: 'X' }] }], (id) =>
      picked.push(id)
    )
    expect(t[0].label).toBe('S')
    const sub = t[0].submenu as { click: () => void }[]
    sub[0].click()
    expect(picked).toEqual(['x'])
  })
})
