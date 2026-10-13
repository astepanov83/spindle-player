import { describe, expect, it, vi } from 'vitest'
import type { PlayState } from '../shared/ipc'

vi.mock('electron', () => ({}))
vi.mock('../../resources/icon.png?asset', () => ({ default: '' }))

const {
  cut,
  hidesOnMinimize,
  menuLabel,
  parseHasOwner,
  parsePlayState,
  songLine,
  trayItems,
  trayTip
} = await import('./tray')
type TrayItem = import('./tray').TrayItem

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

const song: PlayState = {
  title: 'Blue Song',
  artist: 'The Blues',
  playing: true,
  live: false,
  shuffle: false,
  nothing: false,
  next: true,
  previous: true
}

// the labels, with "-" for a line, "(off)" for a disabled item, "*" for a
// ticked one and ">" for a submenu
function labelsOf(items: TrayItem[]): string[] {
  return items.map((i) =>
    i.kind === 'line'
      ? '-'
      : i.kind === 'text'
        ? `${i.label} (off)`
        : i.kind === 'sub'
          ? `${i.label} >`
          : i.kind === 'pick'
            ? i.label + (i.checked ? ' *' : '')
            : i.label + (i.enabled ? '' : ' (off)')
  )
}
const labels = (state: PlayState | undefined): string[] => labelsOf(trayItems(state))

describe('trayItems', () => {
  it('has only Show and Quit before the page says what plays', () => {
    expect(labels(undefined)).toEqual(['Show Spindle', '-', 'Quit'])
  })

  it('shows the song and the controls', () => {
    expect(labels(song)).toEqual([
      'Blue Song - The Blues (off)',
      'Pause',
      'Next',
      'Previous',
      'Sleep timer >',
      '-',
      'Show Spindle',
      '-',
      'Quit'
    ])
    expect(trayItems(song).flatMap((i) => (i.kind === 'do' ? [i.action] : []))).toEqual([
      'toggle',
      'next',
      'previous',
      'show',
      'quit'
    ])
  })

  it('says Play while paused', () => {
    expect(labels({ ...song, playing: false })[1]).toBe('Play')
  })

  it('says Stop for a live item, and hides what the bar hides', () => {
    const radio = { ...song, title: 'Deep Space One', artist: 'Radio', live: true }
    expect(labels({ ...radio, next: false, previous: false })).toEqual([
      'Deep Space One - Radio (off)',
      'Stop',
      'Sleep timer >',
      '-',
      'Show Spindle',
      '-',
      'Quit'
    ])
    expect(labels({ ...radio, playing: false, next: false, previous: false })[1]).toBe('Play')
    expect(labels(radio).slice(1, 4)).toEqual(['Stop', 'Next', 'Previous'])
  })

  it('disables the controls with nothing picked', () => {
    const none = { ...song, title: '', artist: '', playing: false, nothing: true }
    expect(labels(none).slice(0, 4)).toEqual([
      'Nothing playing (off)',
      'Play (off)',
      'Next (off)',
      'Previous (off)'
    ])
    expect(labels(none)).not.toContain('Sleep timer >')
  })

  // the sleep timer's submenu (ticket 111)
  const sub = (state: PlayState): TrayItem[] => {
    const s = trayItems(state).find((i) => i.kind === 'sub')
    return s?.kind === 'sub' ? s.items : []
  }

  it('has the sleep timer choices, none ticked while off', () => {
    expect(labelsOf(sub(song))).toEqual([
      'End of this song',
      'End of this album',
      '15 minutes',
      '30 minutes',
      '45 minutes',
      '60 minutes',
      '90 minutes'
    ])
    expect(sub(song).flatMap((i) => (i.kind === 'pick' ? [i.action] : []))[2]).toEqual({
      sleep: 15
    })
  })

  it('ticks the timer set, says what is left, and offers Cancel', () => {
    const set = { ...song, sleep: { pick: 30 as const, left: '23m' } }
    expect(labels(set)).toContain('Sleep timer: 23m left >')
    const items = sub(set)
    expect(labelsOf(items).slice(3, 4)).toEqual(['30 minutes *'])
    expect(labelsOf(items).slice(-2)).toEqual(['-', 'Cancel'])
    expect(items.at(-1)).toMatchObject({ action: { sleep: null } })
    // by the minute in the last one, so the menu is not rebuilt every second
    expect(labels({ ...song, sleep: { pick: 15, left: '45s' } })).toContain(
      'Sleep timer: 1m left >'
    )
    expect(labels({ ...song, sleep: { pick: 'album', left: 'album' } })).toContain(
      'Sleep timer: end of this album >'
    )
  })

  it('has no song or album end for a live item', () => {
    expect(labelsOf(sub({ ...song, live: true }))[0]).toBe('15 minutes')
  })

  it('has no album end with shuffle', () => {
    expect(labelsOf(sub({ ...song, shuffle: true })).slice(0, 2)).toEqual([
      'End of this song',
      '15 minutes'
    ])
  })

  it('cuts a long song line to 40 characters', () => {
    const line = (trayItems({ ...song, title: 'x'.repeat(60) })[0] as { label: string }).label
    expect(Array.from(line)).toHaveLength(40)
    expect(line.endsWith('…')).toBe(true)
  })
})

