// HTTP Range for the media protocol, so <audio> can seek.

export type RangeResult =
  // no Range header, or one we don't handle (several ranges): send the whole file
  { kind: 'all' } | { kind: 'part'; start: number; end: number } | { kind: 'bad' }

// Handles "bytes=a-b", "bytes=a-" and "bytes=-n". `end` is inclusive.
export function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { kind: 'all' }
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header)
  if (!m) return { kind: 'all' }
  const [, a, b] = m
  if (!a && !b) return { kind: 'bad' }
  let start: number
  let end: number
  if (!a) {
    // the last n bytes
    const n = Number(b)
    if (n === 0) return { kind: 'bad' }
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(a)
    end = b ? Math.min(Number(b), size - 1) : size - 1
  }
  if (start >= size || start > end) return { kind: 'bad' }
  return { kind: 'part', start, end }
}

const types: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  webm: 'audio/webm',
  // Chromium can't play these; the type only helps the error message
  wma: 'audio/x-ms-wma',
  ape: 'audio/ape',
  wv: 'audio/wavpack',
  aif: 'audio/aiff',
  aiff: 'audio/aiff'
}

export function audioType(ext: string): string {
  return types[ext] ?? 'application/octet-stream'
}
