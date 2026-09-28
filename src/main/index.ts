// first, so main's libuv pool is made at this size
import './pool-size'
import { join } from 'path'
import { app, BrowserWindow, nativeTheme } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  LibraryChannel,
  PlaybackChannel,
  PlaylistChannel,
  SettingsChannel,
  WinChannel
} from '../shared/ipc'
import { pageSettings } from '../shared/settings'
import { stopAllDecoders } from './library/decode'
import { handleProtocol, registerScheme } from './library/protocol'
import { LibraryService } from './library/service'
import { pageIpc } from './page-ipc'
import { PlaylistFile, QueueFile } from './page-files'
import { SettingsStore } from './settings-store'
import { devRetryData, isDevRetry, takeLock } from './single-instance'
import { currentBackground, MainWindow } from './window'

let store: SettingsStore
let library: LibraryService
let playlists: PlaylistFile
let savedQueue: QueueFile
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

function createWindow(): void {
  library.resume()
  main = new MainWindow(store)
  // a crashed page sends no pause; a reloaded one sends its state again
  main.win.webContents.on('render-process-gone', () => library.setPlaying(false))
  main.win.on('closed', () => {
    main = null
    // a hidden cover window would keep the app running with no window
    library.pause()
  })
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
page.on(SettingsChannel.save, (_, raw) => {
  const before = store.get()
  const next = store.setFromPage(raw)
  if (next.theme !== before.theme) nativeTheme.themeSource = next.theme
  if (next.template !== before.template) main?.applyTemplate(before.template, next.template)
})

page.handle(LibraryChannel.load, () => library.load())
page.handle(LibraryChannel.addFolder, (e) => library.addFolder(senderWindow(e)))
page.on(LibraryChannel.removeFolder, (_, path) => library.removeFolder(path))
page.on(LibraryChannel.rescan, () => library.scan(true))

page.handle(PlaylistChannel.load, () => playlists.get())
page.on(PlaylistChannel.save, (_, raw) => playlists.setFromPage(raw))
page.handle(PlaybackChannel.loadQueue, () => savedQueue.get())
page.on(PlaybackChannel.saveQueue, (_, raw) => savedQueue.setFromPage(raw))
page.on(PlaybackChannel.savePlace, (_, raw) => savedQueue.setPlace(raw))
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
  electronApp.setAppUserModelId('io.github.astepanov83.spindle')

  // Read before the window exists, so it opens at the saved template's size and theme.
  store = new SettingsStore()
  nativeTheme.themeSource = store.get().theme
  playlists = new PlaylistFile()
  savedQueue = new QueueFile()

  // Starts reading the index now, while the window loads.
  library = new LibraryService(
    store,
    (channel, data) => {
      if (main && !main.win.isDestroyed()) main.win.webContents.send(channel, data)
    },
    join(__dirname, '../preload/covers.js')
  )
  handleProtocol(library)

  // F12 opens DevTools in dev, and Ctrl+R reload is blocked in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Keep the area outside the page (seen while resizing) in the right theme.
  // Fires for a change of the setting as well as of the OS theme.
  nativeTheme.on('updated', () => {
    for (const win of BrowserWindow.getAllWindows()) win.setBackgroundColor(currentBackground())
  })

  createWindow()

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
