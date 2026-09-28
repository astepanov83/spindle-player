// The app window: its size per template and what it remembers. See work/specs/window.md.
import { join } from 'path'
import { BrowserWindow, nativeTheme, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { TemplateId } from '../shared/layout'
import type { Size } from '../shared/settings'
import { templates } from '../shared/templates'
import { WinChannel } from '../shared/ipc'
import { windowBackground } from '../shared/theme'
import type { SettingsStore } from './settings-store'
import { blockNavigation, canOpenExternal } from './web-guard'
import { placeCentered, sizeFor } from './window-place'

export function currentBackground(): string {
  return nativeTheme.shouldUseDarkColors ? windowBackground.dark : windowBackground.light
}

// Resize events come many per second while dragging. Save once it stops.
const resizeQuietMs = 400

export class MainWindow {
  readonly win: BrowserWindow
  #resizeTimer: ReturnType<typeof setTimeout> | undefined
  // The size we set on a template switch. Not saved as the user's choice,
  // so a size cut down to a small screen doesn't replace the one they picked.
  #applied: Size | undefined

  constructor(readonly store: SettingsStore) {
    const s = store.get()
    const t = templates[s.template]
    const area = screen.getPrimaryDisplay().workArea
    // Centered on the screen, at the size this template had last time.
    const bounds = placeCentered(area, sizeFor(t, s.windowSizes), area, t)
    this.#applied = { width: bounds.width, height: bounds.height }

    this.win = new BrowserWindow({
      ...bounds,
      minWidth: t.window.minWidth,
      minHeight: t.window.minHeight,
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
    const win = this.win

    win.on('ready-to-show', () => win.show())
    win.on('maximize', () => win.webContents.send(WinChannel.maximized, true))
    win.on('unmaximize', () => win.webContents.send(WinChannel.maximized, false))
    win.on('resize', () => {
      clearTimeout(this.#resizeTimer)
      this.#resizeTimer = setTimeout(
        () => this.#rememberSize(this.store.get().template),
        resizeQuietMs
      )
    })
    win.on('close', () => this.#rememberSize(this.store.get().template))

    blockNavigation(win.webContents)
    win.webContents.setWindowOpenHandler((details) => {
      // file:, javascript:, custom schemes and the like never leave the app
      if (canOpenExternal(details.url)) void shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  #rememberSize(id: TemplateId): void {
    clearTimeout(this.#resizeTimer)
    const win = this.win
    // A maximized size is the screen's, not a choice for the template.
    if (win.isDestroyed() || win.isMaximized() || win.isMinimized() || win.isFullScreen()) return
    const [width, height] = win.getSize()
    if (this.#applied && this.#applied.width === width && this.#applied.height === height) return
    this.#applied = undefined
    this.store.setWindowSize(id, { width, height })
  }

  // Saves the size of the template we leave, then moves to the next one's
  // size around the same center, kept on the same screen.
  applyTemplate(from: TemplateId, to: TemplateId): void {
    this.#rememberSize(from)
    const win = this.win
    const t = templates[to]
    const maximized = win.isMaximized()
    // setBounds is ignored while maximized, so go back to the normal size first.
    const old = maximized ? win.getNormalBounds() : win.getBounds()
    if (maximized) win.unmaximize()
    const area = screen.getDisplayMatching(old).workArea
    const bounds = placeCentered(old, sizeFor(t, this.store.get().windowSizes), area, t)
    this.#applied = { width: bounds.width, height: bounds.height }
    // Minimum first, or a larger old minimum blocks shrinking.
    win.setMinimumSize(t.window.minWidth, t.window.minHeight)
    win.setBounds(bounds)
  }
}
