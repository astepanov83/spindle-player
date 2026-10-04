// spindle:// serves covers and audio to the sandboxed page. The core serves
// the cover cache:
//   spindle://cover/small/<hash>, spindle://cover/large/<hash>
//   spindle://cover/mosaic/<hash>-<hash>-<hash>-<hash>: 4 small covers in one picture
// Each plugin adds the hosts it serves (see plugins/types.ts, Route):
//   spindle://media/<file id>: a music file (plugins/files/protocol.ts)
//   spindle://radio/<station id>?stream=<n> (see plugins/radio/stream.ts)
//   spindle://radio-logo/<station id>: a search result's logo (plugins/radio/result-logos.ts)
//   spindle://mfp/<episode id>: an episode's mp3 (plugins/mfp/media.ts)
import { readFile } from 'fs/promises'
import { protocol } from 'electron'
import { isCoverHash } from './covers/cover-names'
import type { Covers } from './covers/covers'
import type { Route } from './plugins/types'

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

export const common = { 'Access-Control-Allow-Origin': '*' }

// The file is gone, can't be read, or isn't in the index. The page tells
// this apart from a format it can't play (decision 105).
export function notFound(): Response {
  return new Response('Not found', { status: 404, headers: common })
}

async function cover(covers: Covers, size: string, hash: string): Promise<Response> {
  if (size === 'mosaic') {
    const hashes = hash.split('-')
    if (hashes.length !== 4 || !hashes.every(isCoverHash)) return notFound()
    return served(await covers.cache.mosaic(hashes))
  }
  if (!isCoverHash(hash)) return notFound()
  let path: string | undefined
  if (size === 'small') path = covers.cache.smallPath(hash)
  else if (size === 'large') path = await covers.cache.large(hash, () => covers.source(hash))
  return served(path)
}

// A cached JPEG, or 404 when there is none.
async function served(path: string | undefined): Promise<Response> {
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

// The cover cache's host, served whatever plugins are on.
export function coverRoute(covers: Covers): Route {
  return (_req, _url, parts) =>
    parts.length === 2 ? cover(covers, parts[0], parts[1]) : notFound()
}

// One handler for the scheme; `routes` is read at each request, so plugins can add to it later.
export function handleProtocol(routes: Map<string, Route>): void {
  protocol.handle(scheme, async (req) => {
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const route = routes.get(url.hostname)
    return route ? route(req, url, parts) : notFound()
  })
}
