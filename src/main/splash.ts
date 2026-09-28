// The start banner: the record and the Ring bars, shown until the app window
// is ready. See work/specs/window.md.
import { join } from 'path'
import { BrowserWindow, nativeTheme, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { blockNavigation } from './web-guard'
import { endSplashWith, showWait } from './splash-end'
import type { MainWindow } from './window'

// Must match the canvas in splash.html.
const SIZE = 280
// once shown, the banner stays up this long, or it looks like a flicker
const MIN_MS = 1000

export class Splash {
  readonly #win: BrowserWindow
  #shownAt: number | undefined
  #ended = false

  constructor() {
    const area = screen.getPrimaryDisplay().workArea
    this.#win = new BrowserWindow({
      width: SIZE,
      height: SIZE,
      x: Math.round(area.x + (area.width - SIZE) / 2),
      y: Math.round(area.y + (area.height - SIZE) / 2),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      // the app window takes focus when it shows; the banner never should
      focusable: false,
      show: false,
      // the window manager keeps a splash above and undecorated
      ...(process.platform === 'linux' ? { type: 'splash' } : {}),
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const win = this.#win
    win.once('ready-to-show', () => {
      if (this.#ended) return
      this.#shownAt = Date.now()
      win.showInactive()
    })
    blockNavigation(win.webContents)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    // bars in the colors of the app's theme
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html?theme=${theme}`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/splash.html'), { query: { theme } })
    }
  }

  // Closes once the app window shows, or can't. The app window waits for
  // the banner's minimum time.
  endWith(app: MainWindow): void {
    app.showDelay = () => {
      // ready before the banner even showed: no banner at all
      this.#ended = true
      return showWait(this.#shownAt, Date.now(), MIN_MS)
    }
    endSplashWith(app.win, app.win.webContents, () => {
      this.#ended = true
      if (!this.#win.isDestroyed()) this.#win.close()
    })
  }
}
