import { describe, expect, it } from 'vitest'
import {
  cleanText,
  discFolderNumber,
  frontCover,
  isArtFolder,
  isAudioFile,
  isDiscFolder,
  normalizeTags,
  pickArtImage,
  pickFolderImage,
  titleFromFileName
} from './tags'

describe('normalizeTags', () => {
  it('keeps MusicBrainz release ids, lowercased, only when they look like ids', () => {
    const t = normalizeTags({
      common: {
        musicbrainz_releasegroupid: 'F5093C06-23E3-404F-AEAA-40F72885EE3A',
        musicbrainz_albumid: 'not an id'
      },
      format: {}
    })
    expect(t.mbReleaseGroup).toBe('f5093c06-23e3-404f-aeaa-40f72885ee3a')
    expect(t).not.toHaveProperty('mbRelease')
  })

  it('keeps the tags we use, cleaned up', () => {
    const t = normalizeTags({
      common: {
        title: '  Night   Bus ',
        artist: 'The Quiet Hours\u0000',
        albumartist: 'The Quiet Hours',
        album: 'Night Bus',
        track: { no: 3 },
        disk: { no: 1 },
        year: 2021,
        genre: ['Ambient', ' ambient ', 'Ambient']
      },
      format: { duration: 203.456789, codec: 'FLAC', container: 'FLAC' }
    })
    expect(t).toEqual({
      title: 'Night Bus',
      artist: 'The Quiet Hours',
      albumArtist: 'The Quiet Hours',
      album: 'Night Bus',
      track: 3,
      disc: 1,
      year: 2021,
      genre: 'Ambient, ambient',
      duration: 203.46,
      codec: 'FLAC',
      container: 'FLAC'
    })
  })

  it('leaves out missing and empty tags', () => {
    const t = normalizeTags({
      common: { title: '   ', track: { no: null }, disk: { no: 0 }, genre: [] },
      format: { duration: NaN }
    })
    expect(t).toEqual({ duration: 0 })
  })

  it('takes the year from the date when there is no year tag', () => {
    expect(normalizeTags({ common: { date: '1998-05-01' }, format: {} }).year).toBe(1998)
    expect(normalizeTags({ common: { date: 'May 98' }, format: {} }).year).toBeUndefined()
    expect(normalizeTags({ common: { year: 12 }, format: {} }).year).toBeUndefined()
  })

  it('joins the artist list when there is no single artist tag', () => {
    expect(normalizeTags({ common: { artists: ['A', ' B '] }, format: {} }).artist).toBe('A, B')
  })
})

