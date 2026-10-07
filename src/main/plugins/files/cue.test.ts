import { describe, expect, it } from 'vitest'
import { cueTime, decodeCue, decodePage, parseCue, wordScore } from './cue'

const crlf = (lines: string[]): string => lines.join('\r\n') + '\r\n'

// From the user's "Slow, Deep and Hard" sheet (EAC, CRLF), shortened.
const slowDeep = crlf([
  'PERFORMER "Type O Negative"',
  'REM DATE 1991',
  'TITLE "Slow, Deep and Hard"',
  'FILE "CDImage.ape" WAVE',
  '  TRACK 01 AUDIO',
  '    TITLE "Unsuccessfully Coping with the Natural Beauty of Infidelity"',
  '    PERFORMER "Type O Negative"',
  '    INDEX 01 00:00:00',
  '  TRACK 02 AUDIO',
  '    TITLE "Der Untermensch"',
  '    PERFORMER "Type O Negative"',
  '    INDEX 01 12:40:22',
  '  TRACK 04 AUDIO',
  '    TITLE "Prelude to Agony"',
  '    INDEX 00 29:20:10',
  '    INDEX 01 29:21:00'
])

describe('cueTime', () => {
  it('reads mm:ss:ff with 75 frames a second', () => {
    expect(cueTime('00:00:00')).toBe(0)
    expect(cueTime('12:40:22')).toBeCloseTo(12 * 60 + 40 + 22 / 75, 9)
    expect(cueTime('01:00:74')).toBeCloseTo(60 + 74 / 75, 9)
  })

  it('takes minutes past 99', () => {
    expect(cueTime('104:05:00')).toBe(104 * 60 + 5)
  })

  it('refuses times that are not times', () => {
    expect(cueTime('00:60:00')).toBeUndefined()
    expect(cueTime('00:00:75')).toBeUndefined()
    expect(cueTime('1:2')).toBeUndefined()
    expect(cueTime('ab:cd:ef')).toBeUndefined()
  })
})

