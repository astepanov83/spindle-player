import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parsePls } from './pls'

const metalOnly = readFileSync(join(__dirname, 'fixtures/metal-only.pls'), 'utf8')

describe('parsePls', () => {
  it('reads every File and Title pair in order', () => {
    const entries = parsePls(metalOnly)
    expect(entries).toHaveLength(3)
    expect(entries[0].url).toBe('http://metal-only.sp.radio.fm/stream')
    expect(entries[2].url).toBe('http://91.99.128.21/stream')
  })

  it('orders by the number, not the line', () => {
    const text = 'File2=http://b/\nTitle2=B\nFile1=http://a/\n'
    expect(parsePls(text)).toEqual([
      { url: 'http://a/', title: '' },
      { url: 'http://b/', title: 'B' }
    ])
  })

  it('reads Windows line endings and any key case', () => {
    expect(parsePls('[playlist]\r\nfile1=http://a/\r\ntitle1=A\r\n')).toEqual([
      { url: 'http://a/', title: 'A' }
    ])
  })

  it('skips empty entries and gives none for other text', () => {
    expect(parsePls('File1=\nFile2=http://b/\n').map((e) => e.url)).toEqual(['http://b/'])
    expect(parsePls('<html>not a playlist</html>')).toEqual([])
    expect(parsePls('')).toEqual([])
  })
})
