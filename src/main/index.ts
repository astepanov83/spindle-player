// first, so main's libuv pool is made at this size
import './pool-size'
import { promises as dns } from 'dns'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { app, BrowserWindow, nativeTheme, net, session } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  LibraryChannel,
  PlaybackChannel,
  PlaylistChannel,
  RadioChannel,
  SettingsChannel,
  WinChannel,
  type RadioCover,
  type RadioLogo,
  type RadioTitle
} from '../shared/ipc'
import { parseStation, type StationLogo } from '../shared/stations'
import metalOnlyLogoPath from '../../resources/metal-only.png?asset'
import { pageSettings } from '../shared/settings'
import { stopAllDecoders } from './library/decode'
import { handleProtocol, registerScheme } from './library/protocol'
import { LibraryService } from './library/service'
import { pageIpc } from './page-ipc'
import { findStreams } from './radio/find-streams'
import { fetchLogo } from './radio/logo-fetch'
import {
  keptLogos,
  metalOnlyLogo,
  needsBundledLogo,
  onLocalNetwork,
  sitePrefix,
  StationLogos
} from './radio/logos'
import { checkedFetch } from './radio/checked-fetch'
import { fetchSiteLogo } from './radio/site-icons'
import { PlayedStations } from './radio/play'
import { RadioBrowser, resolveMirrors } from './radio/radio-browser'
import { ResultLogos } from './radio/result-logos'
import { RadioHistoryStore, StationsStore } from './radio/stations-store'
import { RadioStreams, radioStream } from './radio/stream'
import { foundHashes, openSongCovers, SongCovers } from './radio/song-covers'
import { PlaylistFile, QueueFile } from './page-files'
import { SettingsStore } from './settings-store'
import { Splash } from './splash'
import { devRetryData, isDevRetry, takeLock } from './single-instance'
import { currentBackground, MainWindow } from './window'

let store: SettingsStore
let library: LibraryService
let playlists: PlaylistFile
let savedQueue: QueueFile
// 025 and 027 look stations up here and add heard titles to the history
let stations: StationsStore
let radioHistory: RadioHistoryStore
// stations played this run, saved or not; spindle://radio looks them up here
let played: PlayedStations
// station logos in the cover cache (ticket 030)
let logos: StationLogos
// Radio Browser search and click counts, and the logos of its results (ticket 029)
let radioBrowser: RadioBrowser
let resultLogos: ResultLogos
// the covers of songs playing on the radio (ticket 032)
let songCovers: SongCovers
let songCoverFile: ReturnType<typeof openSongCovers> | undefined
// counts searches, so only the newest one's rows get logos
let searches = 0
const radioStreams = new RadioStreams()
let main: MainWindow | null = null

registerScheme()

// Before anything reads or writes userData: one copy per user-data folder.
// Only the dev server waits, for the copy it just stopped to finish saving.
const devServer = is.dev && !!process.env['ELECTRON_RENDERER_URL']
const locked = takeLock(
  (retry) => app.requestSingleInstanceLock(retry ? devRetryData : undefined),
  devServer ? 10000 : 0
)
void locked.then((ok) => {
  if (ok) return
  console.warn('Spindle is already running with this user-data folder; showing that one.')
  app.quit()
})
// set once the files are read and the library started
let started = false
let quitting = false
app.on('before-quit', () => (quitting = true))

function createWindow(splash?: Splash): void {
  library.resume()
  main = new MainWindow(store)
  splash?.endWith(main)
  // a crashed page sends no pause; a reloaded one sends its state again
  main.win.webContents.on('render-process-gone', () => library.setPlaying(false))
  main.win.on('closed', () => {
    main = null
    // a hidden cover window would keep the app running with no window
    library.pause()
  })
}

function toPage(channel: string, data: unknown): void {
  if (main && !main.win.isDestroyed()) main.win.webContents.send(channel, data)
}

