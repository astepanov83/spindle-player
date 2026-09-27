// Made-up albums from the prototype. Ticket 006 replaces this with a real scan.
import type { Album, Playlist, Track } from '../../../shared/library'
import { makeCover, type CoverStyle } from './fake-covers'

interface RawAlbum {
  t: string
  a: string
  y: number
  p: [string, string, string]
  s: CoverStyle
  tr: [string, number][]
}

// prettier-ignore
const RAW: RawAlbum[] = [
  { t: 'Low Tide Radio', a: 'Marisol Vey', y: 2023, p: ['#1f8a8a', '#e3b66b', '#0d3b4a'], s: 'sun',
    tr: [['Harbour Lights', 214], ['Low Tide Radio', 251], ['Salt in the Wires', 198], ['Pier 9', 232], ['Swimmers', 187], ['Last Ferry Home', 276]] },
  { t: 'Night Bus', a: 'The Quiet Hours', y: 2021, p: ['#3b2f8f', '#e0457b', '#101a3a'], s: 'stripes',
    tr: [['Route 38', 203], ['Fogged Glass', 241], ['Sodium Lamps', 229], ['Terminus', 264], ['Seat by the Window', 195]] },
  { t: 'Paper Suns', a: 'Oda Linde', y: 2024, p: ['#f2a541', '#c8553d', '#2d3047'], s: 'orbs',
    tr: [['Origami', 182], ['Paper Suns', 238], ['Kite String', 201], ['Folded Light', 255], ['August Again', 217], ['Crease', 190], ['Unfold', 268]] },
  { t: 'Glasshouse', a: 'Kinetic Ferns', y: 2022, p: ['#3e8e41', '#b5e48c', '#16302b'], s: 'grid',
    tr: [['Condensation', 244], ['Glasshouse', 209], ['Monstera', 231], ['Grow Lamp', 197], ['Humid', 286]] },
  { t: 'Salt & Static', a: 'Juno Park', y: 2020, p: ['#d64545', '#f5e1a4', '#2a1b1b'], s: 'waves',
    tr: [['Static', 176], ['White Noise Lullaby', 248], ['Brine', 213], ['Antenna', 226], ['Salt', 239], ['Signal Lost', 301]] },
  { t: 'Northbound', a: 'Elk & Ember', y: 2019, p: ['#577590', '#f3722c', '#1b263b'], s: 'sun',
    tr: [['Northbound', 262], ['Pines', 219], ['Ember Light', 247], ['Snowline', 233], ['Cabin Radio', 205]] },
  { t: 'Soft Machinery', a: 'Ravi Tan', y: 2024, p: ['#8d99ae', '#ef233c', '#2b2d42'], s: 'grid',
    tr: [['Servo', 188], ['Soft Machinery', 256], ['Hydraulics', 222], ['Idle Loop', 240], ['Cooling Fan', 199], ['Reboot', 274]] },
  { t: 'Afterimage', a: 'Lumen Club', y: 2023, p: ['#9b5de5', '#00bbf9', '#1a1033'], s: 'orbs',
    tr: [['Afterimage', 234], ['Strobe Memory', 207], ['Neon Sleep', 259], ['Retina', 215], ['Dim the Room', 281]] },
  { t: 'Cardamom', a: 'Nadia Serrat', y: 2021, p: ['#bc6c25', '#dda15e', '#283618'], s: 'waves',
    tr: [['Cardamom', 228], ['Copper Pot', 196], ['Rooftop Tea', 243], ['Spice Market', 211], ['Slow Boil', 267]] },
  { t: 'Weather Report Vol. 2', a: 'Hollow Coast', y: 2022, p: ['#48cae4', '#caf0f8', '#03045e'], s: 'stripes',
    tr: [['Pressure Front', 237], ['Light Drizzle', 204], ['Isobars', 249], ['Clearing Later', 226], ['High Tide Warning', 258], ['Forecast', 193]] },
  { t: 'Minor Planets', a: 'Sato Ensemble', y: 2020, p: ['#ffb703', '#fb8500', '#023047'], s: 'orbs',
    tr: [['Ceres', 272], ['Vesta', 231], ['Pallas', 248], ['Hygiea', 219], ['Kuiper', 305]] },
  { t: 'Home Tapes', a: 'Wren', y: 2025, p: ['#e76f51', '#f4a261', '#264653'], s: 'stripes',
    tr: [['Side A', 184], ['Kitchen Demo', 206], ['Hiss', 178], ['Porch Song', 233], ['Side B', 241], ['Rewind', 197]] }
]

// [album index, track index] pairs, as in the prototype
// prettier-ignore
const RAW_PLAYLISTS: { n: string; items: [number, number][] }[] = [
  { n: 'Late Night', items: [[1, 0], [1, 2], [7, 2], [4, 1], [5, 3], [2, 3], [7, 4]] },
  { n: 'Focus Mix', items: [[10, 0], [3, 4], [8, 2], [0, 1], [6, 3], [10, 2], [11, 3]] },
  { n: 'Road Trip', items: [[5, 0], [9, 0], [0, 5], [2, 1], [11, 0], [6, 1]] }
]

export interface FakeLibrary {
  albums: Album[]
  tracks: Track[]
  playlists: Playlist[]
}

const albumId = (a: number): string => 'al' + a
const trackId = (a: number, t: number): string => `al${a}/${t}`

// `copies` repeats the albums, to try the virtual lists with a big library.
export function makeFakeLibrary(copies = 1): FakeLibrary {
  const albums: Album[] = []
  const tracks: Track[] = []
  for (let c = 0; c < copies; c++) {
    RAW.forEach((r, i) => {
      const a = c * RAW.length + i
      const title = c ? `${r.t} ${c + 1}` : r.t
      const ids = r.tr.map(([name, duration], t) => {
        const id = trackId(a, t)
        tracks.push({
          id,
          title: name,
          duration,
          albumId: albumId(a),
          artist: r.a,
          album: title,
          no: t + 1
        })
        return id
      })
      albums.push({
        id: albumId(a),
        title,
        artist: r.a,
        year: r.y,
        palette: r.p,
        cover: makeCover(r.p, r.s, i),
        trackIds: ids
      })
    })
  }
  const playlists = RAW_PLAYLISTS.map((p, i) => ({
    id: 'pl' + i,
    name: p.n,
    trackIds: p.items.map(([a, t]) => trackId(a, t))
  }))
  return { albums, tracks, playlists }
}