describe('parseCue', () => {
  it('reads REM REPLAYGAIN lines for the album and each track', () => {
    const s = parseCue(
      crlf([
        'REM REPLAYGAIN_ALBUM_GAIN -7.20 dB',
        'REM REPLAYGAIN_ALBUM_PEAK 0.988800',
        'FILE "img.flac" WAVE',
        '  TRACK 01 AUDIO',
        '    REM REPLAYGAIN_TRACK_GAIN -6.50 dB',
        '    REM REPLAYGAIN_TRACK_PEAK 0.900000',
        '    INDEX 01 00:00:00',
        '  TRACK 02 DATA',
        '    REM REPLAYGAIN_TRACK_GAIN -1.00 dB',
        '  TRACK 03 AUDIO',
        '    REM REPLAYGAIN_ALBUM_GAIN -1.00 dB',
        '    INDEX 01 01:00:00'
      ])
    )!
    expect(s.gain).toEqual({ album: -7.2, albumPeak: 0.9888 })
    expect(s.tracks[0].gain).toEqual({ track: -6.5, trackPeak: 0.9 })
    // a data track's line and an album line under a track count for nothing
    expect(s.tracks[1].gain).toBeUndefined()
  })

  it('reads a real EAC sheet with CRLF lines', () => {
    const s = parseCue(slowDeep)!
    expect(s.title).toBe('Slow, Deep and Hard')
    expect(s.performer).toBe('Type O Negative')
    expect(s.year).toBe(1991)
    expect(s.files).toEqual(['CDImage.ape'])
    expect(s.tracks.map((t) => t.no)).toEqual([1, 2, 4])
    expect(s.tracks[0]).toEqual({
      no: 1,
      file: 0,
      start: 0,
      title: 'Unsuccessfully Coping with the Natural Beauty of Infidelity',
      performer: 'Type O Negative'
    })
    expect(s.tracks[1].start).toBeCloseTo(760 + 22 / 75, 9)
  })

  it('starts a track at INDEX 01, not at its pregap (INDEX 00)', () => {
    const s = parseCue(slowDeep)!
    expect(s.tracks[2].start).toBe(29 * 60 + 21)
  })

  it('starts at INDEX 00 when a track has no INDEX 01', () => {
    const s = parseCue(crlf(['FILE "a.flac" WAVE', 'TRACK 01 AUDIO', 'INDEX 00 00:02:00']))!
    expect(s.tracks[0].start).toBe(2)
  })

  it('leaves out a track with no index at all', () => {
    const s = parseCue(
      crlf(['FILE "a.flac" WAVE', 'TRACK 01 AUDIO', 'TRACK 02 AUDIO', 'INDEX 01 00:10:00'])
    )!
    expect(s.tracks.map((t) => t.no)).toEqual([2])
  })

  it('reads REM GENRE, DATE and DISCNUMBER, with or without quotes', () => {
    const s = parseCue(
      crlf([
        'REM GENRE "Gothic Metal"',
        'REM DATE 2003/10/01',
        'REM DISCNUMBER 2',
        'REM COMMENT "ExactAudioCopy v0.95b4"',
        'FILE x.flac WAVE',
        'TRACK 01 AUDIO',
        'REM DATE 1999',
        'INDEX 01 00:00:00'
      ])
    )!
    expect(s.genre).toBe('Gothic Metal')
    expect(s.year).toBe(2003)
    expect(s.disc).toBe(2)
    expect(s.files).toEqual(['x.flac'])
  })

  it('keeps album and track TITLE and PERFORMER apart', () => {
    const s = parseCue(
      crlf([
        'TITLE "Hits"',
        'PERFORMER "Various"',
        'FILE "a.ape" WAVE',
        'TRACK 01 AUDIO',
        'TITLE "One"',
        'PERFORMER "A"',
        'INDEX 01 00:00:00',
        'TRACK 02 AUDIO',
        'TITLE "Two"',
        'INDEX 01 03:00:00'
      ])
    )!
    expect(s.title).toBe('Hits')
    expect(s.performer).toBe('Various')
    expect(s.tracks.map((t) => [t.title, t.performer])).toEqual([
      ['One', 'A'],
      ['Two', undefined]
    ])
  })

  it('handles quotes: none, a quote inside, a missing closing quote', () => {
    const s = parseCue(
      crlf([
        'TITLE No Quotes Here',
        'FILE "My "Best" Album.flac" WAVE',
        'TRACK 01 AUDIO',
        'TITLE "Say "Hi""',
        'INDEX 01 00:00:00',
        'TRACK 02 AUDIO',
        'TITLE "Unclosed',
        'INDEX 01 01:00:00'
      ])
    )!
    expect(s.title).toBe('No Quotes Here')
    expect(s.files).toEqual(['My "Best" Album.flac'])
    expect(s.tracks.map((t) => t.title)).toEqual(['Say "Hi"', 'Unclosed'])
  })

  it('reads a FILE name with spaces and no quotes', () => {
    const s = parseCue(crlf(['FILE My Album.wav WAVE', 'TRACK 01 AUDIO', 'INDEX 01 00:00:00']))!
    expect(s.files).toEqual(['My Album.wav'])
  })

  it('reads sheets with several FILE lines, each index in its own file', () => {
    const s = parseCue(
      crlf([
        'FILE "01.flac" WAVE',
        'TRACK 01 AUDIO',
        'INDEX 01 00:00:00',
        'TRACK 02 AUDIO',
        'INDEX 00 03:58:10',
        'FILE "02.flac" WAVE',
        'INDEX 01 00:00:00',
        'TRACK 03 AUDIO',
        'INDEX 01 04:00:00'
      ])
    )!
    expect(s.files).toEqual(['01.flac', '02.flac'])
    expect(s.tracks.map((t) => [t.no, t.file, t.start])).toEqual([
      [1, 0, 0],
      [2, 1, 0],
      [3, 1, 240]
    ])
  })

  it('skips data tracks and their titles', () => {
    const s = parseCue(
      crlf([
        'FILE "img.bin" BINARY',
        'TRACK 01 MODE1/2352',
        'TITLE "Data"',
        'INDEX 01 00:00:00',
        'TRACK 02 AUDIO',
        'TITLE "Song"',
        'INDEX 01 10:00:00'
      ])
    )!
    expect(s.title).toBeUndefined()
    expect(s.tracks.map((t) => t.title)).toEqual(['Song'])
  })

  it('takes lower-case commands, LF and CR line ends, and blank lines', () => {
    const s = parseCue('title "A"\n\nfile "a.flac" wave\rtrack 1 audio\n  index 1 00:01:00\n')!
    expect(s.title).toBe('A')
    expect(s.tracks).toEqual([{ no: 1, file: 0, start: 1 }])
  })

  it('gives nothing for text with no audio tracks', () => {
    expect(parseCue('')).toBeUndefined()
    expect(parseCue('hello\r\nworld')).toBeUndefined()
    expect(parseCue(crlf(['TRACK 01 AUDIO', 'INDEX 01 00:00:00']))).toBeUndefined()
  })
})

