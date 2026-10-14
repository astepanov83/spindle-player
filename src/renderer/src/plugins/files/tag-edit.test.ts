// Editing songs' info inside Spindle (ticket 129): the forms, what Save
// sends, and the list of changed songs with Undo, over a made-up library.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Album, LibraryData, TagValues, Track } from '../../../../shared/library'
import { defaultPalettes } from '../../../../shared/palette'
import type { FixesBefore, SongTags, TagChange } from '../../../../shared/plugins/files/tag-fixes'
import type { Block, HeadBlock } from '../types'

const api = {
  tagValues: vi.fn<(ids: string[]) => Promise<Record<string, SongTags>>>(async () => ({})),
  fixTags: vi.fn<(c: TagChange) => Promise<FixesBefore | undefined>>(async () => ({}))
}
vi.stubGlobal('window', {
  libraryApi: api,
  radioApi: { onTitle: () => () => {}, onLogo: () => () => {}, onCover: () => () => {} }
})

let files: typeof import('./store.svelte').files
let library: typeof import('../../stores/library.svelte').library
let edit: typeof import('./tag-edit')
let notice: typeof import('../../stores/notice.svelte').notice

const tags = (more: Partial<TagValues> = {}): TagValues => ({
  title: 'Lucid',
  artist: 'Kai',
  album: 'Blue Hours',
  albumArtist: '',
  year: 1995,
  genre: ['Ambient'],
  no: 1,
  disc: 0,
  ...more
})

const album = (id: string, trackIds: string[], extra: Partial<Album> = {}): Album => ({
  id,
  title: 'Blue Hours',
  artist: 'Kai',
  year: 1995,
  added: 0,
  palette: defaultPalettes,
  cover: '',
  coverLarge: '',
  trackIds,
  ...extra
})

const track = (id: string, albumId: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: `Song ${id}`,
  duration: 120,
  albumId,
  artist: 'Kai',
  album: 'Blue Hours',
  no: 1,
  disc: 1,
  codec: '',
  folder: 0,
  ...extra
})

function lib(): LibraryData {
  return {
    albums: [album('a', ['a1', 'a2']), album('b', ['b1'], { title: 'Tide', year: 2001 })],
    tracks: [
      track('a1', 'a', { year: 1996, genre: ['Doom Metal'], fileTags: { year: 1995, genre: [] } }),
      track('a2', 'a', { no: 2 }),
      track('b1', 'b', { album: 'Tide', title: 'Glass', fileTags: { title: '' } })
    ],
    folders: [{ name: '/m', parent: -1 }]
  }
}

beforeEach(async () => {
  vi.resetModules()
  api.tagValues.mockClear()
  api.fixTags.mockClear()
  files = (await import('./store.svelte')).files
  library = (await import('../../stores/library.svelte')).library
  edit = await import('./tag-edit')
  notice = (await import('../../stores/notice.svelte')).notice
  files.load(lib())
})

describe('a field across songs', () => {
  it("shows the songs' value, or Several values when they differ", () => {
    const one = edit.editField('year', [{ now: tags(), file: tags() }])
    expect(one).toEqual({ id: 'year', label: 'Year', value: '1995', max: 9999 })
    const two = edit.editField('genre', [
      { now: tags(), file: tags() },
      { now: tags({ genre: ['Rock, Metal'] }), file: tags() }
    ])
    expect(two).toMatchObject({ value: '', placeholder: 'Several values' })
    // no number is an empty box
    expect(edit.editField('disc', [{ now: tags(), file: tags() }]).value).toBe('')
  })

  it("offers the file's own value where Spindle changed the field", () => {
    const f = edit.editField('year', [{ now: tags({ year: 1996 }), file: tags() }])
    expect(f.file).toEqual({ text: '1995', label: 'In the file: 1995' })
    const none = edit.editField('genre', [{ now: tags(), file: tags({ genre: [] }) }])
    expect(none.file).toEqual({ text: '', label: 'In the file: none' })
    const several = edit.editField('year', [
      { now: tags({ year: 2000 }), file: tags() },
      { now: tags({ year: 2000 }), file: tags({ year: 1990 }) }
    ])
    expect(several).toMatchObject({
      value: '2000',
      file: { text: '', label: 'The files have other values' }
    })
    // the same value as the file: nothing to go back to
    expect(edit.editField('title', [{ now: tags(), file: tags() }]).file).toBeUndefined()
  })

  it('shows genres as the library splits them, joined by ;', () => {
    expect(edit.valueText('genre', ['Rock, Metal', 'Jazz'])).toBe('Rock; Metal; Jazz')
    expect(edit.textValue('genre', ' Doom metal ;; Stoner rock ')).toEqual([
      'Doom metal',
      'Stoner rock'
    ])
    expect(edit.textValue('year', '')).toBe(0)
    expect(edit.textValue('year', '19x6')).toBeUndefined()
    expect(edit.textValue('no', '10000')).toBeUndefined()
    expect(edit.textValue('title', '  Lucid ')).toBe('Lucid')
  })
})

