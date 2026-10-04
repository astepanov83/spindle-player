import { describe, expect, it } from 'vitest'
import { plugins } from '../plugins'
import { isItemKey, isKeyOfKind, itemKey, splitKey } from './items'

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

describe('isKeyOfKind', () => {
  it('agrees with splitKey and the plugin list on good and bad keys', () => {
    const keys: unknown[] = [
      'files:3fa1',
      'mfp:9b0e',
      'radio:rb-1',
      'mfp:a:b',
      'files:',
      ':x',
      ':',
      '',
      'files',
      'tv:x',
      'constructor:x',
      '__proto__:x',
      'Files:x',
      ' files:x',
      'files:' + 'x'.repeat(4994),
      'files:' + 'x'.repeat(4995),
      3,
      null,
      undefined,
      ['files:x']
    ]
    for (const v of keys)
      for (const kind of ['track', 'live'] as const) {
        const k = isItemKey(v) ? splitKey(v) : undefined
        const want = !!k && plugins.some((p) => p.id === k.plugin && p.itemKind === kind)
        expect(isKeyOfKind(v, kind), `${String(v).slice(0, 20)} ${kind}`).toBe(want)
      }
  })
})
