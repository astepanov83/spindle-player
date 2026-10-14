// Editing songs' info inside Spindle (ticket 129): the forms for songs and
// albums, what their Save sends, and the list of changed songs with Undo.
// Main keeps the changes in tag-fixes.json and builds the library again;
// music files are never written.
import { genresOf } from '../../../../shared/genres'
import { songYear, type Album, type Track } from '../../../../shared/library'
import {
  maxNumber,
  sameValue,
  tagFields,
  type FixesBefore,
  type SongTags,
  type TagChange,
  type TagField,
  type TagFix,
  type TagValues
} from '../../../../shared/plugins/files/tag-fixes'
import { fmtCount } from '../../format'
import { notice } from '../../stores/notice.svelte'
import type { EditField, EditForm } from '../types'
import { followSongs } from './nav'
import { files } from './store.svelte'

export const fieldLabels: Record<TagField, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album artist',
  year: 'Year',
  genre: 'Genre',
  no: 'Track',
  disc: 'Disc'
}

// The forms' fields in the order shown: the names, then the numbers in
// one row. Edit album has the fields every song of an album shares.
export const songFields: TagField[] = [
  'title',
  'artist',
  'albumArtist',
  'album',
  'genre',
  'year',
  'no',
  'disc'
]
export const albumFields: TagField[] = ['album', 'albumArtist', 'genre', 'year']

// the names that get a row of their own; the others share one
const wideIn = (fields: TagField[]): Set<TagField> =>
  new Set(fields === albumFields ? ['album', 'albumArtist', 'genre'] : ['title', 'album', 'genre'])

const isNumber = (f: TagField): boolean => f === 'year' || f === 'no' || f === 'disc'

// The dialog's one line about where the change goes.
export const keptNote = 'Spindle keeps this change; your files stay as they are.'

// A value as the form shows it: genres as the library splits them, joined
// by "; " (a comma can be inside a genre's name); no number as ''.
export function valueText(f: TagField, v: TagValues[TagField]): string {
  if (f === 'genre') return genresOf(v as string[]).join('; ')
  if (isNumber(f)) return v ? String(v) : ''
  return v as string
}

// Typed text as the field's value; undefined when it can't be one.
export function textValue(f: TagField, text: string): TagValues[TagField] | undefined {
  const t = text.trim()
  if (f === 'genre')
    return t
      .split(';')
      .map((g) => g.trim())
      .filter(Boolean)
  if (!isNumber(f)) return t
  if (!t) return 0
  return /^\d+$/.test(t) && Number(t) <= maxNumber ? Number(t) : undefined
}

// One field across the songs: their value, or none with "Several values".
// When Spindle changed it on any of them, the files' own value is the way back.
export function editField(f: TagField, songs: SongTags[]): EditField {
  const now = songs.map((s) => valueText(f, s.now[f]))
  const same = now.every((v) => v === now[0])
  const out: EditField = { id: f, label: fieldLabels[f], value: same ? now[0] : '' }
  if (!same) out.placeholder = 'Several values'
  if (isNumber(f)) out.max = maxNumber
  if (f === 'genre') out.hint = 'Separate genres with ;'
  if (songs.some((s) => !sameValue(f, s.now[f], s.file[f]))) {
    const file = songs.map((s) => valueText(f, s.file[f]))
    const one = file.every((v) => v === file[0])
    out.file = one
      ? { text: file[0], label: `In the file: ${file[0] || 'none'}` }
      : { text: '', label: 'The files have other values' }
  }
  return out
}

// The form's Save as a change of tag-fixes.json; none when a value is bad.
export function tagEdit(
  ids: string[],
  changes: Record<string, string | null>
): TagChange | undefined {
  const set: Record<string, unknown> = {}
  const reset: TagField[] = []
  for (const [id, text] of Object.entries(changes)) {
    const f = tagFields.find((x) => x === id)
    if (!f) continue
    if (text === null) {
      reset.push(f)
      continue
    }
    const v = textValue(f, text)
    if (v === undefined) return undefined
    set[f] = v
  }
  return { edit: { ids, set: set as TagFix, reset } }
}

// Sends a change; the notice's Undo puts back what the songs had.
async function send(change: TagChange, done: (n: number) => string): Promise<void> {
  const before = await window.libraryApi.fixTags(change)
  const n = before ? Object.keys(before).length : 0
  if (!before || !n) return
  notice.show(done(n), { label: 'Undo', run: () => void undo(before) })
}

