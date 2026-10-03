// The core knows no plugin by name (ticket 064, spec "Tests"). Reads every
// file under src/ and fails on:
// - a core file that imports from a plugin's folder,
// - a plugin's id in a string of a core file ('radio', or a key 'files:...');
//   comments don't count,
// - a plugin's file that imports from another plugin's folder,
// - a .svelte file in a plugin's page half: plugins give data, the core draws.
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
  { file: 'src/renderer/src/keys.ts', text: 'radio', why: 'an <input type="radio">' }
]

// A core test may name plugins and import their folders: it wires their data
// and stores as fakes. A test in a plugin's folder is still checked for
// imports of another plugin.
const isTest = (file: string): boolean => file.endsWith('.test.ts')

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
    const free = listFiles.includes(file) || (!own && isTest(file))
    const { imports, strings } = read(src)
    for (const spec of imports) {
      if (!spec.startsWith('.') || free) continue
      const target = posix.join(posix.dirname(file), spec.split('?')[0])
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
    for (const f of [...listFiles, ...notPlugins.map((n) => n.file)]) expect(files).toContain(f)
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
      { file: 'src/renderer/src/X.svelte', text: "{#if p === 'mfp'}<p>x</p>{/if}" }
    ]
    expect(problems(files)).toEqual([
      "src/main/x.ts: names a plugin: 'radio'",
      "src/shared/x.ts: names a plugin: 'files:'",
      "src/renderer/src/X.svelte: names a plugin: 'mfp'"
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

  it('lets a core test wire plugins, and finds a .svelte file in a page half', () => {
    const files = [
      {
        file: 'src/renderer/src/stores/x.test.ts',
        text: "import '../plugins/files/store.svelte'\nqueue.add('files:a')"
      },
      { file: 'src/renderer/src/plugins/radio/Row.svelte', text: '<p>x</p>' }
    ]
    expect(problems(files)).toEqual([
      "src/renderer/src/plugins/radio/Row.svelte: a .svelte file in a plugin's page half"
    ])
  })
})
