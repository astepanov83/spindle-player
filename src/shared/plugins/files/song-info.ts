// What main tells the song info panel about a song's file (ticket 127). Read
// when the panel opens, never by the scan (decision 229).
import type { ReplayGain } from '../../library'

export interface SongFileInfo {
  // the file the song is in: its own, or a CUE track's disc image
  path: string
  // a CUE track: the sheet, and where the track lies in the image (seconds;
  // no end: to the end of the file)
  cue?: { sheet: string; start: number; end?: number; sheetGone?: true }
  // from the index: when the scan first found the file (ms), and the year and
  // genre the library has (a CUE track's come from its sheet)
  added?: number
  year?: number
  genre?: string
  // read now
  size?: number
  modified?: number
  format?: AudioFormat
  // a CUE track's are its sheet's, else the file's; the index's when the
  // file can't be read
  gain?: ReplayGain
  // every tag in the file, in the order read
  tags?: InfoTag[]
  // more tags than are listed
  moreTags?: number
  // read by ffprobe: music-metadata could not read the file
  probed?: true
  // the file is not there
  gone?: true
  // why the file could not be read, in plain words
  error?: string
}

export interface AudioFormat {
  container?: string
  codec?: string
  // "V0", "CBR"; the encoder ("LAME3.100")
  profile?: string
  tool?: string
  lossless?: boolean
  sampleRate?: number
  bits?: number
  channels?: number
  // bits per second, from the header, or else from the size and the length
  bitrate?: number
  bitrateFrom?: 'header' | 'size'
  // seconds
  duration?: number
}

// One tag as the file has it. `type` is the kind of tag ("ID3v2.3",
// "vorbis", "APEv2", "iTunes"), `id` its name there.
export interface InfoTag {
  type: string
  id: string
  value: string
  // the value was longer than this; the rest is not sent
  cut?: true
  // a picture: listed, never sent
  picture?: InfoPicture
}

export interface InfoPicture {
  // "Cover (front)"
  kind?: string
  // "image/jpeg"
  format?: string
  bytes: number
  width?: number
  height?: number
}
