// Reads the ICY song titles out of a radio stream. With `icy-metaint: N`, the
// server puts a metadata block after every N bytes of audio: one length byte
// (times 16), then text like `StreamTitle='Artist - Song';` padded with zeros.
// A block can be split across chunks, so the splitter keeps its place between them.

export class IcySplitter {
  // audio bytes left before the next block
  #left: number
  // the block being read, and how much of it has come
  #block: Uint8Array | undefined
  #got = 0
  #waitingForLength = false

  // no metaint: the stream has no blocks, and every byte is audio
  constructor(readonly metaint: number | undefined) {
    this.#left = metaint && metaint > 0 ? metaint : Infinity
  }

  push(chunk: Uint8Array): { audio: Uint8Array; titles: string[] } {
    if (this.#left === Infinity) return { audio: chunk, titles: [] }
    const audio: Uint8Array[] = []
    const titles: string[] = []
    let i = 0
    while (i < chunk.length) {
      if (this.#block) {
        const n = Math.min(this.#block.length - this.#got, chunk.length - i)
        this.#block.set(chunk.subarray(i, i + n), this.#got)
        this.#got += n
        i += n
        if (this.#got === this.#block.length) {
          const title = parseStreamTitle(this.#block)
          if (title) titles.push(title)
          this.#block = undefined
          this.#left = this.metaint!
        }
      } else if (this.#waitingForLength) {
        const size = chunk[i++] * 16
        this.#waitingForLength = false
        if (size > 0) {
          this.#block = new Uint8Array(size)
          this.#got = 0
        } else this.#left = this.metaint!
      } else {
        const n = Math.min(this.#left, chunk.length - i)
        audio.push(chunk.subarray(i, i + n))
        this.#left -= n
        i += n
        if (this.#left === 0) this.#waitingForLength = true
      }
    }
    return { audio: audio.length === 1 ? audio[0] : concat(audio), titles }
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

// UTF-8 when the bytes are valid UTF-8; older servers send Latin-1.
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('latin1').decode(bytes)
  }
}

// The title ends at the `';` that comes before the next key or the end, so
// quotes inside a title ("Don't Cry") stay in it. Undefined when there is none.
export function parseStreamTitle(block: Uint8Array): string | undefined {
  let end = block.length
  while (end > 0 && block[end - 1] === 0) end--
  const text = decode(block.subarray(0, end))
  const m = /StreamTitle='(.*?)';(?=\s*(?:[A-Za-z]\w*=|$))/s.exec(text)
  return m ? m[1].trim() : undefined
}

export interface IcyHead {
  status: number
  // lowercased names
  headers: Record<string, string>
  // the audio that came after the head
  rest: Uint8Array
}

const icy = [0x49, 0x43, 0x59, 0x20] // 'ICY '

// A Shoutcast v1 server answers `ICY 200 OK`, which Chromium reads as HTTP/0.9:
// no headers, and the header lines come as the start of the body (decision 153).
// 'more': the bytes so far start like that but the blank line has not come yet.
// Undefined: the body is not an ICY answer.
export function readIcyHead(bytes: Uint8Array): IcyHead | 'more' | undefined {
  for (let i = 0; i < icy.length; i++) {
    if (i >= bytes.length) return 'more'
    if (bytes[i] !== icy[i]) return undefined
  }
  // latin1 keeps one character per byte, so a place in the text is a place in the bytes
  const text = new TextDecoder('latin1').decode(bytes)
  const m = /\r?\n\r?\n/.exec(text)
  if (!m) return 'more'
  const end = m.index
  const lines = text.slice(0, end).split(/\r?\n/)
  const status = parseInt(lines[0].split(' ')[1] ?? '', 10)
  const headers: Record<string, string> = {}
  for (const line of lines.slice(1)) {
    const at = line.indexOf(':')
    if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
  }
  return { status, headers, rest: bytes.subarray(end + m[0].length) }
}
