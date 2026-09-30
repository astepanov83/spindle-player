import { describe, expect, it } from 'vitest'
import { libraryWidth, minLibraryWidth, shownQueueMode } from './narrow'
import { templates } from '../../../shared/templates'
import type { Template } from '../../../shared/layout'

const { studio, classic, focus } = templates

describe('libraryWidth', () => {
  it('Studio: the window less the player column, and the queue column when shown', () => {
    // 380px player, 310px queue, a 1px line between parts
    expect(libraryWidth(studio, 'col', 1100)).toBe(1100 - 380 - 310 - 2)
    expect(libraryWidth(studio, 'drawer', 1100)).toBe(1100 - 380 - 1)
    expect(libraryWidth(studio, 'tab', 860)).toBe(860 - 380 - 1)
  })

  it('Classic: the window less the queue column; the bar is below, not beside', () => {
    expect(libraryWidth(classic, 'col', 900)).toBe(900 - 330 - 1)
    expect(libraryWidth(classic, 'drawer', 900)).toBe(900)
  })

  it('Focus has no library', () => {
    expect(libraryWidth(focus, 'tab', 440)).toBeNull()
  })

  it('shares the rest between 1fr siblings', () => {
    const t: Template = {
      ...studio,
      layout: {
        row: [
          { part: 'library', opts: { nav: 'chips' }, size: '1fr' },
          { part: 'nowplaying', opts: { style: 'panel' }, size: '1fr' },
          { part: 'controls', opts: { style: 'stack' }, size: '99px' }
        ]
      }
    }
    expect(libraryWidth(t, 'tab', 1001)).toBe((1001 - 99 - 2) / 2)
  })
})

describe('shownQueueMode', () => {
  it('keeps a Column while the library gets enough room', () => {
    const w = minLibraryWidth + 380 + 310 + 2
    expect(shownQueueMode(studio, 'col', w)).toBe('col')
  })

  it('draws a Column as a Drawer when the library would get less', () => {
    const w = minLibraryWidth + 380 + 310 + 2
    expect(shownQueueMode(studio, 'col', w - 1)).toBe('drawer')
    expect(shownQueueMode(studio, 'col', 860)).toBe('drawer')
  })

  it('keeps Studio at its first size a Column', () => {
    expect(shownQueueMode(studio, 'col', 1100)).toBe('col')
  })

  it('keeps Classic a Column down to its minimum width', () => {
    expect(shownQueueMode(classic, 'col', classic.window.minWidth)).toBe('col')
  })

  it('leaves Tab and Drawer alone at any width', () => {
    expect(shownQueueMode(studio, 'tab', 500)).toBe('tab')
    expect(shownQueueMode(studio, 'drawer', 500)).toBe('drawer')
    expect(shownQueueMode(focus, 'tab', 300)).toBe('tab')
  })

  it('keeps a Column when the template offers no Drawer', () => {
    const t: Template = { ...studio, queueOptions: ['tab', 'col'] }
    expect(shownQueueMode(t, 'col', 860)).toBe('col')
  })

  it('keeps a Column before the width is known', () => {
    expect(shownQueueMode(studio, 'col', 0)).toBe('col')
  })
})
