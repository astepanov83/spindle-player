import { join } from 'path'
import { app, BrowserWindow, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import {
  LibraryChannel,
  PlaybackChannel,
  PlaylistChannel,
  SettingsChannel,
  WinChannel
} from '../shared/ipc'
import { pageSettings } from '../shared/settings'
import { handleProtocol, registerScheme } from './library/protocol'
import { LibraryService } from './library/service'
import { pageIpc } from './page-ipc'
import { PlaylistFile, QueueFile } from './page-files'
import { SettingsStore } from './settings-store'
import { currentBackground, MainWindow } from './window'

let store: SettingsStore
let library: LibraryService
let playlists: PlaylistFile
let savedQueue: QueueFile
let main: MainWindow | null = null

registerScheme()

function createWindow(): void {
  library.resume()
  main = new MainWindow(store)
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
page.on(LibraryChannel.rescan, () => library.scan())

page.handle(PlaylistChannel.load, () => playlists.get())
page.on(PlaylistChannel.save, (_, raw) => playlists.setFromPage(raw))
page.handle(PlaybackChannel.loadQueue, () => savedQueue.get())
page.on(PlaybackChannel.saveQueue, (_, raw) => savedQueue.setFromPage(raw))
page.on(PlaybackChannel.savePlace, (_, raw) => savedQueue.setPlace(raw))
page.on(PlaybackChannel.log, (_, text) => {
  if (typeof text === 'string') console.warn(text.slice(0, 1000))
})

app.whenReady().then(() => {
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

// Last chance to write a change still waiting for its delay.
app.on('will-quit', () => {
  store?.flushSync()
  playlists?.flushSync()
  savedQueue?.flushSync()
  library?.flushSync()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
