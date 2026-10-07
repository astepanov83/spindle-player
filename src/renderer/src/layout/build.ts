// Turns template data into a tree the Layout component renders.
// Same job as build() in prototype/index.html, but with no DOM, so it can be tested.
import type { Look, PartNode, QueueMode, Template, TemplateNode } from '../../../shared/layout'

export type SlotName = 'player.buttons'

export interface SlotButton {
  act: 'queue'
  label: string
}

export type Slots = Record<SlotName, SlotButton[]>

export type QueuePart = { part: 'queue'; opts: { header: boolean; close: boolean } }
export type BuiltPart = PartNode | QueuePart

interface BuiltBase {
  // CSS flex value, or null to size by content
  flex: string | null
  // the Drawer is placed inside this node: 360px at its right ('side'), or over all of it
  drawer: false | 'side' | 'fill'
}

export type BuiltNode = BuiltBase &
  (
    | {
        kind: 'box'
        dir: 'row' | 'col'
        look: Look | null
        contentWidth: string | null
        children: BuiltNode[]
      }
    | { kind: 'part'; part: BuiltPart }
    | { kind: 'tabs'; labels: [string, string]; panes: [BuiltNode, BuiltNode] }
  )

export interface BuiltLayout {
  root: BuiltNode
  queueMode: QueueMode
  // built from the template's wide layout
  wide: boolean
  slots: Slots
}

function flexOf(size: string | undefined): string | null {
  if (!size) return null
  return size === '1fr' ? '1 1 0' : '0 0 ' + size
}

function queuePart(header: boolean, close: boolean): BuiltNode {
  return {
    kind: 'part',
    part: { part: 'queue', opts: { header, close } },
    flex: null,
    drawer: false
  }
}

export function buildLayout(template: Template, queueMode: QueueMode, wide = false): BuiltLayout {
  const tree = (wide && template.wide?.layout) || template.layout
  let host: BuiltNode | null = null
  let fill = false

  function build(n: TemplateNode): BuiltNode | null {
    let node: BuiltNode
    if ('row' in n || 'col' in n) {
      const kids = 'row' in n ? n.row : n.col
      node = {
        kind: 'box',
        dir: 'row' in n ? 'row' : 'col',
        look: n.look ?? null,
        contentWidth: n.contentWidth ?? null,
        children: kids.map(build).filter((c): c is BuiltNode => c !== null),
        flex: null,
        drawer: false
      }
    } else if ('part' in n) {
      node = {
        kind: 'part',
        part: { part: n.part, opts: n.opts } as PartNode,
        flex: null,
        drawer: false
      }
    } else if ('queue' in n) {
      const main = build(n.queue.with)
      if (!main) return null
      node =
        queueMode === 'tab'
          ? {
              kind: 'tabs',
              labels: [n.queue.label, 'Queue'],
              panes: [main, queuePart(false, false)],
              flex: null,
              drawer: false
            }
          : main
    } else {
      if (queueMode !== 'col') return null
      node = queuePart(true, false)
      node.flex = flexOf(n.queueColumn)
    }
    if (n.size) node.flex = flexOf(n.size)
    if (n.drawerHost) {
      host = node
      fill = n.drawerHost === 'fill'
    }
    return node
  }

  const root = build(tree)
  if (!root) throw new Error(`Template ${template.id} has no layout`)
  root.flex = '1 1 0'

  const slots: Slots = { 'player.buttons': [] }
  if (queueMode === 'drawer') {
    ;(host ?? root).drawer = fill ? 'fill' : 'side'
    // the drawer owns its toggle and asks for a place in the player's slot
    slots['player.buttons'].push({ act: 'queue', label: 'Show queue' })
  }
  return { root, queueMode, wide: tree !== template.layout, slots }
}

// All parts in the tree, in order. Handy for tests and checks.
export function partsOf(node: BuiltNode): BuiltPart[] {
  if (node.kind === 'part') return [node.part]
  if (node.kind === 'tabs') return node.panes.flatMap(partsOf)
  return node.children.flatMap(partsOf)
}
