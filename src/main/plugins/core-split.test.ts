// The core knows no plugin by name (ticket 064, spec "Tests"). Reads every
// file under src/ and fails on:
// - a core file that imports from a plugin's folder,
// - a plugin's id in a string of a core file ('radio', or a key 'files:...');
//   comments don't count,
// - a plugin's file that imports from another plugin's folder,
// - a .svelte file in a plugin's page half: plugins give data, the core draws,
// - a core file that imports a file of resources/ that is not the core's.
// A plugin's folders are src/main/plugins/<id>, src/renderer/src/plugins/<id>
// and src/shared/plugins/<id>. Everything else is the core, but for the plugin
// list files below.
import { readdirSync, readFileSync } from 'fs'
import { join, posix, resolve } from 'path'
import { parse } from 'svelte/compiler'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { plugins } from '../../shared/plugins'

const ids = plugins.map((p) => p.id)
const roots = ['src/main/plugins', 'src/renderer/src/plugins', 'src/shared/plugins']

// The only files that may name and import every plugin: they list them.
const listFiles = [
  'src/shared/plugins.ts',
  'src/main/plugins/list.ts',
  // which plugin an id of a file from before item keys belongs to
  'src/main/plugins/old-ids.ts',
  'src/preload/plugins.ts',
  'src/renderer/src/plugins/index.ts'
]

// Strings in the core that are a plugin's id by chance, not the plugin.
const notPlugins = [
  { file: 'src/renderer/src/keys.ts', text: 'radio', why: 'an <input type="radio">' },
  { file: 'src/renderer/src/keys.test.ts', text: 'radio', why: 'an <input type="radio">' },
  { file: 'src/renderer/src/ui/Seg.svelte', text: 'radio', why: 'ARIA role' }
]

// Core tests that may name plugins and import their folders: they wire the
// plugins' data and stores as fakes. Any other core test is checked as core
// code; a test in a plugin's folder is checked for imports of another plugin.
const coreTests = [
  'src/main/convert-files.test.ts',
  'src/main/plugins/core-split.test.ts',
  'src/main/plugins/list.test.ts',
  'src/main/stores.test.ts',
  'src/renderer/src/blocks/play.test.ts',
  'src/renderer/src/library/song-menu.test.ts',
  'src/renderer/src/library/views.test.ts',
  'src/renderer/src/plugins/index.test.ts',
  'src/renderer/src/plugins/start.test.ts',
  'src/renderer/src/plugins/tabs.test.ts',
  'src/renderer/src/plugins/types.test.ts',
  'src/renderer/src/queue/logic.test.ts',
  'src/renderer/src/stores/layout.test.ts',
  'src/renderer/src/stores/library.test.ts',
  'src/renderer/src/stores/library-version.svelte.test.ts',
  'src/renderer/src/stores/live-queue.test.ts',
  'src/renderer/src/stores/playlists.test.ts',
  'src/renderer/src/stores/queues.test.ts',
  'src/renderer/src/stores/queue.test.ts',
  'src/renderer/src/ui/scroll-landing.svelte.test.ts',
  'src/renderer/src/ui/scroll-top.svelte.test.ts',
  'src/shared/id-moves.test.ts',
  'src/shared/playlists.test.ts',
  'src/shared/plugins.test.ts',
  'src/shared/plugins/items.test.ts',
  'src/shared/saved-queue.test.ts',
  'src/shared/settings.test.ts'
]

// The files of resources/ the core may import; the others are plugins' (Radio's
// bundled logo) and go through the plugin list.
const coreResources = ['resources/icon.png']

interface Source {
  // from the repo's folder, with "/"
  file: string
  text: string
}

function pluginOf(file: string): string | undefined {
  for (const r of roots) for (const id of ids) if (file.startsWith(`${r}/${id}/`)) return id
  return undefined
}

const namesPlugin = (s: string): boolean => ids.some((id) => s === id || s.startsWith(`${id}:`))

