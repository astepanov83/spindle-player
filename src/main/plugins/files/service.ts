// Main's side of the library. The library process owns the index and does the
// heavy work; main passes messages on, runs the folder dialog, and makes covers.
// The bookkeeping (replies, the scan asked for, the status) is in library-client.ts.
import { stat } from 'fs/promises'
import { join } from 'path'
import { app, dialog, shell, utilityProcess, type BrowserWindow } from 'electron'
import { LibraryChannel, type DropResult } from '../../../shared/plugins/files/ipc'
import type { IdMoves } from '../../../shared/id-moves'
import type { ScanStatus } from '../../../shared/library'
import { parseChanges } from '../../../shared/plugins/files/artist-edit'
import { artistGroupsTask } from '../../../shared/plugins/files/artists-file'
import type { AiClient } from '../../../shared/ai'
import type { CoverSource } from '../../../shared/settings'
import type { Lyrics } from '../../../shared/lyrics'
import type { SongFileInfo } from '../../../shared/plugins/files/song-info'
import { ffmpegTool } from '../../ffmpeg-path'
import type { SettingsStore } from '../../settings-store'
import type { CoverCache } from '../../covers/cover-cache'
import { addFolders, droppedPaths, pathKind, sortPaths } from './dropped'
import { looseParts, type OpenedSongs } from '../../../shared/plugins/files/loose'
import { AiRequests } from './ai-messages'
import { LibraryClient } from './library-client'
import { MissingWatch, hasEntries } from './missing-watch'
import { LibraryProcess } from './library-process'
import { RestartBudget } from '../../restart'
import libraryProcessPath from './library-worker?modulePath'
import type { MediaInfo, WorkerIn, WorkerOut } from './types'

// At quit, main waits this long at most for the library process to save the index.
const flushWaitMs = 2000
// Its own libuv pool: listings, stats and reads at once, plus room for lookups.
const libraryPoolSize = '8'

export class LibraryService {
  // the bundled decoders; without them APE, WMA and the like don't play
  readonly ffmpeg = ffmpegTool('ffmpeg')
  readonly ffprobe = ffmpegTool('ffprobe')
  // sent with every online request
  readonly userAgent = `Spindle/${app.getVersion()} (https://github.com/astepanov83/spindle-player)`
  #proc: LibraryProcess
  #client: LibraryClient
  #playing = false
  // device of the last audio file the page opened
  #playingDev: number | undefined
  // the page asked for the library once; the first scan waits for that
  #pageLoaded = false
  // the window closed: no scans until a page asks for the library again
  #paused = false
  // scans again when a music folder that was not found is back
  #watch: MissingWatch
  // Music files is on. Off: no scans, no changes to the folders or artist
  // names, no audio and no covers made from the music files. The library is
  // still read and given to the page, and the radio's song lookup goes on.
  #on: boolean
  // AiClient.on and AiClient.enabled of this plugin's tasks, as last sent to
  // the library process
  #aiOn: Record<string, boolean>
  #aiEnabled: Record<string, boolean>
  // the library process's AiClient calls, made here where the key is
  #aiRequests: AiRequests
  // Files the page may ask about as songs not in the library (ticket 124):
  // those opened this run, and those main's files held at start. The page
  // can't name any other path.
  #loose = new Set<string>()

