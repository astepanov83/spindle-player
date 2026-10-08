import { describe, expect, it } from 'vitest'
import { fallbackPalettes } from '../../../shared/palette'
import { tileKey } from './cover-tile'

describe('tileKey', () => {
  it('changes with the colors for the same seed, so the media controls follow a new logo', () => {
    const art = { seed: 's', palette: fallbackPalettes('s') }
    const logo = { ...art, palette: fallbackPalettes('logo') }
    expect(tileKey(art, 'rings', 'dark')).toBe(tileKey({ ...art }, 'rings', 'dark'))
    expect(tileKey(logo, 'rings', 'dark')).not.toBe(tileKey(art, 'rings', 'dark'))
    expect(tileKey(art, 'type', 'dark')).not.toBe(tileKey(art, 'rings', 'dark'))
    expect(tileKey(art, 'rings', 'light')).not.toBe(tileKey(art, 'rings', 'dark'))
  })
})
