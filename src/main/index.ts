// first, so main's libuv pool is made at this size
import './pool-size'
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
import { keptLogos, metalOnlyLogo, StationLogos } from './radio/logos'
import { PlayedStations } from './radio/play'
import { RadioHistoryStore, StationsStore } from './radio/stations-store'
import { RadioStreams, radioStream } from './radio/stream'
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
  )
    library.setFetch(next.fetchCovers, next.coverSources)
})

page.handle(LibraryChannel.load, () => library.load())
page.handle(LibraryChannel.get, () => library.library())
page.handle(LibraryChannel.addFolder, (e) => library.addFolder(senderWindow(e)))
page.on(LibraryChannel.removeFolder, (_, path) => library.removeFolder(path))
page.on(LibraryChannel.rescan, () => library.scan(true))
page.on(LibraryChannel.setArtists, (_, changes) => library.setArtists(changes))

page.handle(PlaylistChannel.load, () => playlists.get())
page.on(PlaylistChannel.save, (_, raw) => playlists.setFromPage(raw))
page.handle(RadioChannel.stations, () => stations.list())
page.handle(RadioChannel.save, (_, raw) => {
  const list = stations.save(raw)
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
page.handle(RadioChannel.move, (_, id, by) => stations.move(id, by))
page.handle(RadioChannel.choose, (_, id, url) => stations.choose(id, url))
page.handle(RadioChannel.history, (_, id) => (typeof id === 'string' ? radioHistory.get(id) : []))
page.handle(RadioChannel.play, (_, station) => played.play(station))
page.on(RadioChannel.stop, () => radioStreams.stop())
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
  played = new PlayedStations(
    stations,
    (station) => findStreams(station, { fetch: radioFetch, log: radioLog }),
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
    // asked at once for the start data, before logos is made
    () => keptLogos(stations.list(), logos ? logos.keptThisRun() : new Set())
  )
  logos = new StationLogos({
    load: async (source) =>
      source === metalOnlyLogo
        ? new Uint8Array(await readFile(metalOnlyLogoPath))
        : fetchLogo(source, { fetch: radioFetch, userAgent: radioAgent }),
    cache: library.covers,
    kept: () => library.coversKept(),
    log: radioLog
  })
  handleProtocol(library, (id, stream) =>
    radioStream(id, stream, {
      lookup: (id) => played.lookup(id),
      fetch: radioFetch,
      onTitle: (stationId, title) => {
        const at = Date.now()
        // kept for any station played, not only saved ones
        radioHistory.add(stationId, title, at)
        toPage(RadioChannel.title, { stationId, title, at } satisfies RadioTitle)
      },
      log: radioLog,
      streams: radioStreams,
      userAgent: radioAgent
    })
  )

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
