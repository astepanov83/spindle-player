import { describe, expect, it } from 'vitest'
import { lineAt, parseLyricsSong, parseLyricsText, type LyricLine } from './lyrics'

const synced = (text: string): LyricLine[] => {
  const l = parseLyricsText(text)
  if (!l || !('synced' in l)) throw new Error('not synced: ' + JSON.stringify(l))
  return l.synced
}

describe('parseLyricsText', () => {
  it('reads stamps with hundredths, thousandths, none, and a colon', () => {
    expect(
      synced('[00:01.50]One\n[00:02.250]Two\n[01:03]Three\n[1:04:5]Four\n[100:00.00]Five')
    ).toEqual([
      { t: 1.5, text: 'One' },
      { t: 2.25, text: 'Two' },
      { t: 63, text: 'Three' },
      { t: 64.5, text: 'Four' },
      { t: 6000, text: 'Five' }
    ])
  })

  it('gives each of several stamps on one line its own line, in time order', () => {
    expect(synced('[00:10.00][00:30.00]Chorus\n[00:20.00]Verse')).toEqual([
      { t: 10, text: 'Chorus' },
      { t: 20, text: 'Verse' },
      { t: 30, text: 'Chorus' }
    ])
  })

  it('moves every line by the offset: plus shows the words sooner', () => {
    expect(synced('[offset:+500]\n[00:01.00]A\n[00:00.20]B')).toEqual([
      { t: 0, text: 'B' },
      { t: 0.5, text: 'A' }
    ])
    expect(synced('[00:01.00]A\n[offset: -1000]')).toEqual([{ t: 2, text: 'A' }])
  })

  it('drops the words about the song, bad lines and word stamps', () => {
    const text = [
      '\uFEFF[ar:Some Artist]',
      '[ti:Red Water]',
      '[length: 03:20]',
      '[#a comment]',
      'no stamp here',
      '[xx:yy]bad stamp',
      '[00:05.00]and the <00:05.50>tide <00:06.00>comes in',
      '[00:09.00]'
    ].join('\r\n')
    expect(synced(text)).toEqual([
      { t: 5, text: 'and the tide comes in' },
      // a blank line ends the one before it
      { t: 9, text: '' }
    ])
  })

  it('keeps file order for lines at the same time', () => {
    expect(synced('[00:01.00]A\n[00:01.00]B').map((l) => l.text)).toEqual(['A', 'B'])
  })

  it('gives plain words when no line has a stamp, without the words about the song', () => {
    expect(parseLyricsText('[ar:X]\n\nFirst line\n\nSecond line\n')).toEqual({
      plain: 'First line\n\nSecond line'
    })
  })

  it('gives nothing for empty text, only words about the song, or only times', () => {
    expect(parseLyricsText('')).toBeUndefined()
    expect(parseLyricsText('  \n\n')).toBeUndefined()
    expect(parseLyricsText('[ar:X]\n[ti:Y]')).toBeUndefined()
    expect(parseLyricsText('[00:01.00]\n[00:02.00]')).toBeUndefined()
  })

  it('cuts long lines and many lines', () => {
    const long = synced('[00:01.00]' + 'a'.repeat(2000))
    expect(long[0].text.length).toBe(500)
    const many = synced(Array.from({ length: 5000 }, (_, i) => `[00:${i % 60}.00]x`).join('\n'))
    expect(many.length).toBe(3000)
  })
})

describe('lineAt', () => {
  const lines = [
    { t: 1, text: 'a' },
    { t: 5, text: 'b' },
    { t: 5, text: 'c' },
    { t: 9, text: 'd' }
  ]
  it('is the last line that started', () => {
    expect(lineAt(lines, 0)).toBe(-1)
    expect(lineAt(lines, 1)).toBe(0)
    expect(lineAt(lines, 4.99)).toBe(0)
    expect(lineAt(lines, 5)).toBe(2)
    expect(lineAt(lines, 8)).toBe(2)
    expect(lineAt(lines, 100)).toBe(3)
    expect(lineAt([], 3)).toBe(-1)
  })

  it('takes a time a hair short of a line as that line, as a seek to it gives', () => {
    // a disc image track starting at 00:03:52 (3 s and 52 frames), seeked to 12.34
    const start = 3 + 52 / 75
    const back = start + 12.34 - start
    expect(back).toBeLessThan(12.34)
    expect(
      lineAt(
        [
          { t: 1, text: 'a' },
          { t: 12.34, text: 'b' }
        ],
        back
      )
    ).toBe(1)
    expect(lineAt(lines, 4.9999)).toBe(2)
    expect(lineAt(lines, 4.99)).toBe(0)
  })
})

describe('parseLyricsSong', () => {
  it('takes the names and a length, and drops what is not one', () => {
    expect(parseLyricsSong({ artist: 'A', title: 'T', album: 'B', duration: 200 })).toEqual({
      artist: 'A',
      title: 'T',
      album: 'B',
      duration: 200
    })
    expect(parseLyricsSong({ artist: 'A', title: 'T', album: '', duration: -1 })?.duration).toBe(0)
    expect(parseLyricsSong({ artist: 'A', title: 'T' })).toBeUndefined()
    expect(parseLyricsSong('x')).toBeUndefined()
    expect(parseLyricsSong(null)).toBeUndefined()
    expect(
      parseLyricsSong({ artist: 'A'.repeat(900), title: 'T', album: 'B' })?.artist.length
    ).toBe(500)
  })
})
