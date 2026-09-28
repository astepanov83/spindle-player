// spindle:// serves covers and audio to the sandboxed page:
//   spindle://cover/small/<hash>, spindle://cover/large/<hash>, spindle://media/<file id>
// Only files the index knows are served. The page can't name a path.
// spindle://media/<file id>?decode asks for the file as WAV decoded by ffmpeg
// (see decode.ts); files Chromium can't play are always served that way.
import { createReadStream } from 'fs'
import { readFile, stat } from 'fs/promises'
import { Readable } from 'stream'
import { protocol } from 'electron'
import { extOf, needsDecoding } from './tags'
import { isCoverHash } from './cover-cache'
import { dataSize, DecodeStream, ffmpegArgs, startFfmpeg, wavHeader } from './decode'
import { DecodePlans } from './decode-plan'
import { probeLength, probeTags } from './probe'
import { audioType, parseRange, type RangeResult } from './range'
import type { LibraryService } from './service'
import type { MediaInfo } from './types'

export const scheme = 'spindle'

// Must run before the app is ready.
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme,
      // corsEnabled plus the header below keep the audio readable by Web Audio (007, 008)
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

const common = { 'Access-Control-Allow-Origin': '*' }

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: common })
}

async function cover(lib: LibraryService, size: string, hash: string): Promise<Response> {
  if (!isCoverHash(hash)) return notFound()
  let path: string | undefined
  if (size === 'small') path = lib.covers.smallPath(hash)
  else if (size === 'large') path = await lib.covers.large(hash, () => lib.coverSource(hash))
  if (!path) return notFound()
  try {
    return new Response(new Uint8Array(await readFile(path)), {
      headers: {
        ...common,
        'Content-Type': 'image/jpeg',
        // named by the picture's hash, so it never changes
        'Cache-Control': 'max-age=31536000, immutable'
      }
    })
  } catch {
    return notFound()
  }
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
  if (!ffmpeg || !plan) return notFound()
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
          )
  )
}

async function media(
  lib: LibraryService,
  id: string,
  req: Request,
  decode: boolean
): Promise<Response> {
  const m = await lib.mediaInfo(id)
  if (!m) return notFound()
  let size: number
  let version: string
  try {
    const s = await stat(m.path)
    size = s.size
    version = `${s.mtimeMs}:${s.size}`
    lib.mediaOpened(s.dev)
  } catch {
    return notFound()
  }
  const ext = extOf(m.path)
  const head = req.method === 'HEAD'
  if (decode || needsDecoding(ext, m.codec))
    return decoded(lib, m, req, { head, forced: decode, version })
  return ranged(
    parseRange(req.headers.get('Range'), size),
    size,
    audioType(ext),
    head ? undefined : (start, end) => createReadStream(m.path, { start, end })
  )
}

export function handleProtocol(lib: LibraryService): void {
  protocol.handle(scheme, async (req) => {
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.hostname === 'cover' && parts.length === 2) return cover(lib, parts[0], parts[1])
    if (url.hostname === 'media' && parts.length === 1)
      return media(lib, parts[0], req, url.searchParams.has('decode'))
    return notFound()
  })
}
