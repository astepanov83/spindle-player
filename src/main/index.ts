import { app, shell, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { WinChannel } from '../shared/ipc'
import { windowBackground } from '../shared/theme'

function currentBackground(): string {
  return nativeTheme.shouldUseDarkColors ? windowBackground.dark : windowBackground.light
}

function createWindow(): void {
  // Studio's size from specs/layout-templates.md. Per-template sizes come with ticket 005.
  const win = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 860,
    minHeight: 560,
    center: true,
    frame: false,
    show: false,
    backgroundColor: currentBackground(),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.on('maximize', () => win.webContents.send(WinChannel.maximized, true))
  win.on('unmaximize', () => win.webContents.send(WinChannel.maximized, false))

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.github.astepanov83.spindle')

  // F12 opens DevTools in dev, and Ctrl+R reload is blocked in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Keep the area outside the page (seen while resizing) in the right theme.
  nativeTheme.on('updated', () => {
    for (const win of BrowserWindow.getAllWindows()) win.setBackgroundColor(currentBackground())
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
