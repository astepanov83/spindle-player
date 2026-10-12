import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LyricsContentType, TimestampFormat, type ILyricsTag } from 'music-metadata'
import { flacWith } from './fixtures/flac'
import { lrcPaths, lyricsFromTags, readLyrics, type LyricsIo } from './lyrics-files'

const tag = (o: Partial<ILyricsTag>): ILyricsTag => ({
  contentType: LyricsContentType.lyrics,
  timeStampFormat: TimestampFormat.notSynchronized,
  syncText: [],
  ...o
})

// Files in memory; tags by path.
function fakeIo(
  files: Record<string, string>,
  tags: Record<string, ILyricsTag[]> = {}
): { io: LyricsIo; read: string[] } {
  const read: string[] = []
  const io: LyricsIo = {
    readText: async (p) => {
      read.push(p)
      return files[p]
    },
    tags: async (p) => {
      read.push('tags:' + p)
      return tags[p]
    }
  }
  return { io, read }
}

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'spindle-lyrics-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('lrcPaths', () => {
  it('is the song name with .lrc', () => {
    expect(lrcPaths({ path: '/m/A/03 Red Water.flac' })).toEqual([
      '/m/A/03 Red Water.lrc',
      '/m/A/03 Red Water.LRC'
    ])
  })

  it('is named after the track for a CUE track, with what Windows forbids as _', () => {
    expect(lrcPaths({ path: '/m/A/disc.ape', cue: { no: 3, title: 'Red/Water?' } })).toEqual([
      '/m/A/03 Red_Water_.lrc',
      '/m/A/03 - Red_Water_.lrc',
      '/m/A/03. Red_Water_.lrc',
      '/m/A/Red_Water_.lrc'
    ])
    expect(lrcPaths({ path: '/m/A/disc.ape', cue: { no: 1, title: ' ' } })).toEqual([])
  })
})

describe('lyricsFromTags', () => {
  it('takes synced words over plain ones, whatever comes first', () => {
    expect(
      lyricsFromTags([
        tag({ text: 'just words' }),
        tag({
          timeStampFormat: TimestampFormat.milliseconds,
          syncText: [
            { timestamp: 1500, text: 'One' },
            { timestamp: 61250, text: 'Two' }
          ]
        })
      ])
    ).toEqual({
      synced: [
        { t: 1.5, text: 'One' },
        { t: 61.25, text: 'Two' }
      ]
    })
  })

  it('finds the other stamps music-metadata left in the words of a line', () => {
    expect(
      lyricsFromTags([
        tag({
          timeStampFormat: TimestampFormat.milliseconds,
          syncText: [{ timestamp: 1000, text: '[00:20.00]Chorus' }]
        })
      ])
    ).toEqual({
      synced: [
        { t: 1, text: 'Chorus' },
        { t: 20, text: 'Chorus' }
      ]
    })
  })

  it('gives plain words for frame times, and for a text tag with no stamps', () => {
    expect(
      lyricsFromTags([
        tag({ timeStampFormat: TimestampFormat.mpegFrameNumber, syncText: [{ text: 'a' }] })
      ])
    ).toEqual({ plain: 'a' })
    expect(lyricsFromTags([tag({ text: 'Line one\nLine two' })])).toEqual({
      plain: 'Line one\nLine two'
    })
    expect(lyricsFromTags([tag({ text: '  ' })])).toBeUndefined()
    expect(lyricsFromTags(undefined)).toBeUndefined()
  })
})

describe('readLyrics', () => {
  it('takes an .lrc over the tags, and reads no tags then', async () => {
    const { io, read } = fakeIo(
      { '/m/a.lrc': '[00:01.00]From the file' },
      { '/m/a.mp3': [tag({ text: 'From the tags' })] }
    )
    expect(await readLyrics({ path: '/m/a.mp3' }, io)).toEqual({
      synced: [{ t: 1, text: 'From the file' }]
    })
    expect(read).toEqual(['/m/a.lrc'])
  })

  it('reads the tags with no .lrc, or one with no words', async () => {
    const tags = { '/m/a.mp3': [tag({ text: 'From the tags' })] }
    expect(await readLyrics({ path: '/m/a.mp3' }, fakeIo({}, tags).io)).toEqual({
      plain: 'From the tags'
    })
    expect(
      await readLyrics({ path: '/m/a.mp3' }, fakeIo({ '/m/a.lrc': '[ar:X]' }, tags).io)
    ).toEqual({ plain: 'From the tags' })
  })

  it("never reads a disc image's tags for a CUE track", async () => {
    const { io, read } = fakeIo({}, { '/m/disc.flac': [tag({ text: 'whole disc' })] })
    expect(await readLyrics({ path: '/m/disc.flac', cue: { no: 2, title: 'Two' } }, io)).toBe(
      undefined
    )
    expect(read.some((r) => r.startsWith('tags:'))).toBe(false)
    const named = fakeIo({ '/m/02 - Two.lrc': 'Plain two' })
    expect(
      await readLyrics({ path: '/m/disc.flac', cue: { no: 2, title: 'Two' } }, named.io)
    ).toEqual({ plain: 'Plain two' })
  })

  it('gives nothing when a read fails', async () => {
    const io: LyricsIo = {
      readText: () => Promise.reject(new Error('EIO')),
      tags: () => Promise.reject(new Error('EIO'))
    }
    expect(await readLyrics({ path: '/m/a.mp3' }, io)).toBeUndefined()
  })

  it('reads real files: an .lrc in an old code page, one too big, and a FLAC tag', async () => {
    const song = join(dir, '01 Song.flac')
    await writeFile(song, flacWith(['TITLE=Song', 'LYRICS=[00:01.00][00:03.00]Hey\n[00:02.00]Ho']))
    // the tag's words, with both stamps of the first line
    expect(await readLyrics({ path: song })).toEqual({
      synced: [
        { t: 1, text: 'Hey' },
        { t: 2, text: 'Ho' },
        { t: 3, text: 'Hey' }
      ]
    })
    // cp1251: "Привет"
    await writeFile(
      join(dir, '01 Song.lrc'),
      Buffer.concat([Buffer.from('[00:04.00]'), Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])])
    )
    expect(await readLyrics({ path: song })).toEqual({ synced: [{ t: 4, text: 'Привет' }] })
    // past 256 KB the file is not read, so the tag's words show
    await writeFile(join(dir, '01 Song.lrc'), '[00:04.00]x\n' + 'y'.repeat(256 * 1024))
    expect(await readLyrics({ path: song })).toMatchObject({
      synced: [{ t: 1, text: 'Hey' }, {}, {}]
    })
  })

  it('gives nothing for a song with no words and no .lrc', async () => {
    const song = join(dir, '02 Quiet.flac')
    await writeFile(song, flacWith(['TITLE=Quiet']))
    expect(await readLyrics({ path: song })).toBeUndefined()
    expect(await readLyrics({ path: join(dir, 'gone.flac') })).toBeUndefined()
  })
})
