// Files dropped on the window, and files and folders the system gave the app
// ("Open with", the command line; ticket 124). Main checks each path and
// says what came of it: folders become music folders (ticket 047), songs go
// to the queue.
import type { DropResult } from '../../../../shared/plugins/files/ipc'
import { dropText } from './scan-text'
import { loose } from './loose.svelte'
import { notice } from '../../stores/notice.svelte'
import type { OpenSongs } from '../types'

// the core's, from the plugin's start (start.ts)
let openTo: OpenSongs | undefined

export function setOpenTo(f: OpenSongs): void {
  openTo = f
}

// The songs first, so a notice about folders is the one left to read.
export function takeOpened(r: DropResult, how: 'play' | 'add'): void {
  const songs = r.songs
  if (songs) {
    loose.add(songs.loose)
    openTo?.(songs.ids, how)
  }
  const text = dropText(r)
  if (text) notice.show(text)
}

export function filesDrop(dropped: File[]): void {
  void window.libraryApi.addDropped(dropped).then((r) => takeOpened(r, 'add'))
}
