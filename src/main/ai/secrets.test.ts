import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSecrets, type SafeStorage } from './secrets'

// Reverses the text: enough to see nothing plain is written.
function fakeStorage(available = true, backend?: string): SafeStorage {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (t) => Buffer.from([...t].reverse().join('')),
    decryptString: (b) => [...b.toString()].reverse().join(''),
    ...(backend ? { getSelectedStorageBackend: () => backend } : {})
  }
}

let dir: string
let path: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spindle-secrets-'))
  path = join(dir, 'ai-secrets.json')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('FileSecrets', () => {
  it('keeps keys encrypted under each provider, and reads them back', () => {
    const s = new FileSecrets(path, fakeStorage())
    expect(s.safe).toBe(true)
    s.for('a').set('key', 'secret-1')
    s.for('b').set('key', 'secret-2')
    const text = readFileSync(path, 'utf8')
    expect(text).not.toContain('secret')
    expect(Object.keys(JSON.parse(text))).toEqual(['a', 'b'])

    const again = new FileSecrets(path, fakeStorage())
    expect(again.for('a').get('key')).toBe('secret-1')
    expect(again.for('b').get('key')).toBe('secret-2')
    again.for('a').remove('key')
    expect(again.for('a').get('key')).toBeUndefined()
    expect(Object.keys(JSON.parse(readFileSync(path, 'utf8')))).toEqual(['b'])
  })

  it('starts empty with no file', () => {
    const s = new FileSecrets(path, fakeStorage())
    expect(s.for('a').get('key')).toBeUndefined()
    s.for('a').remove('key')
    expect(() => readFileSync(path)).toThrow()
  })

  it('starts empty from a broken file and keeps a copy', () => {
    writeFileSync(path, '{')
    const s = new FileSecrets(path, fakeStorage())
    expect(s.for('a').get('key')).toBeUndefined()
    expect(readFileSync(`${path}.broken`, 'utf8')).toBe('{')
  })

  it('never writes a file it could not read', () => {
    mkdirSync(path)
    const s = new FileSecrets(path, fakeStorage())
    s.for('a').set('key', 'x')
    expect(s.for('a').get('key')).toBe('x')
  })

  it('a key that no longer decrypts is as if never saved', () => {
    new FileSecrets(path, fakeStorage()).for('a').set('key', 'x')
    const broken: SafeStorage = {
      ...fakeStorage(),
      decryptString: () => {
        throw new Error('keychain changed')
      }
    }
    const log = vi.fn()
    expect(new FileSecrets(path, broken, log).for('a').get('key')).toBeUndefined()
    expect(log).toHaveBeenCalledOnce()
  })

  it.each([
    ['no encryption', fakeStorage(false)],
    ["Linux's fixed password", fakeStorage(true, 'basic_text')]
  ])('with %s, saves nothing and keeps keys until quit', (_, storage) => {
    const s = new FileSecrets(path, storage)
    expect(s.safe).toBe(false)
    s.for('a').set('key', 'x')
    expect(s.for('a').get('key')).toBe('x')
    expect(() => readFileSync(path)).toThrow()
    expect(new FileSecrets(path, storage).for('a').get('key')).toBeUndefined()
    s.for('a').remove('key')
    expect(s.for('a').get('key')).toBeUndefined()
  })
})