  constructor(
    readonly store: SettingsStore,
    readonly send: (channel: string, data: unknown) => void,
    // track ids that changed: main renames them in its playlists and queue
    // files and writes them before it returns
    // (false when a write failed, so the library process keeps the map)
    readonly idsMoved: (moves: IdMoves) => boolean,
    // the core's: pictures found in music files and online go in it
    readonly covers: CoverCache,
    // covers other plugins keep that the index does not know (station logos), for the prune
    readonly keepCovers: () => string[] = () => [],
    readonly dir = app.getPath('userData'),
    on = true,
    // the AI service, for the library process's tasks (ticket 068)
    readonly ai?: AiClient
  ) {
    this.#on = on
    this.#aiOn = this.#tasksOn()
    this.#aiEnabled = this.#tasksEnabled()
    // the library process only gets messages, so it is told when on() or
    // enabled() changes
    ai?.changed(() => this.#aiChanged())
    this.#aiRequests = new AiRequests(ai, [artistGroupsTask], (m) => this.#post(m))
    if (!this.ffmpeg || !this.ffprobe)
      console.error(
        'ffmpeg or ffprobe not found (npm run fetch-ffmpeg); APE, WMA and the like will not play'
      )
    this.#watch = new MissingWatch({
      hasEntries,
      scan: () => this.scan(false),
      canScan: () => this.#on && this.#pageLoaded && !this.#paused
    })
    this.#client = new LibraryClient({
      post: (m) => this.#post(m),
      send: (s) => {
        this.send(LibraryChannel.status, s)
        this.#watch.update(s)
      },
      folders: () => this.store.get().folders,
      canScan: store.readable,
      idsMoved: (moves) => {
        // the page renames them too, as the library with the new ids comes
        this.send(LibraryChannel.idsMoved, moves)
        return this.idsMoved(moves)
      }
    })
    this.#proc = new LibraryProcess(
      () =>
        utilityProcess.fork(libraryProcessPath, [], {
          serviceName: 'Spindle library',
          env: { ...process.env, UV_THREADPOOL_SIZE: libraryPoolSize }
        }),
      () => ({
        indexPath: join(this.dir, 'library.json'),
        coversDir: this.covers.dir,
        folders: this.store.get().folders,
        ffprobe: this.ffprobe,
        aliases: this.#client.aliases,
        // live: with settings.json unreadable, the page's choice still counts this run
        fetch: { on: this.store.live().fetchCovers, sources: this.store.live().coverSources },
        fetchedPath: join(this.dir, 'fetched-covers.json'),
        artistsPath: join(this.dir, 'artists.json'),
        aiCachePath: join(this.dir, 'artist-ai-cache.json'),
        oldOverridesPath: join(this.dir, 'artist-overrides.json'),
        oldGroupsPath: join(this.dir, 'artist-groups.json'),
        aiOn: this.#aiOn,
        aiEnabled: this.#aiEnabled,
        userAgent: this.userAgent,
        keepCovers: this.keepCovers(),
        on: this.#on
      }),
      // a library process that dies is started again a few times, then left dead
      new RestartBudget(3, 60000),
      {
        message: (m) => this.#onMessage(m),
        exit: (code, after) => {
          this.#aiRequests.stopAll()
          this.#client.onExit(code, after)
        },
        // a new process starts at full speed; tell it if a song is playing
        started: () => {
          if (this.#playing) this.#sendPlaying()
          this.#client.onStarted()
        }
      },
      flushWaitMs
    )
    this.#proc.start()
  }

  #tasksOn(): Record<string, boolean> {
    return { [artistGroupsTask]: this.ai?.on(artistGroupsTask) ?? false }
  }

  #tasksEnabled(): Record<string, boolean> {
    return { [artistGroupsTask]: this.ai?.enabled(artistGroupsTask) ?? false }
  }

  #aiChanged(): void {
    const on = this.#tasksOn()
    const enabled = this.#tasksEnabled()
    const same = (a: Record<string, boolean>, b: Record<string, boolean>): boolean =>
      Object.entries(a).every(([t, v]) => b[t] === v)
    if (same(on, this.#aiOn) && same(enabled, this.#aiEnabled)) return
    this.#aiOn = on
    this.#aiEnabled = enabled
    this.#post({ type: 'ai-on', tasks: on, enabled })
  }

  #post(m: WorkerIn): boolean {
    // the client is made first, so the process may not exist yet
    return this.#proc?.post(m) ?? false
  }

  #onMessage(m: WorkerOut): void {
    if (this.#client.onMessage(m) || this.#aiRequests.onMessage(m)) return
    switch (m.type) {
      case 'library':
        // JSON bytes the page parses; main never reads them
        this.send(LibraryChannel.changed, m.bytes)
        break
      case 'cover':
        void (
          m.paletteOnly ? this.covers.palette(m.hash, m.data) : this.covers.add(m.hash, m.data)
        ).then((done) => this.#post({ type: 'cover-done', hash: m.hash, ...done }))
        break
      case 'log':
        console.info(m.text)
        break
    }
  }

  // The whole library as it is now, for a page that missed a patch. Fails
  // when there is none, so the page keeps what it shows.
  library(): Promise<Uint8Array> {
    return this.#client.wholeLibrary()
  }

  // The library as it is now, for the page's first paint or a reload.
  async load(): Promise<{ library: Uint8Array; status: ScanStatus; moves: IdMoves }> {
    const library = await this.#client.library()
    this.#paused = false
    // after the reply is on its way, so the scan doesn't delay the first paint
    if (!this.#pageLoaded) {
      this.#pageLoaded = true
      setTimeout(() => this.scan(false), 0)
    }
    // every id map of the run: one sent at start may have come before the page listened
    return { library, status: this.#client.status, moves: this.#client.aliases }
  }

  // A scan already running stops; what it read stays. Files that failed last
  // time are read again only on a manual Rescan (retryFailed).
  scan(retryFailed: boolean): void {
    if (this.#on) this.#client.scan(retryFailed)
  }

  get on(): boolean {
    return this.#on
  }

  // Turned on again: a scan as at start (once the page has asked for the library).
  setOn(on: boolean): void {
    if (on === this.#on) return
    this.#on = on
    if (!on) this.#client.forget()
    this.#post({ type: 'set-on', on })
    if (on && this.#pageLoaded) this.scan(false)
  }

  // The app window closed: no more scanning until a new one opens, so nothing
  // keeps the app running with no window (the core shuts the cover cache).
  pause(): void {
    this.setPlaying(false)
    this.#paused = true
    this.#watch.stop()
    this.#client.stop()
  }

  // The page's play state: while a song plays from a disk being scanned, the
  // scan slows down.
  setPlaying(playing: boolean): void {
    if (playing === this.#playing) return
    this.#playing = playing
    this.#sendPlaying()
  }

  // The page opened an audio file on this device (st_dev).
  mediaOpened(dev: number): void {
    if (dev === this.#playingDev) return
    this.#playingDev = dev
    if (this.#playing) this.#sendPlaying()
  }

  #sendPlaying(): void {
    this.#post({ type: 'playing', playing: this.#playing, dev: this.#playingDev })
  }

  // keepCovers() changed. A process started later gets it with its start data.
  coversKept(): void {
    this.#post({ type: 'keep-covers', hashes: this.keepCovers() })
  }

  // The online cover lookup setting changed.
  setFetch(on: boolean, sources: Record<CoverSource, boolean>): void {
    this.#post({ type: 'fetch-covers', on, sources })
  }

  resume(): void {
    // the online lookup was held when the window closed (macOS keeps the app)
    this.#post({ type: 'resume' })
  }

  async addFolder(win: BrowserWindow | null): Promise<void> {
    // the list would change in memory only (the page greys the button out too)
    if (!this.store.readable || !this.#on) return
    const options: Electron.OpenDialogOptions = {
      title: 'Add music folder',
      buttonLabel: 'Add',
      properties: ['openDirectory', 'multiSelections']
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (r.canceled || !r.filePaths.length) return
    this.#setFolders([...this.store.get().folders, ...r.filePaths])
  }

  // Files and folders dropped on the window (tickets 047 and 124).
  addDropped(paths: unknown): Promise<DropResult> {
    const list = droppedPaths(paths)
    if (!this.#on || !list) return Promise.resolve({ added: [], known: 0, other: 0 })
    return this.openPaths(list)
  }

  // Files and folders dropped or given by the system ("Open with", ticket
  // 124): folders that exist become music folders, songs are read.
  async openPaths(paths: unknown[]): Promise<DropResult> {
    if (!this.#on) return { added: [], known: 0, other: 0, off: true }
    const { dirs, songs, other } = await sortPaths(paths, (p) => pathKind(p, stat))
    const r: DropResult = { ...addFolders(dirs, this.store, (f) => this.#setFolders(f)), other }
    if (!songs.length) return r
    for (const p of songs) this.#loose.add(p)
    const opened = await this.#open(songs, false)
    if (opened?.ids.length) r.songs = { ids: opened.ids, loose: opened.loose }
    r.other += opened ? (opened.gone?.length ?? 0) : songs.length
    return r
  }

  // Loose ids main's files held at start (see #loose).
  allowLoose(ids: Iterable<string>): void {
    for (const id of ids) {
      const p = looseParts(id)
      if (p) this.#loose.add(p.path)
    }
  }

  // Songs not in the library the page has keys of. An id main doesn't know
  // is gone, as its file may be. Rejects when the library process gave no
  // answer, so the page asks again later.
  async loose(ids: unknown): Promise<OpenedSongs> {
    const list = Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string').slice(0, 1000)
      : []
    const known = (id: string): boolean => {
      const p = looseParts(id)
      return !!p && this.#loose.has(p.path)
    }
    const gone = list.filter((id) => !known(id))
    const asked = list.filter(known)
    if (!asked.length) return { ids: [], loose: [], gone }
    if (!this.#on) throw new Error('Music files is off')
    const opened = await this.#open(asked, true)
    if (!opened) throw new Error('The library process gave no answer')
    gone.push(...(opened.gone ?? []))
    return { ...opened, gone }
  }

  #open(items: string[], loose: boolean): Promise<OpenedSongs | undefined> {
    return this.#client.ask({ type: 'open', items, loose }).then((r) => r.opened)
  }

  // A song not in the library in the file manager, by its loose id.
  async showFile(id: unknown): Promise<boolean> {
    const p = typeof id === 'string' ? looseParts(id) : undefined
    if (!this.#on || !p || !this.#loose.has(p.path)) return false
    try {
      await stat(p.path)
    } catch {
      return false
    }
    shell.showItemInFolder(p.path)
    return true
  }

  removeFolder(path: unknown): void {
    if (!this.store.readable || !this.#on) return
    const folders = this.store.get().folders
    if (typeof path !== 'string' || !folders.includes(path)) return
    this.#setFolders(folders.filter((f) => f !== path))
  }

  // The status carries the list the settings sheet shows. It is set here too,
  // since a process that is gone for good sends no more status.
  #setFolders(folders: string[]): void {
    // turned off while the folder dialog or the disk was asked
    if (!this.#on) return
    this.store.setFolders(folders)
    this.#client.setStatus({ folders: this.store.get().folders })
    this.scan(false)
  }

  // The page renamed or split artists; checked here, since the page can't be trusted.
  setArtists(changes: unknown): void {
    const c = this.#on && parseChanges(changes)
    if (c) this.#post({ type: 'set-artists', changes: c })
  }

  // The page asked for a full check of the artist names; main has no state for it.
  aiRecheck(): void {
    if (this.#on) this.#post({ type: 'ai-recheck' })
  }

  // Only files in the index are served, by id; never a path from the page.
  async mediaInfo(id: string): Promise<MediaInfo | undefined> {
    if (!this.#on) return undefined
    return (await this.#client.ask({ type: 'find-track', id })).media
  }

  // A song's words from its .lrc or tags (ticket 120), by id like its audio.
  async lyrics(id: string, signal?: AbortSignal): Promise<Lyrics | undefined> {
    if (!this.#on) return undefined
    return (await this.#client.ask({ type: 'lyrics', id }, signal)).lyrics
  }

  // The song info panel's look at a song's file (ticket 127), by id.
  async songInfo(id: unknown): Promise<SongFileInfo | undefined> {
    if (!this.#on || typeof id !== 'string') return undefined
    return (await this.#client.ask({ type: 'song-info', id })).info
  }

  // Where a song's file is, or a CUE track's sheet, from the index.
  async songPath(id: unknown, sheet: boolean): Promise<string | undefined> {
    if (!this.#on || typeof id !== 'string') return undefined
    return (await this.#client.ask({ type: 'song-path', id, sheet })).path
  }

  // A radio song's cover from the online lookup (ticket 032): the picture,
  // not found, or later (a failure, the setting off, or stopped by `signal`).
  async songCover(
    q: { artist: string; song: string },
    signal: AbortSignal
  ): Promise<Uint8Array | 'none' | 'later'> {
    const r = await this.#client.ask({ type: 'song-cover', ...q }, signal)
    if (r.song === 'found' && r.data) return r.data
    return r.song === 'none' ? 'none' : 'later'
  }

  // The picture a cover hash was made from, to make the large size.
  async coverSource(hash: string): Promise<Uint8Array | undefined> {
    if (!this.#on) return undefined
    return (await this.#client.ask({ type: 'cover-source', hash })).data
  }

  // Quitting: lets the library process write the index, waiting a short while
  // at most (see LibraryProcess).
  flush(): Promise<void> {
    return this.#proc.flush()
  }
}
