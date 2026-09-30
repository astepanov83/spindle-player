// The layout store: what a template change resets.
import { describe, expect, it } from 'vitest'

const { layout } = await import('./layout.svelte')
const { library } = await import('./library.svelte')
const { settings } = await import('./settings.svelte')

describe('choosing a template (ticket 039)', () => {
  it('clears the search text: the other template shows another view', () => {
    settings.template = 'studio'
    library.chip = 'radio'
    library.query = 'jazz'
    layout.chooseTemplate('classic')
    expect(settings.template).toBe('classic')
    expect(library.query).toBe('')
  })
})
