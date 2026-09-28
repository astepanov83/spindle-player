// spindle:// serves covers and audio to the sandboxed page:
//   spindle://cover/small/<hash>, spindle://cover/large/<hash>, spindle://media/<track id>
// Only files the index knows are served. The page can't name a path.
import { createReadStream } from 'fs'
import { readFile, stat } from 'fs/promises'
import { Readable } from 'stream'
import { protocol } from 'electron'
import { extOf } from './tags'
import { isCoverHash } from './cover-cache'
import { audioType, parseRange } from './range'
import type { LibraryService } from './service'

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

async function media(lib: LibraryService, id: string, req: Request): Promise<Response> {
  const path = await lib.trackPath(id)
  if (!path) return notFound()
  let size: number
  try {
    const s = await stat(path)
    size = s.size
    lib.mediaOpened(s.dev)
  } catch {
    return notFound()
  }
  const headers: Record<string, string> = {
    ...common,
    'Content-Type': audioType(extOf(path)),
    'Accept-Ranges': 'bytes'
  }
  const range = parseRange(req.headers.get('Range'), size)
  if (range.kind === 'bad')
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${size}` }
    })
  const { start, end } = range.kind === 'part' ? range : { start: 0, end: size - 1 }
  const body =
    req.method === 'HEAD' || size === 0
      ? null
      : (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream)
  headers['Content-Length'] = String(size === 0 ? 0 : end - start + 1)
  if (range.kind === 'part') {
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    return new Response(body, { status: 206, headers })
  }
  return new Response(body, { status: 200, headers })
}

export function handleProtocol(lib: LibraryService): void {
  protocol.handle(scheme, async (req) => {
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.hostname === 'cover' && parts.length === 2) return cover(lib, parts[0], parts[1])
    if (url.hostname === 'media' && parts.length === 1) return media(lib, parts[0], req)
    return notFound()
  })
}