describe('decodeCue', () => {
  const title = 'TITLE "Дискография"\r\n'

  it('reads UTF-8, with or without a BOM', () => {
    const utf8 = new TextEncoder().encode(title)
    expect(decodeCue(utf8)).toBe(title)
    expect(decodeCue(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]))).toBe(title)
  })

  it('reads Windows-1251 when the bytes are not UTF-8', () => {
    // "Дискография" in cp1251
    const cp = Uint8Array.from([
      ...Buffer.from('TITLE "'),
      0xc4,
      0xe8,
      0xf1,
      0xea,
      0xee,
      0xe3,
      0xf0,
      0xe0,
      0xf4,
      0xe8,
      0xff,
      ...Buffer.from('"\r\n')
    ])
    expect(decodeCue(cp)).toBe(title)
  })

  it('reads UTF-16 with a BOM', () => {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(title, 'utf16le')])
    expect(decodeCue(new Uint8Array(le))).toBe(title)
  })

  it('reads plain ASCII as it is', () => {
    expect(decodeCue(new TextEncoder().encode(slowDeep))).toBe(slowDeep)
  })
})

// Text in a single-byte code page, from the table decodeSingleByte uses.
function encode(text: string, page: string): Uint8Array {
  const table = decodePage(
    Uint8Array.from({ length: 256 }, (_, i) => i),
    page
  )
  return Uint8Array.from([...text], (ch) => {
    const b = table.indexOf(ch)
    if (b < 0) throw new Error(`${ch} is not in ${page}`)
    return b
  })
}

const sheet = (performer: string, album: string, titles: string[]): string =>
  crlf([
    `PERFORMER "${performer}"`,
    `TITLE "${album}"`,
    'FILE "image.ape" WAVE',
    ...titles.flatMap((t, i) => [
      `  TRACK 0${i + 1} AUDIO`,
      `    TITLE "${t}"`,
      `    INDEX 01 0${i}:00:00`
    ])
  ])

