// The block types: what tsc refuses is part of the contract with plugins.
import { describe, expect, it } from 'vitest'
import { rowsBlock, type ItemRow, type PageRow, type Row } from './types'

const pageRow: PageRow = {
  title: 'Rock',
  to: { plugin: 'files', page: '' },
  songs: () => [],
  from: ''
}
const itemRow: ItemRow = { title: 'Drone', play: 'radio:drone' }

describe('rows blocks (carried from ticket 062)', () => {
  it('hold rows of one sort, named by the block', () => {
    const page = rowsBlock<number>({ rows: 'page', items: [0], key: String, row: () => pageRow })
    const item = rowsBlock<number>({ rows: 'item', items: [0], key: String, row: () => itemRow })
    expect([page.rows, item.rows]).toEqual(['page', 'item'])
  })

  it('do not type check with page rows and item rows mixed', () => {
    const mixed = (i: number): Row => (i ? itemRow : pageRow)
    // @ts-expect-error: a page rows block with item rows in it
    rowsBlock<number>({ rows: 'page', items: [0, 1], key: String, row: mixed })
    // @ts-expect-error: an item rows block with page rows in it
    rowsBlock<number>({ rows: 'item', items: [0, 1], key: String, row: mixed })
    // @ts-expect-error: no sort named
    rowsBlock<number>({ items: [0], key: String, row: () => pageRow })
  })
})
