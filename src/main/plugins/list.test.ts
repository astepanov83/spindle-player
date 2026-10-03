import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { plugins } from '../../shared/plugins'

vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' }, protocol: {}, net: {} }))
// the real one starts a process when it is imported
vi.mock('./files/service', () => ({ LibraryService: class {} }))
vi.mock('../../../resources/metal-only.png?asset', () => ({ default: '' }))

const { createPlugins } = await import('./list')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-plugin-list-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('createPlugins', () => {
  it('makes one main plugin for each plugin id, in list order', () => {
    const made = createPlugins({ userData: dir, log: () => {} })
    expect(made.map((p) => p.id)).toEqual(plugins.map((p) => p.id))
  })
})