function undo(before: FixesBefore): Promise<FixesBefore | undefined> {
  return window.libraryApi.fixTags({ put: before })
}

function form(
  ids: string[],
  tags: Record<string, SongTags>,
  fields: TagField[],
  title: string,
  sub?: string
): EditForm {
  const songs = ids.map((id) => tags[id])
  return {
    title,
    ...(sub ? { sub } : {}),
    note: keptNote,
    fields: fields.map((f) => {
      const field = editField(f, songs)
      return wideIn(fields).has(f) ? { ...field, wide: true } : field
    }),
    save: (changes) => {
      const c = tagEdit(ids, changes)
      if (!c) return
      // the album and album artist group the songs: an album page follows them
      if ('album' in changes || 'albumArtist' in changes) followSongs(ids)
      void send(c, (n) =>
        n === 1 ? 'Song info changed' : `Changed ${fmtCount(n, 'song', 'songs')}`
      )
    }
  }
}

// Only songs the library has; the plugin's canEdit.
export const canEditSongs = (ids: string[]): boolean =>
  ids.length > 0 && ids.every((id) => files.has(id))

// "Edit song info…" on one song or several.
export async function songsForm(ids: string[]): Promise<EditForm | undefined> {
  const tags = await window.libraryApi.tagValues(ids)
  const known = ids.filter((id) => Object.hasOwn(tags, id))
  if (!known.length) return undefined
  const t = known.length === 1 ? files.find(known[0]) : undefined
  return form(
    known,
    tags,
    songFields,
    known.length === 1 ? 'Edit song info' : `Edit ${fmtCount(known.length, 'song', 'songs')}`,
    t && `${t.title} · ${t.artist}`
  )
}

// "Edit album…" on an album's page: the fields its songs share.
export async function albumForm(al: Album): Promise<EditForm | undefined> {
  const tags = await window.libraryApi.tagValues(al.trackIds)
  const known = al.trackIds.filter((id) => Object.hasOwn(tags, id))
  if (!known.length) return undefined
  return form(known, tags, albumFields, 'Edit album', `${al.title} · ${al.artist}`)
}

// A changed song as the list shows it.
export interface ChangedSong {
  id: string
  title: string
  artist: string
  albumId: string
  // "Year 1995 · Genre none" -> "Year 1996 · Genre Doom metal"
  from: string
  to: string
}

// What the library shows for a field now.
function shownText(f: TagField, t: Track, al: Album | undefined): string {
  switch (f) {
    case 'title':
      return t.title
    case 'artist':
      return t.artistTag ?? t.artist
    case 'album':
      return t.album
    case 'albumArtist':
      return al ? (al.artistTag ?? al.artist) : ''
    case 'year':
      return valueText(f, songYear(t, al))
    case 'genre':
      return (t.genre ?? []).join('; ')
    case 'no':
      return valueText(f, t.no)
    case 'disc':
      return valueText(f, t.disc)
  }
}

const said = (f: TagField, text: string): string => `${fieldLabels[f]} ${text || 'none'}`

// Every song Spindle changed, in library order.
export function changedSongs(): ChangedSong[] {
  const out: ChangedSong[] = []
  for (const al of files.albums)
    for (const id of al.trackIds) {
      const t = files.track(id)
      const was = t.fileTags
      if (!was) continue
      const fields = tagFields.filter((f) => was[f] !== undefined)
      out.push({
        id,
        title: t.title,
        artist: t.artist,
        albumId: al.id,
        from: fields.map((f) => said(f, valueText(f, was[f]!))).join(' · '),
        to: fields.map((f) => said(f, shownText(f, t, al))).join(' · ')
      })
    }
  return out
}

// Undo on one song of the list: back to its file's tags.
export function undoSong(id: string): void {
  const t = files.find(id)
  void send({ put: { [id]: null } }, () =>
    t ? `${t.title} shows its file's info again` : "The song shows its file's info again"
  )
}

// Undo all: every song shows its file's info again.
export function undoAll(): void {
  void send({ clear: true }, (n) =>
    n === 1
      ? "1 song shows its file's info again"
      : `${fmtCount(n, 'song', 'songs')} show their files' info again`
  )
}
