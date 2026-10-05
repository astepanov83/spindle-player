// Keys and login tokens of the AI providers, in ai-secrets.json in userData,
// each encrypted with Electron's safeStorage (the system keychain). Never in
// settings.json, the page, the library process or the log.
import { openJsonFile, removeStrayTmp, writeJsonFileSync } from '../json-file'
import type { SecretStore } from './types'

// Electron's safeStorage, handed in so a test can fake it.
export interface SafeStorage {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(data: Buffer): string
  // Linux only; 'basic_text' is a fixed password, not a keychain
  getSelectedStorageBackend?(): string
}

// provider id -> name -> encrypted value, base64
type SecretsFile = Record<string, Record<string, string>>

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function isSecretsFile(v: unknown): v is SecretsFile {
  return (
    isObject(v) &&
    Object.values(v).every(
      (p) => isObject(p) && Object.values(p).every((x) => typeof x === 'string')
    )
  )
}

export class FileSecrets {
  #file: SecretsFile = {}
  // When keys can't be stored safely: kept in memory only, so a login still
  // works until the app quits.
  #session: Record<string, Record<string, string>> = {}
  readonly #canWrite: boolean
  readonly safe: boolean

  constructor(
    readonly path: string,
    readonly storage: SafeStorage,
    readonly log: (text: string) => void = (t) => console.warn(t)
  ) {
    this.safe =
      storage.isEncryptionAvailable() && storage.getSelectedStorageBackend?.() !== 'basic_text'
    removeStrayTmp(path)
    const opened = openJsonFile(path, 'AI keys file', isSecretsFile)
    this.#canWrite = opened.canWrite
    if (isSecretsFile(opened.value)) this.#file = opened.value
  }

  // One provider's names.
  for(provider: string): SecretStore {
    return {
      get: (name) => this.#get(provider, name),
      set: (name, value) => this.#set(provider, name, value),
      remove: (name) => this.#remove(provider, name)
    }
  }

  #get(provider: string, name: string): string | undefined {
    const session = this.#session[provider]?.[name]
    if (session !== undefined) return session
    const stored = this.#file[provider]?.[name]
    if (stored === undefined || !this.safe) return undefined
    try {
      return this.storage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      // the keychain changed since: as if never saved
      this.log(`AI: a saved key of ${provider} can't be read`)
      return undefined
    }
  }

  #set(provider: string, name: string, value: string): void {
    if (!this.safe) {
      ;(this.#session[provider] ??= {})[name] = value
      return
    }
    const encrypted = this.storage.encryptString(value).toString('base64')
    this.#save({ ...this.#file, [provider]: { ...this.#file[provider], [name]: encrypted } })
  }

  #remove(provider: string, name: string): void {
    if (this.#session[provider]) delete this.#session[provider][name]
    if (this.#file[provider]?.[name] === undefined) return
    const rest = { ...this.#file[provider] }
    delete rest[name]
    const next = { ...this.#file, [provider]: rest }
    if (!Object.keys(rest).length) delete next[provider]
    this.#save(next)
  }

  // Right away: keys change seldom, and one lost at a crash means a new login.
  #save(next: SecretsFile): void {
    this.#file = next
    if (!this.#canWrite) return
    try {
      writeJsonFileSync(this.path, next)
    } catch (error) {
      console.error(`Could not save ${this.path}`, error)
    }
  }
}