describe('songLine', () => {
  it('leaves out an empty artist', () => {
    expect(songLine({ ...song, artist: '' })).toBe('Blue Song')
  })

  it('is empty with nothing playing', () => {
    expect(songLine(undefined)).toBe('')
    expect(songLine({ ...song, nothing: true })).toBe('')
  })
})

describe('cut', () => {
  it('keeps short text', () => {
    expect(cut('abc', 3)).toBe('abc')
  })

  it('never splits a character made of two code units', () => {
    expect(cut('😀😀😀😀', 3)).toBe('😀😀…')
  })

  it('drops spaces before the dots', () => {
    expect(cut('ab   cdef', 5)).toBe('ab…')
  })
})

describe('trayTip', () => {
  it('is the song, or the app name', () => {
    expect(trayTip(song, 'Spindle')).toBe('Blue Song - The Blues')
    expect(trayTip(undefined, 'Spindle')).toBe('Spindle')
    expect(trayTip({ ...song, nothing: true }, 'Spindle')).toBe('Spindle')
  })
})

describe('menuLabel', () => {
  it('keeps an "&" from becoming a shortcut key on Windows and Linux', () => {
    expect(menuLabel('Simon & Garfunkel', 'linux')).toBe('Simon && Garfunkel')
    expect(menuLabel('Simon & Garfunkel', 'win32')).toBe('Simon && Garfunkel')
    expect(menuLabel('Simon & Garfunkel', 'darwin')).toBe('Simon & Garfunkel')
  })
})

describe('parsePlayState', () => {
  it('reads a good state', () => {
    expect(parsePlayState(song)).toEqual(song)
  })

  it('reads the sleep timer, and drops a bad one', () => {
    const set = { ...song, sleep: { pick: 45, left: '12m' } }
    expect(parsePlayState(set)).toEqual(set)
    expect(parsePlayState({ ...song, sleep: { pick: 7, left: '7m' } })).toEqual(song)
    expect(parsePlayState({ ...song, sleep: { pick: 'song' } })).toEqual(song)
  })

  it('takes anything odd as nothing playing', () => {
    expect(parsePlayState(null)).toBeUndefined()
    expect(parsePlayState('x')).toBeUndefined()
    expect(parsePlayState({ title: 5, playing: 'yes' })).toEqual({
      title: '',
      artist: '',
      playing: false,
      live: false,
      shuffle: false,
      nothing: true,
      next: false,
      previous: false
    })
  })

  it('cuts very long text', () => {
    expect(parsePlayState({ ...song, title: 'x'.repeat(5000) })!.title).toHaveLength(500)
  })
})
