// spindle://media/<file id>: the music files plugin's audio, by id. Only
// files the index knows are served; the page can't name a path.
// spindle://media/<file id>?decode asks for the file as WAV decoded by ffmpeg
// (see decode.ts); files Chromium can't play are always served that way.
import { Readable } from 'stream'
import { extOf, needsDecoding } from './tags'
import { dataSize, DecodeStream, ffmpegArgs, IdleError, startFfmpeg, wavHeader } from './decode'
import { DecodePlans } from './decode-plan'
import { openMedia } from './media-file'
import { probeLength, probeTags } from './probe'
import { audioType, parseRange, type RangeResult } from './range'
import { common, notFound } from '../../protocol'
import type { Route } from '../types'
import type { LibraryService } from './service'
import type { MediaInfo } from './types'

// The file is there, but ffmpeg can't read its format (or there is no ffmpeg).
function cantDecode(): Response {
  return new Response('Unsupported format', { status: 415, headers: common })
}

// A 200 or 206 answer for the range of a file of `size` bytes. No body for HEAD.
function ranged(
  range: RangeResult,
  size: number,
  type: string,
  body: ((start: number, end: number) => Readable) | undefined
): Response {
  const headers: Record<string, string> = {
    ...common,
    'Content-Type': type,
    'Accept-Ranges': 'bytes'
  }
  if (range.kind === 'bad')
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${size}` }
    })
  const { start, end } = range.kind === 'part' ? range : { start: 0, end: size - 1 }
  headers['Content-Length'] = String(size === 0 ? 0 : end - start + 1)
  const stream = size === 0 || !body ? null : (Readable.toWeb(body(start, end)) as ReadableStream)
  if (range.kind === 'part') {
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    return new Response(stream, { status: 206, headers })
  }
  return new Response(stream, { status: 200, headers })
}

const plans = new DecodePlans()

async function decoded(
  lib: LibraryService,
  m: MediaInfo,
  req: Request,
  o: { head: boolean; forced: boolean; version: string }
): Promise<Response> {
  const ffmpeg = lib.ffmpeg
  const ffprobe = lib.ffprobe
  const probe = ffprobe
    ? { tags: (p: string) => probeTags(ffprobe, p), length: (p: string) => probeLength(ffprobe, p) }
    : undefined
  let plan
  try {
    plan = ffmpeg ? await plans.get(m, o.version, o.forced, probe) : undefined
  } catch (e) {
    console.error(`Could not read the format of ${m.path}: ${e}`)
  }
  if (!ffmpeg || !plan) {
    if (ffmpeg) console.error(`No sample rate or length for ${m.path}; answered 415`)
    return cantDecode()
  }
  const { format, duration } = plan
  const data = dataSize(format, duration)
  const header = wavHeader(format, data)
  const size = header.length + data
  const range = parseRange(req.headers.get('Range'), size)
  return ranged(
    range,
    size,
    'audio/wav',
    o.head
      ? undefined
      : (start, end) =>
          new DecodeStream(header, format, start, end, (seconds) =>
            startFfmpeg(ffmpeg, ffmpegArgs(m.path, seconds, format))
          ).on('error', (e) => {
            // a paused song, or Chromium dropping the request (a seek, a new song): both normal
            if (e instanceof IdleError || e.name === 'AbortError') return
            console.error(`Could not decode ${m.path}: ${e.message}`)
          })
  )
}

async function media(
  lib: LibraryService,
  id: string,
  req: Request,
  decode: boolean
): Promise<Response> {
  const m = await lib.mediaInfo(id)
  if (!m) {
    console.error(`spindle://media/${id}: not in the library index; answered 404`)
    return notFound()
  }
  const file = await openMedia(m.path)
  if (!file) return notFound()
  lib.mediaOpened(file.dev)
  const ext = extOf(m.path)
  const head = req.method === 'HEAD'
  try {
    if (decode || needsDecoding(ext, m.codec)) {
      // ffmpeg opens the file itself
      file.close()
      return await decoded(lib, m, req, { head, forced: decode, version: file.version })
    }
    return ranged(
      parseRange(req.headers.get('Range'), file.size),
      file.size,
      audioType(ext),
      head ? undefined : file.stream
    )
  } finally {
    // HEAD, an empty file or a bad range: no stream took the file over
    file.close()
  }
}

// The hosts the library serves.
export function libraryRoutes(lib: LibraryService): Record<string, Route> {
  return {
    media: (req, url, parts) =>
      parts.length === 1 ? media(lib, parts[0], req, url.searchParams.has('decode')) : notFound()
  }
}