describe('file name rules', () => {
  it('knows audio files by extension, and skips hidden ones', () => {
    expect(isAudioFile('a.MP3')).toBe(true)
    expect(isAudioFile('a.opus')).toBe(true)
    expect(isAudioFile('a.wma')).toBe(true)
    expect(isAudioFile('._a.mp3')).toBe(false)
    expect(isAudioFile('cover.jpg')).toBe(false)
    expect(isAudioFile('mp3')).toBe(false)
  })

  it('picks the folder image by name', () => {
    const pick = (names: string[], folder = 'Night Bus'): string | undefined =>
      pickFolderImage(names, folder)?.name
    expect(pick(['front.png', 'Folder.JPG', 'x.jpg'])).toBe('Folder.JPG')
    expect(pick(['back.jpg', 'cover.gif'])).toBeUndefined()
    expect(pick(['cover.webp'])).toBe('cover.webp')
    expect(pick(['album.jpeg', 'cover.jpg'])).toBe('cover.jpg')
    // Windows Media Player's, the large one first
    const wmp = ['AlbumArtSmall.jpg', 'AlbumArt_{7E1B}_Large.jpg', 'Night Bus.jpg']
    expect(pick(wmp)).toBe('AlbumArt_{7E1B}_Large.jpg')
    expect(pick(['cover.jpg', ...wmp])).toBe('cover.jpg')
    // named after the folder
    expect(pick(['night bus.png', 'scan.jpg', '01.mp3'])).toBe('night bus.png')
    // the only image, next to songs, and not the back or the disc
    expect(pick(['01.mp3', 'scan.jpg'])).toBe('scan.jpg')
    expect(pick(['a.cue', 'scan.jpg'])).toBe('scan.jpg')
    expect(pick(['scan.jpg'])).toBeUndefined()
    expect(pick(['01.mp3', 'a.jpg', 'b.jpg'])).toBeUndefined()
    expect(pick(['01.mp3', 'Back Cover.jpg'])).toBeUndefined()
    expect(pick(['01.mp3', 'cd.png'])).toBeUndefined()
    // better kinds rank lower
    const rank = (names: string[]): number => pickFolderImage(names, 'Night Bus')!.rank
    expect(rank(['cover.jpg'])).toBeLessThan(rank(['AlbumArtSmall.jpg']))
    expect(rank(['AlbumArtSmall.jpg'])).toBeLessThan(rank(['Night Bus.jpg']))
    expect(rank(['Night Bus.jpg'])).toBeLessThan(rank(['01.mp3', 'scan.jpg']))
  })

  it('picks the front from a scans folder', () => {
    const pick = (names: string[]): string | undefined => pickArtImage(names)?.name
    expect(isArtFolder('Scans')).toBe(true)
    expect(isArtFolder('Artwork')).toBe(true)
    expect(isArtFolder('covers')).toBe(true)
    expect(isArtFolder('CD1')).toBe(false)
    expect(pick(['Back.jpg', 'CD.jpg', 'Front.jpg', 'Inlay.jpg'])).toBe('Front.jpg')
    expect(pick(['01 - booklet.jpg', '00 - cover.png'])).toBe('00 - cover.png')
    expect(pick(['front_cover.jpg', 'back_cover.jpg'])).toBe('front_cover.jpg')
    expect(pick(['scan001.jpg'])).toBe('scan001.jpg')
    expect(pick(['scan001.jpg', 'scan002.jpg'])).toBeUndefined()
    expect(pick(['back.jpg'])).toBeUndefined()
    // a lone front among other scans
    expect(pick(['back.jpg', 'scan001.jpg'])).toBe('scan001.jpg')
    expect(pickFolderImage(['AlbumArt_{B}_Large.jpg', 'AlbumArt_{A}_Large.jpg'], 'x')?.name).toBe(
      'AlbumArt_{A}_Large.jpg'
    )
    // a front-looking name beats the only image, and both lose to the album folder's own kinds
    const front = pickArtImage(['front.jpg'])!.rank
    const only = pickArtImage(['scan001.jpg'])!.rank
    expect(front).toBeLessThan(only)
    expect(pickFolderImage(['Night Bus.jpg'], 'Night Bus')!.rank).toBeLessThan(front)
    // a lone image next to songs could be anything; a front scan is likelier the cover
    expect(front).toBeLessThan(pickFolderImage(['01.mp3', 'x.jpg'], 'Night Bus')!.rank)
  })

  it('knows disc folders', () => {
    expect(isDiscFolder('CD1')).toBe(true)
    expect(isDiscFolder('Disc 2')).toBe(true)
    expect(isDiscFolder('disk_03')).toBe(true)
    expect(isDiscFolder('CD Singles')).toBe(false)
    expect(isDiscFolder('Discography')).toBe(false)
    expect(discFolderNumber('CD 12')).toBe(12)
    expect(discFolderNumber('Bonus')).toBeUndefined()
  })

  it('makes a title and track number from a file name', () => {
    expect(titleFromFileName('03 - Night Bus.mp3')).toEqual({ title: 'Night Bus', no: 3 })
    expect(titleFromFileName('07. Terminus.flac')).toEqual({ title: 'Terminus', no: 7 })
    expect(titleFromFileName('12 Seat_by_the_Window.ogg')).toEqual({
      title: 'Seat by the Window',
      no: 12
    })
    expect(titleFromFileName('1999.mp3')).toEqual({ title: '1999' })
    expect(titleFromFileName('Untitled.wav')).toEqual({ title: 'Untitled' })
  })

  it('cleans text', () => {
    expect(cleanText(7)).toBeUndefined()
    expect(cleanText(' a \n b ')).toBe('a b')
  })
})

describe('frontCover', () => {
  it('prefers the picture marked as front cover', () => {
    const a = { data: new Uint8Array([1]), type: 'Artist' }
    const b = { data: new Uint8Array([2]), type: 'Cover (front)' }
    expect(frontCover([a, b])).toBe(b)
    expect(frontCover([a])).toBe(a)
    expect(frontCover(undefined)).toBeUndefined()
  })
})
