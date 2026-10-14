// A desktop notification when the song changes (ticket 126). The page says
// when and what (stores/song-notice.ts); main skips it while the window is in
// front and keeps one at a time. See work/specs/window.md, "Song notification".
import { Notification, nativeImage, type BrowserWindow } from 'electron'
import icon from '../../resources/icon.png?asset'
import type { SongNotice } from '../shared/ipc'
import { isCoverHash } from './covers/cover-names'

// a notification shows a few lines at most; this only stops a huge string
const textMax = 500

export function parseSongNotice(raw: unknown): SongNotice | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || !r.title || typeof r.body !== 'string') return undefined
  const n: SongNotice = { title: r.title.slice(0, textMax), body: r.body.slice(0, textMax) }
  if (typeof r.cover === 'string' && coverHash(r.cover)) n.cover = r.cover
  return n
}

// The small cover's hash: it is made at scan time, so it is on disk, and
// 320px is plenty for a notification. Nothing else is read.
export function coverHash(url: string): string | undefined {
  const m = /^spindle:\/\/cover\/small\/([^/?#]+)$/.exec(url)
  return m && isCoverHash(m[1]) ? m[1] : undefined
}

export interface WindowNow {
  visible: boolean
  minimized: boolean
  focused: boolean
}

// The user is looking at the window, so it already shows the song.
export function inFront(w: WindowNow | undefined): boolean {
  return !!w && w.visible && !w.minimized && w.focused
}

export interface Shown {
  close(): void
}

export interface NotifyIo {
  supported(): boolean
  // the setting
  on(): boolean
  window(): WindowNow | undefined
  show(notice: SongNotice): Shown
}

export class SongNotify {
  // kept so a click still reaches it (and Electron doesn't collect it), and
  // closed when the next one comes
  #last: Shown | undefined

  constructor(readonly io: NotifyIo) {}

  supported(): boolean {
    return this.io.supported()
  }

  song(raw: unknown): void {
    const n = parseSongNotice(raw)
    if (!n || !this.io.supported() || !this.io.on() || inFront(this.io.window())) return
    this.#last?.close()
    this.#last = this.io.show(n)
  }
}

// Electron's notifications. `click` brings the window to the front.
export function makeSongNotify(o: {
  on: () => boolean
  window: () => BrowserWindow | undefined
  coverPath: (hash: string) => string
  click: () => void
}): SongNotify {
  return new SongNotify({
    supported: () => Notification.isSupported(),
    on: o.on,
    window: () => {
      const w = o.window()
      return w && !w.isDestroyed()
        ? { visible: w.isVisible(), minimized: w.isMinimized(), focused: w.isFocused() }
        : undefined
    },
    show: (notice) => {
      const hash = notice.cover && coverHash(notice.cover)
      const cover = hash ? nativeImage.createFromPath(o.coverPath(hash)) : undefined
      const n = new Notification({
        title: notice.title,
        body: notice.body,
        icon: cover && !cover.isEmpty() ? cover : nativeImage.createFromPath(icon),
        silent: true,
        // Windows: the same tag replaces the last one in the Action Center too
        id: 'song'
      })
      n.on('click', o.click)
      n.show()
      return n
    }
  })
}
