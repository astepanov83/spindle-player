// Which edit form is open (ticket 129).
import { describe, expect, it } from 'vitest'
import { editSongs } from './edit-songs.svelte'
import { notice } from '../stores/notice.svelte'
import type { EditForm } from '../plugins/types'

const form = (title: string): EditForm => ({ title, fields: [], save: () => {} })

describe('editSongs', () => {
  it('opens the form once it comes, and drops one asked for before a newer one', async () => {
    let first!: (f: EditForm) => void
    const slow = editSongs.open(new Promise((r) => (first = r)))
    await editSongs.open(Promise.resolve(form('Edit album')))
    expect(editSongs.form?.title).toBe('Edit album')
    first(form('Edit song info'))
    await slow
    expect(editSongs.form?.title).toBe('Edit album')
    editSongs.close()
    expect(editSongs.form).toBeNull()
  })

  it('says so when there is no form, and a form that comes after Close is dropped', async () => {
    await editSongs.open(Promise.resolve(undefined))
    expect(notice.text).toBe("Couldn't read the song info")
    let late!: (f: EditForm) => void
    const p = editSongs.open(new Promise((r) => (late = r)))
    editSongs.close()
    late(form('Edit song info'))
    await p
    expect(editSongs.form).toBeNull()
  })
})
