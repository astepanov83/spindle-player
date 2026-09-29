import { describe, expect, it } from 'vitest'
import { parseTitle, songQuery } from './radio-title'

describe('songQuery: what a song cover is looked up by (ticket 032)', () => {
  it('takes the artist and the song of an "Artist - Song" title', () => {
    expect(songQuery('Iron Maiden - The Trooper')).toEqual({
      artist: 'Iron Maiden',
      song: 'The Trooper'
    })
  })

  it('looks nothing up for a title with no " - " (jingles, ads, shows)', () => {
    expect(songQuery('Station Jingle')).toBeUndefined()
    expect(songQuery('')).toBeUndefined()
    expect(songQuery('Metal-Only')).toBeUndefined()
    // a dash at the start leaves no artist
    expect(songQuery(' - Song')).toBeUndefined()
    expect(songQuery('Artist - ')).toBeUndefined()
  })

  it('leaves Metal Only’s DJ and show parts out of the names sent', () => {
    expect(
      songQuery('M-16 (USA) - Shot Down * Blacky OnAir * 60er Bis 95er Beat, Rock * ')
    ).toEqual({ artist: 'M-16 (USA)', song: 'Shot Down' })
  })

  it('looks nothing up for a title that is only the DJ and the show', () => {
    // parseTitle takes the first part for the track
    expect(parseTitle('* Blacky OnAir * Metal Mittwoch *').track).toBe('Blacky OnAir')
    expect(songQuery('* Blacky OnAir * Metal Mittwoch *')).toBeUndefined()
    expect(songQuery('Blacky OnAir - Metal Mittwoch')).toBeUndefined()
    expect(songQuery('Metal Only - Blacky OnAir')).toBeUndefined()
  })

  it('looks nothing up when the "artist" is the station itself', () => {
    expect(songQuery('Metal Only - Jingle', 'Metal Only')).toBeUndefined()
    expect(songQuery('METAL-ONLY - Werbung', 'Metal Only')).toBeUndefined()
    expect(songQuery('Metallica - One', 'Metal Only')).toEqual({ artist: 'Metallica', song: 'One' })
  })

  it('decodes html entities first', () => {
    expect(songQuery('Simon &amp; Garfunkel - The Boxer')).toEqual({
      artist: 'Simon & Garfunkel',
      song: 'The Boxer'
    })
  })
})
