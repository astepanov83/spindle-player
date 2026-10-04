import { describe, expect, it } from 'vitest'
import { canOpenExternal } from './web-link'

describe('canOpenExternal', () => {
  it('opens https links only: main and the page use this one rule', () => {
    expect(canOpenExternal('https://github.com/astepanov83/spindle-player')).toBe(true)
    for (const url of [
      'http://example.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'smb://host/share',
      'spindle://media/abc',
      'not a url',
      ''
    ])
      expect(canOpenExternal(url)).toBe(false)
  })
})
