import { describe, expect, it } from 'vitest'
import {
  cleanText,
  discFolderNumber,
  frontCover,
  isAudioFile,
  isDiscFolder,
  normalizeTags,
  pickFolderImage,
  titleFromFileName
} from './tags'

describe('normalizeTags', () => {
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
    expect(isAudioFile('._a.mp3')).toBe(false)
    expect(isAudioFile('cover.jpg')).toBe(false)
    expect(isAudioFile('mp3')).toBe(false)
  })

  it('picks the folder image by name', () => {
    expect(pickFolderImage(['front.png', 'Folder.JPG', 'x.jpg'])).toBe('Folder.JPG')
    expect(pickFolderImage(['back.jpg', 'cover.gif'])).toBeUndefined()
    expect(pickFolderImage(['cover.webp'])).toBe('cover.webp')
    expect(pickFolderImage(['album.jpeg', 'cover.jpg'])).toBe('cover.jpg')
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