// A logo main made or dropped: into My stations (stations.json) for a saved
// station, into the copy kept for one from search, and to the page.
function setLogo(id: string, logo: StationLogo | undefined): void {
  stations.setLogo(id, logo)
  played.setLogo(id, logo)
  toPage(RadioChannel.logo, { id, logo } satisfies RadioLogo)
  library.coversKept()
}

// Only the app window's page may use these; see page-ipc.ts.
const page = pageIpc(() => (main && !main.win.isDestroyed() ? main.win.webContents : undefined))

function senderWindow(
  e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

page.on(WinChannel.minimize, (e) => senderWindow(e)?.minimize())
page.on(WinChannel.close, (e) => senderWindow(e)?.close())
page.on(WinChannel.toggleMaximize, (e) => {
  const win = senderWindow(e)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
page.handle(WinChannel.isMaximized, (e) => senderWindow(e)?.isMaximized() ?? false)

page.handle(SettingsChannel.load, () => pageSettings(store.get()))
page.on(SettingsChannel.save, (_, raw, toFile) => {
  const { before, next } = store.setFromPage(raw, toFile !== false)
  if (next.theme !== before.theme) nativeTheme.themeSource = next.theme
  if (next.template !== before.template) main?.applyTemplate(before.template, next.template)
  if (
    next.fetchCovers !== before.fetchCovers ||
    JSON.stringify(next.coverSources) !== JSON.stringify(before.coverSources)
  ) {
    // first, so the library process has the new setting before a song lookup
    library.setFetch(next.fetchCovers, next.coverSources)
    songCovers.settingChanged()
  }
})

page.handle(LibraryChannel.load, () => library.load())
page.handle(LibraryChannel.get, () => library.library())
page.handle(LibraryChannel.addFolder, (e) => library.addFolder(senderWindow(e)))
page.handle(LibraryChannel.addDropped, (_, paths) => library.addDropped(paths))
page.on(LibraryChannel.removeFolder, (_, path) => library.removeFolder(path))
page.on(LibraryChannel.rescan, () => library.scan(true))
page.on(LibraryChannel.setArtists, (_, changes) => library.setArtists(changes))

page.handle(PlaylistChannel.load, () => playlists.get())
page.on(PlaylistChannel.save, (_, raw) => playlists.setFromPage(raw))
page.handle(RadioChannel.stations, () => stations.list())
page.handle(RadioChannel.save, (_, raw) => {
  // A station played from search brings the logo, the streams and the choice
  // main has for it: the page's copy is from before the server answered.
  const list = stations.save(played.forSave(raw), (id) => played.lookup(id)?.logo)
  const saved = stations.get(parseStation(raw)?.id ?? '')
  // behind the answer; the page hears of the logo with radio:logo
  if (saved) void logos.update(saved, setLogo)
  library.coversKept()
  return list
})
page.handle(RadioChannel.remove, (_, id) => {
  const list = stations.remove(id)
  library.coversKept()
  return list
})
page.handle(RadioChannel.restore, (_, id) => {
  const list = stations.restore(id)
  library.coversKept()
  return list
})
page.handle(RadioChannel.move, (_, id, by) => stations.move(id, by))
page.handle(RadioChannel.choose, (_, id, url) => {
  // a station from search keeps it on main's copy
  if (typeof id === 'string' && typeof url === 'string') played.choose(id, url)
  return stations.choose(id, url)
})
// with the covers found for its songs, for the recent songs' rows
page.handle(RadioChannel.history, (_, id) =>
  typeof id === 'string'
    ? radioHistory.get(id).map((e) => {
        const cover = songCovers.known(e.title)
        return cover ? { ...e, cover } : e
      })
    : []
)
page.handle(RadioChannel.play, async (_, station) => {
  const known = await played.play(station)
  // the click is counted when a stream opens, behind the answer
  if (known) radioBrowser.played(known.id)
  return known
})
page.handle(RadioChannel.search, async (_, q) => {
  if (typeof q !== 'string') return { ok: true, stations: [] }
  const n = ++searches
  const found = await radioBrowser.search(q)
  if (!found.ok) return found
  if (n === searches) resultLogos.searched(found.stations)
  return played.searched(found.stations) ? { ...found, saved: stations.list() } : found
})
page.on(RadioChannel.stop, () => {
  radioStreams.stop()
  // a new connection sends its title again
  songCovers.stopped()
})
page.handle(RadioChannel.lastAnswer, (_, id) =>
  typeof id === 'string' ? radioStreams.lastAnswer(id) : undefined
)
page.handle(PlaybackChannel.loadQueue, () => savedQueue.get())
page.on(PlaybackChannel.saveQueue, (_, raw) => savedQueue.setFromPage(raw))
page.on(PlaybackChannel.savePlace, (_, raw) => savedQueue.setPlace(raw))
page.on(PlaybackChannel.savePlaying, (_, raw) => savedQueue.setPlaying(raw))
page.on(PlaybackChannel.playing, (_, playing) => library.setPlaying(playing === true))
page.on(PlaybackChannel.log, (_, text) => {
  if (typeof text === 'string') console.warn(text.slice(0, 1000))
})

// Another copy was started: it quits, and this one comes to the front.
app.on('second-instance', (_e, _argv, _cwd, data) => {
  // a window made now would close again with the app
  if (!started || quitting) return
  // a dev copy asking again while it waits for this one to quit
  if (isDevRetry(data)) return
  if (!main) {
    createWindow()
    return
  }
  const win = main.win
  if (win.isMinimized()) win.restore()
  // still loading: it shows itself when ready
  else if (!win.isVisible()) return
  win.show()
  win.focus()
})

void Promise.all([locked, app.whenReady()]).then(([ok]) => {
  if (!ok) return
  started = true
  // On, Chromium downloads a dictionary from Google at start; the app works
  // offline (decision 24) and has no text worth checking.
  session.defaultSession.setSpellCheckerEnabled(false)
  session.defaultSession.setSpellCheckerLanguages([])
  electronApp.setAppUserModelId('io.github.astepanov83.spindle')

  // Read before the window exists, so it opens at the saved template's size and theme.
  store = new SettingsStore()
  nativeTheme.themeSource = store.get().theme
  // Only at start: a window made again later (the dock, a second copy) is quick.
  const splash = new Splash()
  playlists = new PlaylistFile()
  savedQueue = new QueueFile()
  const userData = app.getPath('userData')
  stations = new StationsStore(join(userData, 'stations.json'))
  radioHistory = new RadioHistoryStore(
    join(userData, 'radio-history.json'),
    (id) => !!stations.get(id)
  )
  const radioFetch: typeof fetch = (url, init) => net.fetch(url as string, init)
  const radioLog = (text: string): void => console.warn(text)
  const radioAgent = `Spindle/${app.getVersion()}`
  // logos, homepages and finding streams: each redirect checked, local
  // addresses only for a local station
  const logoFetch = (privateOk: boolean): typeof fetch =>
    checkedFetch((o) => net.request(o), privateOk)
  // before the library starts, so its first prune keeps these covers
  const songFile = openSongCovers(
    join(userData, 'radio-covers.json'),
    radioHistory.titles(),
    Date.now(),
    radioLog
  )
  songCoverFile = songFile
  played = new PlayedStations(
    stations,
    (station) => {
      const privateOk = onLocalNetwork(station)
      return findStreams(station, {
        fetch: logoFetch(privateOk),
        log: radioLog,
        userAgent: radioAgent,
        privateOk
      })
    },
    radioLog,
    // not waited for: the stream matters more than the picture
    (station) => void logos.update(station, setLogo)
  )

  // Starts reading the index now, while the window loads.
  library = new LibraryService(
    store,
    toPage,
    (moves) => {
      // both, even when the first fails
      const lists = playlists.moveIds(moves)
      const queue = savedQueue.moveIds(moves)
      return lists && queue
    },
    join(__dirname, '../preload/covers.js'),
    // asked at once for the start data, before logos and songCovers are made
    () => [
      ...keptLogos(stations.list(), logos ? logos.keptThisRun() : new Set()),
      ...(songCovers ? songCovers.hashes() : foundHashes(songFile.map))
    ]
  )
  logos = new StationLogos({
    load: async (source, station) => {
      if (source === metalOnlyLogo) return new Uint8Array(await readFile(metalOnlyLogoPath))
      const privateOk = onLocalNetwork(station)
      const o = { fetch: logoFetch(privateOk), userAgent: radioAgent, privateOk }
      // a station with no logo, or one that failed: its homepage's icons (ticket 033)
      if (source.startsWith(sitePrefix)) return fetchSiteLogo(source.slice(sitePrefix.length), o)
      return fetchLogo(source, o)
    },
    cache: library.covers,
    kept: () => library.coversKept(),
    log: radioLog
  })
  // Metal Only's logo ships with the app: made at start from the file, so My
  // stations shows it before it is played (no request)
  for (const s of stations.list()) if (needsBundledLogo(s)) void logos.update(s, setLogo)
  songCovers = new SongCovers({
    // live: with settings.json unreadable, the page's choice still counts this run
    setting: () => ({ on: store.live().fetchCovers, sources: store.live().coverSources }),
    find: (q, signal) => library.songCover(q, signal),
    cache: library.covers,
    map: songFile.map,
    save: songFile.save,
    kept: () => library.coversKept(),
    send: (c) => toPage(RadioChannel.cover, c satisfies RadioCover),
    log: radioLog,
    now: Date.now
  })
  radioBrowser = new RadioBrowser({
    fetch: radioFetch,
    mirrors: () => resolveMirrors(dns),
    userAgent: radioAgent,
    log: radioLog,
    // a saved or played station keeps its id in search results
    known: (id) => !!played.lookup(id)
  })
  resultLogos = new ResultLogos({
    load: (url, signal) =>
      fetchLogo(url, { fetch: logoFetch(false), userAgent: radioAgent, signal }),
    log: radioLog
  })
  const radioRequest = (id: string, stream: string | null): Promise<Response> =>
    radioStream(id, stream, {
      lookup: (id) => played.lookup(id),
      fetch: radioFetch,
      onTitle: (stationId, title) => {
        const at = Date.now()
        // kept for any station played, not only saved ones
        radioHistory.add(stationId, title, at)
        toPage(RadioChannel.title, { stationId, title, at } satisfies RadioTitle)
        // after the title, so the page has it when the cover comes
        songCovers.heard(stationId, title, played.lookup(stationId)?.name ?? '')
      },
      log: radioLog,
      streams: radioStreams,
      userAgent: radioAgent,
      // the first stream to answer with audio after a play counts a Radio Browser click
      opened: (stationId, url) => void radioBrowser.opened(stationId, url)
    })
  handleProtocol(library, radioRequest, (id) => resultLogos.get(id))

  // F12 opens DevTools in dev, and Ctrl+R reload is blocked in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Keep the area outside the page (seen while resizing) in the right theme.
  // Fires for a change of the setting as well as of the OS theme.
  nativeTheme.on('updated', () => {
    for (const win of BrowserWindow.getAllWindows()) win.setBackgroundColor(currentBackground())
  })

  createWindow(splash)
  // After the first paint: read earlier, it shows software drawing before the GPU process is up.
  main!.win.once('ready-to-show', () => console.log('GPU:', app.getGPUFeatureStatus()))

  // macOS: the dock icon makes a new app window. The hidden cover window doesn't count.
  app.on('activate', () => {
    if (!main) createWindow()
  })
})

// Last chance to write a change still waiting for its delay. The library
// process saves on its own, so quitting waits for its answer (2s at most).
let libraryFlushed = false
app.on('will-quit', (e) => {
  // the page's requests end with it, but an ffmpeg must never outlive the app
  stopAllDecoders()
  store?.flushSync()
  playlists?.flushSync()
  savedQueue?.flushSync()
  stations?.flushSync()
  radioHistory?.flushSync()
  songCoverFile?.flushSync()
  if (!library || libraryFlushed) return
  e.preventDefault()
  void library.flush().then(() => {
    libraryFlushed = true
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
