// The folder table the page's Folders view is built from (ticket 020).
import { relative, sep } from 'path'
import type { Folder } from '../../shared/library'
import { isUnder } from './merge'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

interface Node {
  name: string
  children: Map<string, Node>
  at: number
}

// `dirs` has the folder of each song; `roots` the music folders in settings
// order. Returns the folders (parents first, subfolders by name) and each
// song's index in them. Only folders with songs, and those above them, are listed.
export function folderTable(
  dirs: string[],
  roots: string[]
): { folders: Folder[]; index: number[] } {
  // deepest first, so a music folder inside another one keeps its songs
  const byDepth = [...roots].sort((a, b) => b.length - a.length)
  const top = new Map<string, Node>()
  const nodeOf = new Map<string, Node>()
  const node = (children: Map<string, Node>, name: string): Node => {
    let n = children.get(name)
    if (!n) children.set(name, (n = { name, children: new Map(), at: -1 }))
    return n
  }
  const nodes = dirs.map((dir) => {
    let n = nodeOf.get(dir)
    if (n) return n
    // a folder outside every music folder (an old index) is listed on its own
    const root = byDepth.find((r) => isUnder(dir, r)) ?? dir
    n = node(top, root)
    for (const part of relative(root, dir).split(sep)) if (part) n = node(n.children, part)
    nodeOf.set(dir, n)
    return n
  })

  const folders: Folder[] = []
  const add = (n: Node, parent: number): void => {
    n.at = folders.length
    folders.push({ name: n.name, parent })
    const kids = [...n.children.values()].sort((a, b) => collator.compare(a.name, b.name))
    for (const k of kids) add(k, n.at)
  }
  const order = (name: string): number => {
    const i = roots.indexOf(name)
    return i < 0 ? roots.length : i
  }
  const tops = [...top.values()].sort(
    (a, b) => order(a.name) - order(b.name) || collator.compare(a.name, b.name)
  )
  for (const n of tops) add(n, -1)
  return { folders, index: nodes.map((n) => n.at) }
}
