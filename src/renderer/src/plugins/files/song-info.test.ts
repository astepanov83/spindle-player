import { describe, expect, it, vi } from 'vitest'
import type { Album, Track } from '../../../../shared/library'
import { defaultPalettes } from '../../../../shared/palette'
import type { SongFileInfo } from '../../../../shared/plugins/files/song-info'
import type { InfoLine, InfoSection } from '../types'
import type { SongInfoInput } from './song-info'

// radio's page half hears main from the start
vi.stubGlobal('window', {
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

const {
  bitrateText,
  codecText,
  fixText,
  fmtBitrate,
  fmtBytes,
  fmtChannels,
  fmtGain,
  fmtPeak,
  fmtPlace,
  fmtRate,
  fmtSize,
  pictureText,
  songInfoView,
  tagTypeName
} = await import('./song-info')

describe('values', () => {
  it('sample rates in Hz and kHz', () => {
    expect(fmtRate(44100)).toBe('44.1 kHz')
    expect(fmtRate(48000)).toBe('48 kHz')
    expect(fmtRate(176400)).toBe('176.4 kHz')
    expect(fmtRate(22050)).toBe('22.1 kHz')
    expect(fmtRate(500)).toBe('500 Hz')
  })

  it('bitrates in kbps', () => {
    expect(fmtBitrate(320000)).toBe('320 kbps')
    expect(fmtBitrate(1411200)).toBe('1,411 kbps')
    expect(fmtBitrate(128499)).toBe('128 kbps')
    expect(fmtBitrate(800)).toBe('800 bps')
  })

  it('sizes in KB, MB and GB, with the bytes past a KB', () => {
    expect(fmtBytes(1)).toBe('1 byte')
    expect(fmtBytes(512)).toBe('512 bytes')
    expect(fmtBytes(84 * 1024)).toBe('84 KB')
    expect(fmtBytes(7654321)).toBe('7.3 MB')
    expect(fmtBytes(45 * 1024 * 1024)).toBe('45 MB')
    expect(fmtBytes(1.5 * 1024 ** 3)).toBe('1.5 GB')
    expect(fmtSize(7654321)).toBe('7.3 MB (7,654,321 bytes)')
    expect(fmtSize(900)).toBe('900 bytes')
  })

  it('gains with their sign, peaks as written', () => {
    expect(fmtGain(-7.5)).toBe('-7.50 dB')
    expect(fmtGain(2.1)).toBe('+2.10 dB')
    expect(fmtGain(-0.001)).toBe('0.00 dB')
    expect(fmtPeak(0.98765)).toBe('0.987650')
    expect(fmtPeak(1.2)).toBe('1.200000 (over full scale)')
  })

  it('channels by their usual names', () => {
    expect([1, 2, 6, 8, 4].map(fmtChannels)).toEqual([
      'Mono',
      'Stereo',
      '5.1 (6 channels)',
      '7.1 (8 channels)',
      '4 channels'
    ])
  })

  it('places in a disc image to the hundredth', () => {
    expect(fmtPlace(0)).toBe('0:00.00')
    expect(fmtPlace(65.5)).toBe('1:05.50')
    expect(fmtPlace(59.999)).toBe('1:00.00')
    expect(fmtPlace(3725.25)).toBe('1:02:05.25')
  })

  it('the codec with its profile, lossless said', () => {
    expect(codecText({ codec: 'FLAC', lossless: true })).toBe('FLAC, lossless')
    expect(codecText({ codec: 'MPEG 1 Layer 3', profile: 'V0', lossless: false })).toBe(
      'MPEG 1 Layer 3, V0'
    )
    expect(codecText({})).toBeUndefined()
  })

  it("the bitrate says where it came from, and a CUE track's is the image's", () => {
    expect(bitrateText({ bitrate: 320000, bitrateFrom: 'header' }, false)).toBe('320 kbps')
    expect(bitrateText({ bitrate: 912000, bitrateFrom: 'size' }, false)).toBe(
      'About 912 kbps, from the file size'
    )
    expect(bitrateText({ bitrate: 912000, bitrateFrom: 'header' }, true)).toBe(
      '912 kbps (of the whole image)'
    )
    expect(bitrateText({}, false)).toBeUndefined()
  })

  it('pictures by kind, format, size and bytes', () => {
    expect(
      pictureText({
        kind: 'Cover (front)',
        format: 'image/jpeg',
        width: 600,
        height: 600,
        bytes: 86016
      })
    ).toBe('Cover (front) · JPEG · 600 × 600 · 84 KB')
    expect(pictureText({ bytes: 100 })).toBe('Picture · 100 bytes')
  })

  it('kinds of tags by the names people know', () => {
    expect(tagTypeName('vorbis')).toBe('Vorbis comments')
    expect(tagTypeName('ID3v2.4')).toBe('ID3v2.4')
  })

  it('an artist fix says whose it is', () => {
    expect(fixText('marina vale', 'Marina Vale', undefined)).toBe(
      'The tag says “marina vale”, shown as “Marina Vale” by your change'
    )
    expect(fixText('A & B', 'A, B', true)).toBe(
      'The tag says “A & B”, shown as “A, B” by Fix artist names (AI)'
    )
    expect(fixText(undefined, 'A', undefined)).toBeUndefined()
  })
})

const track: Track = {
  id: 't1',
  title: 'Night Bus',
  duration: 245,
  albumId: 'al',
  artist: 'Marina Vale',
  album: 'Blue Hours',
  no: 3,
  disc: 1,
  codec: 'MPEG 1 Layer 3',
  folder: 0,
  rate: 44100
}

const album: Album = {
  id: 'al',
  title: 'Blue Hours',
  artist: 'Marina Vale',
  year: 2003,
  added: new Date(2026, 8, 1).getTime(),
  trackIds: ['t1'],
  palette: defaultPalettes,
  cover: '',
  coverLarge: ''
}

const input = (o: Partial<SongInfoInput> = {}): SongInfoInput => ({
  t: track,
  album,
  show: vi.fn(async () => true),
  copy: vi.fn(async () => true),
  ...o
})

const section = (sections: InfoSection[], title: string): InfoSection =>
  sections.find((s) => s.title === title)!
const values = (s: InfoSection): Record<string, string> =>
  Object.fromEntries(
    s.rows
      .filter((r): r is Extract<InfoLine, { label: string }> => 'label' in r)
      .map((r) => [r.label, r.value])
  )

describe('songInfoView', () => {
  it('while the file is read: what the library knows', () => {
    const v = songInfoView(input({ t: { ...track, gain: { track: -6 } } }))
    expect(v.title).toBe('Night Bus')
    expect(v.sections.map((s) => s.title)).toEqual([
      'Song',
      'File',
      'Loudness',
      'In Spindle',
      'All tags'
    ])
    expect(values(section(v.sections, 'Song'))).toEqual({
      Title: 'Night Bus',
      Artist: 'Marina Vale',
      Album: 'Blue Hours',
      'Album artist': 'Marina Vale',
      Track: '3',
      Disc: '1',
      Year: '2003',
      Length: '4:05'
    })
    expect(section(v.sections, 'File')).toMatchObject({ note: 'Reading the file…' })
    expect(values(section(v.sections, 'File'))).toEqual({
      Format: 'MPEG 1 Layer 3',
      'Sample rate': '44.1 kHz'
    })
    expect(values(section(v.sections, 'Loudness'))).toEqual({ 'Track gain': '-6.00 dB' })
    expect(values(section(v.sections, 'In Spindle'))).toEqual({
      Plays: 'Never',
      Loved: 'No',
      Added: '1 September 2026'
    })
    expect(section(v.sections, 'All tags').note).toBe('Reading the file…')
  })

  const file: SongFileInfo = {
    path: '/m/Blue Hours/03 Night Bus.mp3',
    added: new Date(2026, 8, 2).getTime(),
    year: 2004,
    genre: ['Jazz'],
    size: 7654321,
    format: {
      container: 'MPEG',
      codec: 'MPEG 1 Layer 3',
      profile: 'V0',
      tool: 'LAME3.100',
      lossless: false,
      sampleRate: 44100,
      channels: 2,
      bitrate: 245000,
      bitrateFrom: 'header'
    },
    tags: [
      { type: 'ID3v2.3', id: 'TIT2', value: 'Night Bus' },
      { type: 'ID3v2.3', id: 'USLT', value: 'line one\nline two' },
      {
        type: 'ID3v2.3',
        id: 'APIC',
        value: '',
        picture: { kind: 'Cover (front)', format: 'image/jpeg', bytes: 2048 }
      },
      { type: 'ID3v1', id: 'title', value: 'x'.repeat(10), cut: true }
    ]
  }

  it('a read file: format, path with its buttons, every tag', async () => {
    const i = input({
      file,
      play: { n: 3, last: new Date(2026, 9, 14, 13, 5).getTime() },
      lovedAt: new Date(2026, 9, 2).getTime()
    })
    const v = songInfoView(i)
    expect(values(section(v.sections, 'Song'))).toMatchObject({ Year: '2004', Genre: 'Jazz' })
    // the library's split genres win over the raw tag (ticket 122)
    const split = songInfoView({ ...i, t: { ...track, genre: ['Rock', 'Metal'] } })
    expect(values(section(split.sections, 'Song'))).toMatchObject({ Genre: 'Rock, Metal' })
    const f = section(v.sections, 'File')
    expect(f.note).toBeUndefined()
    expect(values(f)).toEqual({
      Format: 'MPEG',
      Codec: 'MPEG 1 Layer 3, V0',
      Encoder: 'LAME3.100',
      'Sample rate': '44.1 kHz',
      Channels: 'Stereo',
      Bitrate: '245 kbps',
      'File size': '7.3 MB (7,654,321 bytes)',
      Path: file.path
    })
    const path = f.rows.find((r) => 'label' in r && r.label === 'Path') as Extract<
      InfoLine,
      { label: string }
    >
    expect(path.path).toBe(true)
    expect(path.buttons?.map((b) => b.label)).toEqual(['Show in folder', 'Copy path'])
    expect(await path.buttons![1].run()).toBe('Copied')
    expect(i.copy).toHaveBeenCalledWith(file.path)
    expect(await path.buttons![0].run()).toBeUndefined()
    expect(i.show).toHaveBeenCalledWith('file')
    vi.mocked(i.show).mockResolvedValueOnce(false)
    expect(await path.buttons![0].run()).toBe("Couldn't open the folder")

    expect(section(v.sections, 'Loudness').note).toBe('No ReplayGain tags')
    expect(values(section(v.sections, 'In Spindle'))).toEqual({
      Plays: '3 times',
      'Last played': '14 October 2026, 13:05',
      Loved: 'Yes, since 2 October 2026',
      Added: '2 September 2026'
    })
    const tags = section(v.sections, 'All tags')
    expect(tags.rows).toEqual([
      { heading: 'ID3v2.3' },
      { label: 'TIT2', value: 'Night Bus', long: false },
      { label: 'USLT', value: 'line one\nline two', long: true },
      { label: 'APIC', value: 'Cover (front) · JPEG · 2 KB' },
      { heading: 'ID3v1' },
      { label: 'title', value: `${'x'.repeat(10)}…`, long: false }
    ])
  })

  it('a CUE track: the image and the sheet, with where the track lies', () => {
    const v = songInfoView(
      input({
        file: {
          ...file,
          path: '/m/disc.flac',
          gain: { album: -8.2, albumPeak: 0.99 },
          cue: { sheet: '/m/disc.cue', start: 300.5, sheetGone: true }
        }
      })
    )
    const f = values(section(v.sections, 'File'))
    expect(f).toMatchObject({
      'Disc image': '/m/disc.flac',
      'CUE sheet': '/m/disc.cue (not found)',
      'Starts at': '5:00.50',
      'Ends at': 'The end of the image',
      Bitrate: '245 kbps (of the whole image)'
    })
    expect(f.Path).toBeUndefined()
    expect(section(v.sections, 'All tags').note).toBe(
      'The disc image’s own tags. The track’s come from its CUE sheet.'
    )
    expect(values(section(v.sections, 'Loudness'))).toEqual({
      'Album gain': '-8.20 dB',
      'Album peak': '0.990000'
    })
  })

  it('a file deleted after the scan: the error, and what the library knows', () => {
    const v = songInfoView(
      input({
        t: { ...track, gain: { track: -1 } },
        file: {
          path: '/m/gone.mp3',
          gone: true,
          gain: { track: -1 },
          error: 'The file is not there any more. It was moved or deleted after the last scan.'
        }
      })
    )
    const f = section(v.sections, 'File')
    expect(f.note).toMatch(/not there any more/)
    expect(values(f)).toEqual({ Path: '/m/gone.mp3' })
    expect(values(section(v.sections, 'Loudness'))).toEqual({ 'Track gain': '-1.00 dB' })
    expect(section(v.sections, 'All tags').note).toBe('No file to read.')
  })

  it('a file that could not be read', () => {
    const v = songInfoView(
      input({ file: { path: '/a.ape', error: 'The file could not be read: x' } })
    )
    expect(section(v.sections, 'File').note).toBe('The file could not be read: x')
    expect(section(v.sections, 'All tags').note).toBe('The tags could not be read.')
  })

  it('a file with no tags, and one with more than are listed', () => {
    const none = songInfoView(input({ file: { path: '/a', tags: [] } }))
    expect(section(none.sections, 'All tags').note).toBe('No tags in the file.')
    const many = songInfoView(input({ file: { ...file, moreTags: 1200 } }))
    expect(section(many.sections, 'All tags').note).toBe('1,200 more tags are not listed.')
  })

  it('main had nothing for it', () => {
    const v = songInfoView(input({ file: null }))
    expect(section(v.sections, 'File').note).toBe('Spindle could not find this song’s file.')
  })

  it('several artists, and the fixes of artists.json', () => {
    const v = songInfoView(
      input({
        t: { ...track, artist: 'A, B', artists: ['A', 'B'], artistTag: 'A & B', grouped: true },
        album: { ...album, artist: 'Marina Vale', artistTag: 'marina vale' }
      })
    )
    expect(values(section(v.sections, 'Song')).Artists).toBe('A, B')
    expect(values(section(v.sections, 'In Spindle'))).toMatchObject({
      'Artist fix': 'The tag says “A & B”, shown as “A, B” by Fix artist names (AI)',
      'Album artist fix': 'The tag says “marina vale”, shown as “Marina Vale” by your change'
    })
  })

  it('info changed in Spindle: the Song section shows it, In Spindle lists each change (ticket 129)', () => {
    const file = { path: '/m/a.mp3', year: 1995, genre: ['Ambient'] } as SongFileInfo
    const fixed: Track = {
      ...track,
      title: 'Night Bus (Live)',
      year: 1996,
      genre: ['Doom metal'],
      fileTags: { title: 'Night Bus', year: 1995, genre: ['Ambient'] }
    }
    const v = songInfoView(input({ t: fixed, file }))
    expect(values(section(v.sections, 'Song'))).toMatchObject({
      Title: 'Night Bus (Live)',
      Year: '1996',
      Genre: 'Doom metal'
    })
    expect(values(section(v.sections, 'In Spindle'))).toMatchObject({
      'Title changed': 'Night Bus → Night Bus (Live)',
      'Year changed': '1995 → 1996',
      'Genre changed': 'Ambient → Doom metal'
    })
    // a genre taken away in Spindle is not the file's again
    const gone = songInfoView(input({ t: { ...track, fileTags: { genre: ['Ambient'] } }, file }))
    expect(values(section(gone.sections, 'Song')).Genre).toBeUndefined()
    expect(values(section(gone.sections, 'In Spindle'))['Genre changed']).toBe('Ambient → none')
    // nothing changed: no such rows
    const plain = values(section(songInfoView(input({ file })).sections, 'In Spindle'))
    expect(Object.keys(plain).some((k) => k.endsWith(' changed'))).toBe(false)
  })
})
