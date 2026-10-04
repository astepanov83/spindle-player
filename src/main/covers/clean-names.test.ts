import { describe, expect, it } from 'vitest'
import { cleanAlbum, cleanArtist, cleanSong } from './clean-names'

describe('cleanup', () => {
  it('drops edition words in brackets and disc numbers', () => {
    expect(cleanAlbum('Abbey Road (Remastered 2009) [Deluxe Edition]')).toBe('abbey road')
    expect(cleanAlbum('Abbey Road - Remastered 2009')).toBe('abbey road')
    expect(cleanAlbum('Mellon Collie CD1')).toBe('mellon collie')
    expect(cleanAlbum('Mellon Collie (Disc 2)')).toBe('mellon collie')
    expect(cleanAlbum('Abbey Road (2019 Mix)')).toBe('abbey road')
    expect(cleanAlbum('Club Classics (Remix Album)')).toBe('club classics remix album')
  })

  it('keeps brackets that are part of the name', () => {
    expect(cleanAlbum("(What's the Story) Morning Glory?")).toBe('what s the story morning glory')
    expect(cleanAlbum('Pompeii (Live)')).toBe('pompeii live')
  })

  it('treats & as and, drops accents and a leading "the"', () => {
    expect(cleanArtist('The Beatles')).toBe('beatles')
    expect(cleanArtist('Simon & Garfunkel')).toBe(cleanArtist('Simon and Garfunkel'))
    expect(cleanArtist('Björk')).toBe('bjork')
  })

  it('keeps vowel signs and voicing marks, which change the word', () => {
    expect(cleanAlbum('हम आपके हैं कौन')).not.toBe(cleanAlbum('हम आपक ह कन'))
    expect(cleanAlbum('ドラゴンボール')).not.toBe(cleanAlbum('トラコンホール'))
    // accents on Latin, Greek and Cyrillic letters still go
    expect(cleanArtist('Sigur Rós')).toBe('sigur ros')
    expect(cleanAlbum('Мой рок-н-ролл')).toBe(cleanAlbum('Мои рок-н-ролл'))
  })

  it('keeps letters of other scripts', () => {
    expect(cleanAlbum('Группа крови')).toBe('группа крови')
    expect(cleanArtist('椎名林檎')).toBe('椎名林檎')
  })
})

describe('cleanSong', () => {
  it('drops edition, edit and feat brackets', () => {
    expect(cleanSong('The Trooper (1998 Remaster)')).toBe('the trooper')
    expect(cleanSong('One (Radio Edit)')).toBe('one')
    expect(cleanSong('Numb [feat. Someone]')).toBe('numb')
    expect(cleanSong('The Trooper (Live 2003)')).toBe('the trooper live')
    expect(cleanSong('The Trooper (Live at Donington; 1998 Remaster)')).toBe('the trooper live')
  })

  it('keeps "live" from a " - " suffix too', () => {
    expect(cleanSong('The Trooper - Live at Long Beach Arena; 1998 Remaster')).toBe(
      'the trooper live'
    )
    expect(cleanSong('The Trooper - Live Version')).toBe('the trooper live')
    expect(cleanSong('The Trooper - 2015 Remaster')).toBe('the trooper')
  })
})
