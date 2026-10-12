// Types for layout templates. See work/specs/layout-templates.md.

export type TemplateId = 'studio' | 'classic' | 'focus' | 'mini'
export type QueueMode = 'tab' | 'drawer' | 'col'
// what is drawn for the queue: 'none' in a template with no queue (Mini)
export type ShownQueue = QueueMode | 'none'
export type Look = 'tint' | 'ambient'

// A part never knows where it sits. Its options come from the template.
// lyrics: the song's words show in this part while turned on (ticket 120);
// a layout with no such part has no Lyrics button (Mini).
export type PartNode =
  | { part: 'library'; opts: { nav: 'chips' | 'sidebar'; lyrics?: true } }
  // show: only the stage or only the words; both when left out. 'line': a
  // small cover and two lines of text, no visualizer (Mini)
  | {
      part: 'nowplaying'
      opts: { style: 'panel' | 'full' | 'line'; show?: 'stage' | 'text'; lyrics?: true }
    }
  | { part: 'controls'; opts: { style: 'stack' | 'bar' | 'compact' } }

interface NodeBase {
  // "1fr" or a fixed length like "380px"
  size?: string
  // the Drawer slides in inside this node; 'fill': it covers all of it
  drawerHost?: true | 'fill'
}

interface BoxOpts {
  look?: Look
  // the parts inside keep their words and controls this wide at most, centered
  // (a wide Focus); the stage and backgrounds still fill the box
  contentWidth?: string
}

export type TemplateNode = NodeBase &
  (
    | ({ row: TemplateNode[] } & BoxOpts)
    | ({ col: TemplateNode[] } & BoxOpts)
    | PartNode
    // Tabs [label, "Queue"] when the queue setting is Tab, otherwise just `with`
    | { queue: { with: TemplateNode; label: string } }
    // a queue pane of this size, only when the queue setting is Column
    | { queueColumn: string }
  )

export interface WindowSize {
  width: number
  height: number
  minWidth: number
  minHeight: number
  // a bar (Mini): it can't be pulled taller than this, nor maximized
  maxHeight?: number
  // kept above other windows while the user's pin is on (miniOnTop)
  onTop?: true
}

export interface Template {
  id: TemplateId
  name: string
  window: WindowSize
  // what settings may offer; the first one is the default
  queueOptions: QueueMode[]
  layout: TemplateNode
  // false: no title bar; the whole window drags, and a right click opens the
  // window's menu (Mini)
  titleBar?: false
  // another layout for a window at least `ratio` times as wide as it is tall
  // and at least `minWidth` wide (layout/wide.ts)
  wide?: { ratio: number; minWidth: number; layout: TemplateNode }
}
