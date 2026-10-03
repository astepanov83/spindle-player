import { describe, expect, it } from 'vitest'
import { isItemKey, itemKey, splitKey } from './items'

describe('item keys', () => {
  it('joins and splits at the first ":"', () => {
    expect(itemKey('files', '3fa1')).toBe('files:3fa1')
    expect(splitKey('radio:rb-1234')).toEqual({ plugin: 'radio', id: 'rb-1234' })
    expect(splitKey('mfp:a:b')).toEqual({ plugin: 'mfp', id: 'a:b' })
  })

  it('knows no key without a known plugin or an id', () => {
    for (const bad of ['3fa1', 'tv:x', 'files:', ':x', '']) expect(splitKey(bad)).toBeUndefined()
    for (const bad of ['3fa1', 'files:', 3, null, 'files:' + 'x'.repeat(5000)])
      expect(isItemKey(bad)).toBe(false)
    expect(isItemKey('mfp:9b0e')).toBe(true)
  })
})
