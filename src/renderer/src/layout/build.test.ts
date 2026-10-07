import { describe, expect, it } from 'vitest'
import { buildLayout, partsOf, type BuiltNode } from './build'
import { templates } from '../../../shared/templates'
import { queueModeFor } from '../../../shared/settings'

// Short names for the parts in a tree, e.g. "library:chips" or "queue:header"
function names(node: BuiltNode): string[] {
  return partsOf(node).map((p) => {
    if (p.part === 'queue')
      return 'queue' + (p.opts.header ? ':header' : '') + (p.opts.close ? ':close' : '')
    if (p.part === 'nowplaying')
      return 'nowplaying:' + p.opts.style + (p.opts.show ? ':' + p.opts.show : '')
    return p.part + ':' + ('nav' in p.opts ? p.opts.nav : p.opts.style)
  })
}

function find(node: BuiltNode, test: (n: BuiltNode) => boolean): BuiltNode[] {
  const kids = node.kind === 'box' ? node.children : node.kind === 'tabs' ? node.panes : []
  return [...(test(node) ? [node] : []), ...kids.flatMap((k) => find(k, test))]
}

const drawerHosts = (root: BuiltNode): BuiltNode[] => find(root, (n) => !!n.drawer)
const tabs = (root: BuiltNode): BuiltNode[] => find(root, (n) => n.kind === 'tabs')

describe('Studio', () => {
  const t = templates.studio

  it('tab: now playing and queue share a tab strip, no slot buttons', () => {
    const b = buildLayout(t, 'tab')
    expect(names(b.root)).toEqual(['library:chips', 'nowplaying:panel', 'queue', 'controls:stack'])
    const [tb] = tabs(b.root)
    expect(tb.kind === 'tabs' && tb.labels).toEqual(['Now playing', 'Queue'])
    expect(tb.flex).toBe('1 1 0')
    expect(drawerHosts(b.root)).toHaveLength(0)
    expect(b.slots['player.buttons']).toEqual([])
  })

  it('drawer: the library part hosts it and the player slot gets a queue button', () => {
    const b = buildLayout(t, 'drawer')
    expect(names(b.root)).toEqual(['library:chips', 'nowplaying:panel', 'controls:stack'])
    const hosts = drawerHosts(b.root)
    expect(hosts).toHaveLength(1)
    expect(hosts[0].kind === 'part' && hosts[0].part.part).toBe('library')
    expect(b.slots['player.buttons']).toEqual([{ act: 'queue', label: 'Show queue' }])
  })

  it('column: a queue pane with a header, sized from the template', () => {
    const b = buildLayout(t, 'col')
    expect(names(b.root)).toEqual([
      'library:chips',
      'nowplaying:panel',
      'controls:stack',
      'queue:header'
    ])
    const root = b.root
    expect(root.kind === 'box' && root.children.map((c) => c.flex)).toEqual([
      '1 1 0',
      '0 0 380px',
      '0 0 310px'
    ])
    expect(b.slots['player.buttons']).toEqual([])
  })

  it('the player column is tinted and the root fills the window', () => {
    const b = buildLayout(t, 'tab')
    expect(b.root.flex).toBe('1 1 0')
    const tinted = find(b.root, (n) => n.kind === 'box' && n.look === 'tint')
    expect(tinted).toHaveLength(1)
  })
})

describe('Classic', () => {
  const t = templates.classic

  it('drawer: hosted by the row above the bar, button in the slot', () => {
    const b = buildLayout(t, 'drawer')
    expect(names(b.root)).toEqual(['library:sidebar', 'controls:bar'])
    const [host] = drawerHosts(b.root)
    expect(host.kind === 'box' && host.dir).toBe('row')
    expect(b.slots['player.buttons']).toHaveLength(1)
  })

  it('column: queue pane next to the library, bar is 96px', () => {
    const b = buildLayout(t, 'col')
    expect(names(b.root)).toEqual(['library:sidebar', 'queue:header', 'controls:bar'])
    const root = b.root
    expect(root.kind === 'box' && root.children[1].flex).toBe('0 0 96px')
    expect(drawerHosts(b.root)).toHaveLength(0)
  })
})