// The module names a file imports, and its strings, without its comments.
function read(src: Source): { imports: string[]; strings: string[] } {
  const imports: string[] = []
  const strings: string[] = []
  if (src.file.endsWith('.svelte')) {
    const seen = new Set<object>()
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object' || seen.has(n)) return
      seen.add(n)
      const node = n as Record<string, unknown> & { type?: string }
      const source = node.source as { value?: unknown } | undefined
      if (/^(Import|Export\w*)Declaration$|^ImportExpression$/.test(node.type ?? '')) {
        if (typeof source?.value === 'string') imports.push(source.value)
      } else if (node.type === 'Literal' && typeof node.value === 'string') strings.push(node.value)
      else if (node.type === 'TemplateElement')
        strings.push((node.value as { cooked: string }).cooked)
      // a static attribute's text: plugin="mfp", href="files:a"
      else if (node.type === 'Attribute' && Array.isArray(node.value))
        for (const part of node.value as { type: string; data?: string }[])
          if (part.type === 'Text' && part.data !== undefined) strings.push(part.data)
      for (const [k, v] of Object.entries(node)) if (k !== 'parent') walk(v)
    }
    walk(parse(src.text, { modern: true }))
    return { imports, strings }
  }
  const walk = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      imports.push((n.moduleSpecifier as ts.StringLiteral).text)
      return
    }
    // import('./x'), and vi.mock('./x') in a test
    if (ts.isCallExpression(n) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const e = n.expression
      const name = ts.isPropertyAccessExpression(e) ? e.name.text : ''
      if (e.kind === ts.SyntaxKind.ImportKeyword || /^(mock|doMock|importActual)$/.test(name))
        imports.push(n.arguments[0].text)
    }
    if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) {
      imports.push((n.argument.literal as ts.StringLiteral).text)
      return
    }
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    )
      strings.push(n.text)
    ts.forEachChild(n, walk)
  }
  walk(ts.createSourceFile(src.file, src.text, ts.ScriptTarget.Latest, true))
  return { imports, strings }
}

function problems(sources: Source[]): string[] {
  const out: string[] = []
  for (const src of sources) {
    const { file } = src
    if (file.startsWith('src/renderer/src/plugins/') && file.endsWith('.svelte'))
      out.push(`${file}: a .svelte file in a plugin's page half`)
    const own = pluginOf(file)
    const free = listFiles.includes(file) || (!own && coreTests.includes(file))
    const { imports, strings } = read(src)
    for (const spec of imports) {
      if (!spec.startsWith('.') || free) continue
      const target = posix.join(posix.dirname(file), spec.split('?')[0])
      if (!own && target.startsWith('resources/') && !coreResources.includes(target))
        out.push(`${file}: imports ${spec}, not a core resource`)
      const to = pluginOf(`${target}/`)
      if (to && to !== own)
        out.push(`${file}: imports ${spec}, of ${to}` + (own ? `, from ${own}` : ' (core)'))
    }
    if (own || free) continue
    for (const s of strings) {
      if (!namesPlugin(s)) continue
      if (notPlugins.some((n) => n.file === file && n.text === s)) continue
      out.push(`${file}: names a plugin: '${s}'`)
    }
  }
  return out
}

function sourcesUnder(root: string, dir: string): Source[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const path = `${dir}/${e.name}`
    if (e.isDirectory()) return sourcesUnder(root, path)
    if (!/\.(ts|svelte)$/.test(e.name)) return []
    return [{ file: path, text: readFileSync(join(root, path), 'utf8') }]
  })
}

