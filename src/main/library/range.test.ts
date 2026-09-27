import { describe, expect, it } from 'vitest'
import { audioType, parseRange } from './range'

describe('parseRange', () => {
  it('sends the whole file with no header or one it does not handle', () => {
    expect(parseRange(null, 100)).toEqual({ kind: 'all' })
    expect(parseRange('bytes=0-1,5-6', 100)).toEqual({ kind: 'all' })
    expect(parseRange('items=0-1', 100)).toEqual({ kind: 'all' })
  })

  it('reads start and end', () => {
    expect(parseRange('bytes=10-19', 100)).toEqual({ kind: 'part', start: 10, end: 19 })
    expect(parseRange('bytes=10-', 100)).toEqual({ kind: 'part', start: 10, end: 99 })
    expect(parseRange('bytes=0-', 100)).toEqual({ kind: 'part', start: 0, end: 99 })
  })

  it('cuts an end past the file', () => {
    expect(parseRange('bytes=90-500', 100)).toEqual({ kind: 'part', start: 90, end: 99 })
  })

  it('reads the last n bytes', () => {
    expect(parseRange('bytes=-10', 100)).toEqual({ kind: 'part', start: 90, end: 99 })
    expect(parseRange('bytes=-500', 100)).toEqual({ kind: 'part', start: 0, end: 99 })
  })

  it('rejects ranges it cannot serve', () => {
    expect(parseRange('bytes=100-', 100)).toEqual({ kind: 'bad' })
    expect(parseRange('bytes=20-10', 100)).toEqual({ kind: 'bad' })
    expect(parseRange('bytes=-0', 100)).toEqual({ kind: 'bad' })
    expect(parseRange('bytes=-', 100)).toEqual({ kind: 'bad' })
    expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'bad' })
  })
})

describe('audioType', () => {
  it('knows the formats we scan', () => {
    expect(audioType('flac')).toBe('audio/flac')
    expect(audioType('opus')).toBe('audio/ogg')
    expect(audioType('xyz')).toBe('application/octet-stream')
  })
})