describe('Save', () => {
  it('sends only the fields typed into and those put back', () => {
    expect(edit.tagEdit(['a1', 'a2'], { year: '1996', genre: null, title: '' })).toEqual({
      edit: { ids: ['a1', 'a2'], set: { year: 1996, title: '' }, reset: ['genre'] }
    })
    expect(edit.tagEdit(['a1'], { year: 'soon' })).toBeUndefined()
  })

  it('edits one song with every field, its file value beside a changed one', async () => {
    api.tagValues.mockResolvedValueOnce({ a1: { now: tags({ year: 1996 }), file: tags() } })
    const form = (await edit.songsForm(['a1']))!
    expect(api.tagValues).toHaveBeenCalledWith(['a1'])
    expect(form.title).toBe('Edit song info')
    expect(form.sub).toBe('Song a1 · Kai')
    expect(form.note).toBe(edit.keptNote)
    expect(form.fields.map((f) => [f.label, !!f.wide])).toEqual([
      ['Title', true],
      ['Artist', false],
      ['Album artist', false],
      ['Album', true],
      ['Genre', true],
      ['Year', false],
      ['Track', false],
      ['Disc', false]
    ])
    expect(form.fields.find((f) => f.id === 'year')?.file?.text).toBe('1995')
  })

  it('edits several songs and says how many changed, with an Undo that puts back what they had', async () => {
    api.tagValues.mockResolvedValueOnce({
      a1: { now: tags(), file: tags() },
      a2: { now: tags({ no: 2 }), file: tags({ no: 2 }) }
    })
    const form = (await edit.songsForm(['a1', 'a2', 'gone']))!
    expect(form.title).toBe('Edit 2 songs')
    expect(form.sub).toBeUndefined()
    expect(form.fields.find((f) => f.id === 'no')).toMatchObject({
      value: '',
      placeholder: 'Several values'
    })
    api.fixTags.mockResolvedValueOnce({ a1: { year: 1990 }, a2: null })
    form.save({ genre: 'Doom metal' })
    expect(api.fixTags).toHaveBeenLastCalledWith({
      edit: { ids: ['a1', 'a2'], set: { genre: ['Doom metal'] }, reset: [] }
    })
    await vi.waitFor(() => expect(notice.text).toBe('Changed 2 songs'))
    notice.press()
    expect(api.fixTags).toHaveBeenLastCalledWith({ put: { a1: { year: 1990 }, a2: null } })
  })

  it('says nothing when nothing changed', async () => {
    api.tagValues.mockResolvedValueOnce({ a1: { now: tags(), file: tags() } })
    const form = (await edit.songsForm(['a1']))!
    api.fixTags.mockResolvedValueOnce({})
    form.save({ year: '1995' })
    await Promise.resolve()
    expect(notice.text).toBe('')
  })

  it('has no form for songs main does not know', async () => {
    expect(await edit.songsForm(['gone'])).toBeUndefined()
    expect(edit.canEditSongs(['a1', 'b1'])).toBe(true)
    expect(edit.canEditSongs(['a1', 'gone'])).toBe(false)
    expect(edit.canEditSongs([])).toBe(false)
    // a song opened from outside the library (ticket 124)
    expect(edit.canEditSongs(['/m/a.flac'])).toBe(false)
  })

  it("edits an album's shared fields, and its page follows its songs to their new album", async () => {
    api.tagValues.mockResolvedValueOnce({
      a1: { now: tags(), file: tags() },
      a2: { now: tags(), file: tags() }
    })
    const form = (await edit.albumForm(files.album('a')))!
    expect(form.title).toBe('Edit album')
    expect(form.sub).toBe('Blue Hours · Kai')
    expect(form.fields.map((f) => f.id)).toEqual(['album', 'albumArtist', 'genre', 'year'])
    const { keepFiles } = await import('./nav')
    library.setTabs([{ id: 'albums', keep: keepFiles, plugin: 'files' }])
    library.openPage('albums', 'album/a')
    form.save({ album: 'Tide' })
    expect(api.fixTags).toHaveBeenLastCalledWith({
      edit: { ids: ['a1', 'a2'], set: { album: 'Tide' }, reset: [] }
    })
    // the library comes back with the songs on album b
    const next = lib()
    next.albums = [album('b', ['a1', 'a2', 'b1'], { title: 'Tide' })]
    next.tracks = next.tracks.map((t) => ({ ...t, albumId: 'b' }))
    files.load(next)
    expect(library.page('albums')).toBe('album/b')
  })
})