describe('Focus', () => {
  const t = templates.focus

  it('has no library and an ambient background', () => {
    const b = buildLayout(t, 'tab')
    expect(names(b.root)).toEqual(['nowplaying:full', 'queue', 'controls:stack'])
    expect(b.root.kind === 'box' && b.root.look).toBe('ambient')
  })

  it('drawer: slides over the now playing part', () => {
    const b = buildLayout(t, 'drawer')
    expect(names(b.root)).toEqual(['nowplaying:full', 'controls:stack'])
    const [host] = drawerHosts(b.root)
    expect(host.kind === 'part' && host.part.part).toBe('nowplaying')
    expect(host.drawer).toBe('side')
    expect(host.flex).toBe('1 1 0')
  })

  it('keeps its words and controls 560px wide at most; the other templates have no such width', () => {
    const b = buildLayout(t, 'tab')
    expect(b.root.kind === 'box' && b.root.contentWidth).toBe('560px')
    expect(b.wide).toBe(false)
    for (const other of [templates.studio, templates.classic]) {
      const boxes = find(buildLayout(other, 'drawer').root, (n) => n.kind === 'box')
      expect(boxes.map((n) => n.kind === 'box' && n.contentWidth)).not.toContain('560px')
      expect(boxes.every((n) => n.kind === 'box' && n.contentWidth === null)).toBe(true)
    }
  })

  it('wide, tab: the stage on the left, the words and the queue share the tabs on the right', () => {
    const b = buildLayout(t, 'tab', true)
    expect(b.wide).toBe(true)
    expect(names(b.root)).toEqual([
      'nowplaying:full:stage',
      'nowplaying:full:text',
      'queue',
      'controls:stack'
    ])
    const root = b.root
    expect(root.kind === 'box' && root.dir).toBe('row')
    expect(root.kind === 'box' && root.look).toBe('ambient')
    expect(root.kind === 'box' && root.contentWidth).toBe('560px')
    expect(root.kind === 'box' && root.children.map((c) => c.flex)).toEqual([
      '1 1 0',
      '0 0 clamp(420px, 40%, 620px)'
    ])
    const [tb] = tabs(b.root)
    expect(tb.kind === 'tabs' && tb.labels).toEqual(['Now playing', 'Queue'])
  })

  it('wide, drawer: it covers the words, not the stage or the controls', () => {
    const b = buildLayout(t, 'drawer', true)
    expect(names(b.root)).toEqual([
      'nowplaying:full:stage',
      'nowplaying:full:text',
      'controls:stack'
    ])
    const [host] = drawerHosts(b.root)
    expect(host.kind === 'part' && host.part.part === 'nowplaying' && host.part.opts.show).toBe(
      'text'
    )
    expect(host.drawer).toBe('fill')
    expect(b.slots['player.buttons']).toEqual([{ act: 'queue', label: 'Show queue' }])
  })

  it('a template with no wide layout ignores the ask', () => {
    const b = buildLayout(templates.studio, 'tab', true)
    expect(b.wide).toBe(false)
    expect(names(b.root)).toEqual(names(buildLayout(templates.studio, 'tab').root))
  })
})

describe('every template and queue option', () => {
  for (const t of Object.values(templates)) {
    for (const mode of t.queueOptions) {
      for (const wide of t.wide ? [false, true] : [false]) {
        it(`${t.id}${wide ? ' wide' : ''} / ${mode}: one queue somewhere and at most one drawer`, () => {
          const b = buildLayout(t, mode, wide)
          const queues = partsOf(b.root).filter((p) => p.part === 'queue').length
          const drawers = drawerHosts(b.root).length
          expect(queues + drawers).toBe(1)
          expect(b.queueMode).toBe(mode)
          // every player style renders the slot, so a controls part must exist
          expect(names(b.root).some((n) => n.startsWith('controls:'))).toBe(true)
          // and never two big stages (Classic's is in its bar)
          const stages = names(b.root).filter(
            (n) => n.startsWith('nowplaying:') && !n.endsWith(':text')
          )
          expect(stages.length).toBeLessThanOrEqual(1)
        })
      }
    }
  }
})

describe('queueModeFor', () => {
  it('keeps an offered choice', () => {
    expect(queueModeFor(templates.studio, 'col')).toBe('col')
  })
  it('falls back to the first option when the saved one is not offered', () => {
    expect(queueModeFor(templates.classic, 'tab')).toBe('drawer')
    expect(queueModeFor(templates.focus, 'col')).toBe('tab')
    expect(queueModeFor(templates.focus, undefined)).toBe('tab')
  })
})
