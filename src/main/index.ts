import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { SettingsChannel, WinChannel } from '../shared/ipc'
import { pageSettings } from '../shared/settings'
import { SettingsStore } from './settings-store'
import { currentBackground, MainWindow } from './window'

let store: SettingsStore
let main: MainWindow | null = null

function createWindow(): void {
  main = new MainWindow(store)
  main.win.on('closed', () => (main = null))
}

function senderWindow(
  e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

ipcMain.on(WinChannel.minimize, (e) => senderWindow(e)?.minimize())
ipcMain.on(WinChannel.close, (e) => senderWindow(e)?.close())
ipcMain.on(WinChannel.toggleMaximize, (e) => {
  const win = senderWindow(e)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.handle(WinChannel.isMaximized, (e) => senderWindow(e)?.isMaximized() ?? false)

ipcMain.handle(SettingsChannel.load, () => pageSettings(store.get()))
ipcMain.on(SettingsChannel.save, (_, raw: unknown) => {
  const before = store.get()
  const next = store.setFromPage(raw)
  if (next.theme !== before.theme) nativeTheme.themeSource = next.theme
  if (next.template !== before.template) main?.applyTemplate(before.template, next.template)
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.github.astepanov83.spindle')

  // Read before the window exists, so it opens at the saved template's size and theme.
  store = new SettingsStore()
  nativeTheme.themeSource = store.get().theme

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Last chance to write a change still waiting for its delay.
app.on('will-quit', () => store?.flushSync())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
