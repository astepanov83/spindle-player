// Library types. Ticket 006 fills them from a real scan.

export interface Track {
  id: string
  title: string
  // seconds
  duration: number
  albumId: string
  artist: string
  album: string
  // track number, 1-based
  no: number
}

export interface Album {
  id: string
  title: string
  artist: string
  year: number
  // [--c1, --c2, --c3]: main, accent, dark
  palette: [string, string, string]
  // image URL
  cover: string
  trackIds: string[]
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
}
