// tag-fixes.json: song info fixed inside Spindle (ticket 129), owned by the
// library process like artists.json. The page sends changes; they are kept
// here and written a little later, and the library is built again with them.
import type { IdMoves } from '../../../shared/id-moves'
import {
  changeFixes,
  isKnownTagFixes,
  moveFixes,
  parseTagFixes,
  pruneFixes,
  tagFields,
  tagFixesData,
  type FixesBefore,
  type TagChange,
  type TagFix,
  type TagFixes,
  type TagFixesData,
  type TagValues
} from '../../../shared/plugins/files/tag-fixes'
import { JsonFileWriter, openJsonFile } from '../../json-file'
import type { FileEntry } from './types'

// A file's tags as the edit form shows them.
export function tagValuesOf(e: FileEntry): TagValues {
  return {
    title: e.title ?? '',
    artist: e.artist ?? '',
    album: e.album ?? '',
    albumArtist: e.albumArtist ?? '',
    year: e.year ?? 0,
    genre: e.genre ?? [],
    no: e.track ?? 0,
    disc: e.disc ?? 0
  }
}

// The entry as the library sees it with its fix: an empty value takes the
// tag away, as if the file had none.
export function fixEntry(e: FileEntry, fix: TagFix): FileEntry {
  const out: FileEntry = { ...e }
  const put = <K extends keyof FileEntry>(k: K, v: FileEntry[K] | undefined): void => {
    if (v === undefined) delete out[k]
    else out[k] = v
  }
  if (fix.title !== undefined) put('title', fix.title || undefined)
  if (fix.artist !== undefined) put('artist', fix.artist || undefined)
  if (fix.album !== undefined) put('album', fix.album || undefined)
  if (fix.albumArtist !== undefined) put('albumArtist', fix.albumArtist || undefined)
  if (fix.year !== undefined) put('year', fix.year || undefined)
  if (fix.genre !== undefined) put('genre', fix.genre.length ? fix.genre : undefined)
  if (fix.no !== undefined) put('track', fix.no || undefined)
  if (fix.disc !== undefined) put('disc', fix.disc || undefined)
  return out
}

// The file's own values of the fields a fix changes, for the page's list of
// changes and the form's way back.
export function fileTagsOf(e: FileEntry, fix: TagFix): TagFix {
  const file = tagValuesOf(e)
  const out: Record<string, unknown> = {}
  for (const f of tagFields) if (fix[f] !== undefined) out[f] = file[f]
  return out as TagFix
}

export class TagFixesStore {
  #fixes: TagFixes
  // none when the file could not be read: it may still be fine, so it is never replaced
  #writer: JsonFileWriter<TagFixesData> | undefined

  constructor(
    readonly path: string,
    log: (text: string) => void = (t) => console.error(t)
  ) {
    const f = openJsonFile(path, 'Tag fixes', isKnownTagFixes)
    this.#fixes = parseTagFixes(f.value)
    if (f.canWrite)
      this.#writer = new JsonFileWriter<TagFixesData>(path, 1000, (e) =>
        log(`Could not save ${path}: ${e}`)
      )
  }

  get fixes(): TagFixes {
    return this.#fixes
  }

  // What the songs had before, for Undo; undefined when nothing changed.
  change(c: TagChange, fileOf: (id: string) => TagValues | undefined): FixesBefore | undefined {
    const r = changeFixes(this.#fixes, c, fileOf)
    if (!r) return undefined
    this.#set(r.fixes)
    return r.before
  }

  // True when a fix moved.
  moveIds(moves: IdMoves): boolean {
    return this.#set(moveFixes(this.#fixes, moves))
  }

  // After a scan that ran to the end; true when something went.
  prune(fileOf: (id: string) => TagValues | undefined): boolean {
    return this.#set(pruneFixes(this.#fixes, fileOf))
  }

  #set(next: TagFixes): boolean {
    if (next === this.#fixes) return false
    this.#fixes = next
    this.#writer?.schedule(tagFixesData(next))
    return true
  }

  // False when the file is not written this session.
  flushSync(): boolean {
    return this.#writer?.flushSync() ?? false
  }
}