describe('decodeCue with a single-byte code page', () => {
  const russian = [
    sheet('Кино', 'Группа крови', [
      'Группа крови',
      'Закрой за мной дверь, я ухожу',
      'Спокойная ночь'
    ]),
    sheet('ДДТ', 'Осень', ['Что такое осень?', 'Ёлка', 'Я получил эту роль']),
    sheet('Ария', 'Герой асфальта', ['Улица роз', '«1100»', 'Я']),
    sheet('Various', 'Сборник', ['Rock-n-roll мёртв', 'Hello', 'Звезда по имени Солнце']),
    sheet('ГРАЖДАНСКАЯ ОБОРОНА', 'ВСЁ ИДЁТ ПО ПЛАНУ', ['ВСЁ ИДЁТ ПО ПЛАНУ', 'МОЯ ОБОРОНА']),
    sheet('Various', 'Artist - Название', [
      'Кино - Кукушка',
      'Ёж',
      'Би-2 - Полковнику никто не пишет'
    ]),
    sheet('Various', 'Сборник № 3', ['Трек №1', '«Ночь»', 'А я иду']),
    sheet('Океан Ельзи', 'Без меж', ['Обійми', 'Я і ти', 'Відпусти', 'Така, як ти є']),
    sheet('Ляпис Трубецкой', 'Ў', ['Ў', 'Воины света', 'Каждый ўдзень'])
  ]
  const western = [
    sheet('Mötley Crüe', 'Dr. Feelgood', ['Kickstart My Heart', 'Same Ol’ Situation']),
    sheet('Sigur Rós', 'Ágætis byrjun', ['Svefn-g-englar', 'Starálfur', 'Olsen Olsen']),
    sheet('Édith Piaf', 'Non, je ne regrette rien', ['La Vie en rose', 'Hymne à l’amour']),
    sheet('Björk', 'Début', ['Human Behaviour', 'Venus as a Boy', 'Café']),
    sheet('Motörhead', 'Ace of Spades', ['Ace of Spades']),
    sheet('Beyoncé', 'Lemonade', ['Formation', 'Sorry']),
    sheet('Various', 'Été', ['Señorita', 'Über alles', 'Crème brûlée']),
    sheet('Various', 'Été 2', ['Jag är så glad', 'Øresund']),
    // single bytes that are Cyrillic letters or signs in cp1251
    sheet('Björk', 'Live', ['Track ×2']),
    sheet('Various', 'Live at 2½ Club', ['Intro']),
    sheet('Various', 'Opus ¹', ['Intro']),
    sheet('Various', 'Voyage à Paris', ['Intro'])
  ]

  it('reads Russian sheets as Windows-1251', () => {
    for (const text of russian) expect(decodeCue(encode(text, 'windows-1251'))).toBe(text)
  })

  it('reads Western sheets as Windows-1252', () => {
    for (const text of western) expect(decodeCue(encode(text, 'windows-1252'))).toBe(text)
  })

  it('takes Windows-1251 on a tie, as before', () => {
    // "Я" alone is "ß" in cp1252: one letter either way
    const text = sheet('A', 'B', ['Я'])
    expect(decodeCue(encode(text, 'windows-1251'))).toBe(text)
  })
})

describe('decodePage', () => {
  it("gives cp1252's letters and signs for 0x80-0x9f, not controls", () => {
    expect(decodePage(Uint8Array.from([0x80, 0x8a, 0x92, 0x9f, 0x81]), 'windows-1252')).toBe(
      '\u20ac\u0160\u2019\u0178\x81'
    )
    expect(decodePage(Uint8Array.from([0x80, 0xb8]), 'windows-1251')).toBe('\u0402\u0451')
  })
})

describe('wordScore', () => {
  it('likes whole Cyrillic words and Latin words with a few accents', () => {
    expect(wordScore('Группа крови')).toBe(11)
    expect(wordScore('Café été')).toBe(3)
    expect(wordScore('plain ASCII')).toBe(0)
  })

  it('counts against mixed scripts, runs of accents and odd signs', () => {
    expect(wordScore('Cafй')).toBe(-1)
    expect(wordScore('Ãðóïïà')).toBe(-6)
    expect(wordScore('a \x98 b')).toBe(-1)
    expect(wordScore('Opus №')).toBe(-1)
    expect(wordScore('Симфония № 5')).toBe(8)
    expect(wordScore('Track ×2, 2½, ¹ £5')).toBe(0)
    expect(wordScore('«a» \u2013 b')).toBe(0)
  })
})