describe('the core and the plugins', () => {
  it('name each other only through the plugin list', () => {
    const root = resolve(__dirname, '../../..')
    const sources = sourcesUnder(root, 'src')
    expect(problems(sources)).toEqual([])
    // a listed file that was moved or removed is noticed
    const files = sources.map((s) => s.file)
    for (const f of [...listFiles, ...coreTests, ...notPlugins.map((n) => n.file)])
      expect(files).toContain(f)
  })

  it('names in a list file and in comments are fine', () => {
    const files = [
      {
        file: 'src/main/plugins/list.ts',
        text: "import { X } from './radio/plugin'\nconst a = 'radio'"
      },
      { file: 'src/main/x.ts', text: "// 'radio' and files:a in a comment\nconst a = 'radios'" },
      { file: 'src/renderer/src/x.svelte', text: "<!-- 'mfp' --><p>files</p>" }
    ]
    expect(problems(files)).toEqual([])
  })

  it('finds an import of a plugin in the core, in a script or a .svelte file', () => {
    const files = [
      { file: 'src/main/x.ts', text: "import { a } from './plugins/radio/stations'" },
      {
        file: 'src/renderer/src/x.ts',
        text: "const m = await import('./plugins/mfp/store.svelte')"
      },
      { file: 'src/shared/x.ts', text: "export type { A } from './plugins/files/ipc'" },
      {
        file: 'src/renderer/src/X.svelte',
        text: '<script lang="ts">import { files } from \'./plugins/files/store.svelte\'</script>'
      }
    ]
    expect(problems(files)).toHaveLength(4)
  })

  it("finds a plugin's id or key in a string of the core", () => {
    const files = [
      { file: 'src/main/x.ts', text: "if (k.plugin === 'radio') go()" },
      { file: 'src/shared/x.ts', text: 'const key = `files:${id}`' },
      { file: 'src/renderer/src/X.svelte', text: "{#if p === 'mfp'}<p>x</p>{/if}" },
      { file: 'src/renderer/src/Y.svelte', text: '<X plugin="radio" /><a href="files:a">a</a>' }
    ]
    expect(problems(files)).toEqual([
      "src/main/x.ts: names a plugin: 'radio'",
      "src/shared/x.ts: names a plugin: 'files:'",
      "src/renderer/src/X.svelte: names a plugin: 'mfp'",
      "src/renderer/src/Y.svelte: names a plugin: 'radio'",
      "src/renderer/src/Y.svelte: names a plugin: 'files:a'"
    ])
  })

  it("finds a plugin's resource imported by the core, not by the plugin list", () => {
    const logo = "import logo from '../../resources/metal-only.png?asset'"
    const files = [
      { file: 'src/main/x.ts', text: logo },
      { file: 'src/main/y.ts', text: "import icon from '../../resources/icon.png?asset'" },
      { file: 'src/main/plugins/list.ts', text: logo.replace('../../', '../../../') }
    ]
    expect(problems(files)).toEqual([
      'src/main/x.ts: imports ../../resources/metal-only.png?asset, not a core resource'
    ])
  })

  it('finds a plugin that imports another, also in its tests', () => {
    const files = [
      { file: 'src/main/plugins/radio/a.ts', text: "import { b } from '../files/cover-http'" },
      { file: 'src/main/plugins/files/a.test.ts', text: "import { b } from '../radio/logos'" },
      {
        file: 'src/renderer/src/plugins/radio/a.ts',
        text: "import { b } from '../../../../shared/plugins/mfp/mfp'"
      },
      // its own folders in main, shared and the page are one plugin
      {
        file: 'src/renderer/src/plugins/radio/b.ts',
        text: "import { s } from '../../../../shared/plugins/radio/stations'"
      }
    ]
    expect(problems(files)).toHaveLength(3)
  })

  it('lets a listed core test wire plugins, not another, and finds a .svelte file in a page half', () => {
    const wires = "import '../plugins/files/store.svelte'\nqueue.add('files:a')"
    const files = [
      { file: 'src/renderer/src/stores/queue.test.ts', text: wires },
      { file: 'src/renderer/src/stores/x.test.ts', text: wires },
      { file: 'src/renderer/src/plugins/radio/Row.svelte', text: '<p>x</p>' }
    ]
    expect(problems(files)).toEqual([
      'src/renderer/src/stores/x.test.ts: imports ../plugins/files/store.svelte, of files (core)',
      "src/renderer/src/stores/x.test.ts: names a plugin: 'files:a'",
      "src/renderer/src/plugins/radio/Row.svelte: a .svelte file in a plugin's page half"
    ])
  })
})