describe('the changed songs', () => {
  it("lists each changed song with its file's values and what shows now", () => {
    expect(edit.changedSongs()).toEqual([
      {
        id: 'a1',
        title: 'Song a1',
        artist: 'Kai',
        albumId: 'a',
        from: 'Year 1995 · Genre none',
        to: 'Year 1996 · Genre Doom Metal'
      },
      {
        id: 'b1',
        title: 'Glass',
        artist: 'Kai',
        albumId: 'b',
        from: 'Title none',
        to: 'Title Glass'
      }
    ])
  })

  it('has a page with Undo per song and Undo all, each with its own Undo', async () => {
    const page = await import('./page')
    const blocks: Block[] = page.filesPage('albums', 'song-changes', '')
    const head = blocks[0] as HeadBlock
    expect(head).toMatchObject({
      title: 'Song info changes',
      buttons: [{ id: 'undo-all', label: 'Undo all' }]
    })
    const list = blocks[1]
    expect(list.kind === 'changes' && list.rows.map((r) => [r.key, r.from, r.action.hint])).toEqual(
      [
        ['a1', 'Year 1995 · Genre none', 'Undo the change to Song a1'],
        ['b1', 'Title none', 'Undo the change to Glass']
      ]
    )
    api.fixTags.mockResolvedValueOnce({ b1: { title: 'Glass' } })
    page.filesAct('song-changes', 'undo-song', 'b1')
    expect(api.fixTags).toHaveBeenLastCalledWith({ put: { b1: null } })
    await vi.waitFor(() => expect(notice.text).toBe("Glass shows its file's info again"))
    notice.press()
    expect(api.fixTags).toHaveBeenLastCalledWith({ put: { b1: { title: 'Glass' } } })
    api.fixTags.mockResolvedValueOnce({ a1: { year: 1996 }, b1: { title: 'Glass' } })
    page.filesAct('song-changes', 'undo-all')
    expect(api.fixTags).toHaveBeenLastCalledWith({ clear: true })
    await vi.waitFor(() => expect(notice.text).toBe("2 songs show their files' info again"))
  })

  it('says so on the page and in Settings when there are none', async () => {
    const none = lib()
    none.tracks = none.tracks.map((t) => ({ ...t, fileTags: undefined }))
    files.load(none)
    const page = await import('./page')
    expect(page.filesPage('albums', 'song-changes', '').map((b) => b.kind)).toEqual([
      'head',
      'empty'
    ])
    const { filesSettings } = await import('./settings')
    const blocks = filesSettings()
    const at = blocks.findIndex((b) => b.kind === 'title' && b.text === 'Song info changes')
    expect(blocks[at + 1]).toMatchObject({ kind: 'status' })
    expect(blocks[at + 2]?.kind).not.toBe('button')
  })

  it('counts them in Settings, with See the changes and Undo all, which asks first', async () => {
    const { filesSettings, filesActSetting } = await import('./settings')
    const blocks = filesSettings()
    const at = blocks.findIndex((b) => b.kind === 'title' && b.text === 'Song info changes')
    expect(blocks.slice(at + 1, at + 4)).toMatchObject([
      { kind: 'status', text: '2 songs changed with Edit song info. Your files stay as they are.' },
      { kind: 'button', id: 'see-changes', label: 'See the changes' },
      { kind: 'button', id: 'undo-changes', label: 'Undo all', confirm: expect.any(String) }
    ])
    filesActSetting('see-changes', 'press')
    expect([library.tab, library.page('albums')]).toEqual(['albums', 'song-changes'])
    filesActSetting('undo-changes', 'press')
    expect(api.fixTags).toHaveBeenLastCalledWith({ clear: true })
  })
})
