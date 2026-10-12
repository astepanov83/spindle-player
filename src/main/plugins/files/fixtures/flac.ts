// A FLAC for tests: a STREAMINFO block (44.1 kHz, 2 channels, 16 bits, 10 s)
// and Vorbis comments ("TITLE=Song"), with no audio frames.
export function flacWith(comments: string[]): Uint8Array {
  const info = new Uint8Array(34)
  const v = new DataView(info.buffer)
  v.setUint16(0, 4096)
  v.setUint16(2, 4096)
  v.setBigUint64(10, (44100n << 44n) | (1n << 41n) | (15n << 36n) | 441000n)
  const enc = new TextEncoder()
  const u32 = (n: number): Uint8Array => {
    const b = new Uint8Array(4)
    new DataView(b.buffer).setUint32(0, n, true)
    return b
  }
  const vendor = enc.encode('test')
  const parts: Uint8Array[] = [u32(vendor.length), vendor, u32(comments.length)]
  for (const c of comments) {
    const b = enc.encode(c)
    parts.push(u32(b.length), b)
  }
  const body = Buffer.concat(parts)
  const head = (last: boolean, type: number, len: number): Uint8Array =>
    Uint8Array.from([(last ? 0x80 : 0) | type, len >> 16, (len >> 8) & 0xff, len & 0xff])
  return Buffer.concat([
    Buffer.from('fLaC'),
    head(false, 0, 34),
    info,
    head(true, 4, body.length),
    body
  ])
}
