import { describe, expect, it } from 'vitest'
import { IcySplitter, parseStreamTitle, readIcyHead } from './icy'

const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

// One metadata block as a server sends it: a length byte (times 16), then the
// text padded with zeros.
function block(text: Uint8Array | string): Uint8Array {
  const bytes = typeof text === 'string' ? utf8(text) : text
  const size = Math.ceil(bytes.length / 16) * 16
  const out = new Uint8Array(1 + size)
  out[0] = size / 16
  out.set(bytes, 1)
  return out
}

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function audio(n: number, from = 0): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (from + i) % 251)
}

// Feeds the bytes in pieces of `size` and joins what comes out.
function run(
  s: IcySplitter,
  bytes: Uint8Array,
  size: number
): { audio: Uint8Array; titles: string[] } {
  const out: Uint8Array[] = []
  const titles: string[] = []
  for (let i = 0; i < bytes.length; i += size) {
    const r = s.push(bytes.subarray(i, i + size))
    out.push(r.audio)
    titles.push(...r.titles)
  }
  return { audio: join(...out), titles }
}

describe('IcySplitter', () => {
  const stream = join(
    audio(8),
    block("StreamTitle='Iron Maiden - Powerslave';"),
    audio(8, 8),
    block("StreamTitle='Dio - Holy Diver';StreamUrl='';"),
    audio(5, 16)
  )

  it('takes the blocks out and gives each title', () => {
    const r = run(new IcySplitter(8), stream, stream.length)
    expect(r.audio).toEqual(audio(21))
    expect(r.titles).toEqual(['Iron Maiden - Powerslave', 'Dio - Holy Diver'])
  })

  it('reads blocks split across chunk edges, at every place', () => {
    for (const size of [1, 2, 3, 7, 9, 16, 33]) {
      const r = run(new IcySplitter(8), stream, size)
      expect(r.audio, `chunks of ${size}`).toEqual(audio(21))
      expect(r.titles, `chunks of ${size}`).toEqual([
        'Iron Maiden - Powerslave',
        'Dio - Holy Diver'
      ])
    }
  })

  it('skips a block of length 0', () => {
    const bytes = join(audio(4), new Uint8Array([0]), audio(4, 4), new Uint8Array([0]), audio(2, 8))
    const r = run(new IcySplitter(4), bytes, 3)
    expect(r.audio).toEqual(audio(10))
    expect(r.titles).toEqual([])
  })

  it('passes the audio as it is when there is no icy-metaint', () => {
    const bytes = join(audio(10), block("StreamTitle='not metadata';"))
    const r = run(new IcySplitter(undefined), bytes, 4)
    expect(r.audio).toEqual(bytes)
    expect(r.titles).toEqual([])
  })

  it('gives no title for an empty StreamTitle', () => {
    const r = run(new IcySplitter(2), join(audio(2), block("StreamTitle='';")), 5)
    expect(r.titles).toEqual([])
  })
})

describe('parseStreamTitle', () => {
  it('keeps quotes inside a title', () => {
    expect(parseStreamTitle(utf8("StreamTitle='Guns N' Roses - Don't Cry';StreamUrl='x';"))).toBe(
      "Guns N' Roses - Don't Cry"
    )
    expect(parseStreamTitle(utf8("StreamTitle='It's';"))).toBe("It's")
    expect(parseStreamTitle(utf8("StreamTitle='a ';' b';"))).toBe("a ';' b")
  })

  it('reads UTF-8', () => {
    expect(parseStreamTitle(utf8("StreamTitle='Mötley Crüe - Кино';"))).toBe('Mötley Crüe - Кино')
  })

  it('reads Latin-1 when the bytes are not UTF-8', () => {
    expect(parseStreamTitle(latin1("StreamTitle='Motörhead - Überall';"))).toBe(
      'Motörhead - Überall'
    )
  })

  it('ignores the zeros that pad a block', () => {
    expect(parseStreamTitle(join(utf8("StreamTitle='A - B';"), new Uint8Array(9)))).toBe('A - B')
  })

  it('gives undefined when there is no StreamTitle', () => {
    expect(parseStreamTitle(utf8("StreamUrl='http://x/';"))).toBeUndefined()
  })
})

describe('readIcyHead', () => {
  const head =
    'ICY 200 OK\r\nicy-notice1:<BR>This stream requires Winamp<BR>\r\n' +
    'content-type:audio/mpeg\r\nicy-pub:1\r\nicy-metaint:8192\r\nicy-br:128\r\n\r\n'

  it('reads the header lines a Shoutcast v1 server puts before the audio', () => {
    const r = readIcyHead(join(latin1(head), audio(5)))
    expect(r).toEqual({
      status: 200,
      headers: {
        'icy-notice1': '<BR>This stream requires Winamp<BR>',
        'content-type': 'audio/mpeg',
        'icy-pub': '1',
        'icy-metaint': '8192',
        'icy-br': '128'
      },
      rest: audio(5)
    })
  })

  it('asks for more until the blank line comes', () => {
    expect(readIcyHead(latin1(head.slice(0, 40)))).toBe('more')
    expect(readIcyHead(latin1('IC'))).toBe('more')
  })

  it('gives undefined for bytes that are not an ICY answer', () => {
    expect(readIcyHead(audio(20))).toBeUndefined()
    expect(readIcyHead(latin1('HTTP/1.0 200 OK\r\n\r\n'))).toBeUndefined()
  })

  it('reads the status of a refusal', () => {
    const r = readIcyHead(latin1('ICY 401 Service Unavailable\r\n\r\n'))
    expect(r).toMatchObject({ status: 401 })
  })
})
