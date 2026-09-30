// The app window: its size per template and what it remembers. See work/specs/window.md.
import { join } from 'path'
import { BrowserWindow, nativeTheme, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { TemplateId } from '../shared/layout'
import { templates } from '../shared/templates'
import { WinChannel } from '../shared/ipc'
import { windowBackground } from '../shared/theme'
import type { SettingsStore } from './settings-store'
import { RestartBudget } from './library/restart'
import { blockNavigation, canOpenExternal } from './web-guard'
import { AppliedSize, placeCentered, placeSaved, sizeFor } from './window-place'

export function currentBackground(): string {
  return nativeTheme.shouldUseDarkColors ? windowBackground.dark : windowBackground.light
}

// Resize and move events come many per second while dragging. Save once it stops.
const resizeQuietMs = 400

export class MainWindow {
  readonly win: BrowserWindow
  #resizeTimer: ReturnType<typeof setTimeout> | undefined
  #moveTimer: ReturnType<typeof setTimeout> | undefined
  // The size we set on a template switch. Not saved as the user's choice,
  // so a size cut down to a small screen doesn't replace the one they picked,
  // and neither is the window manager's rounding of it.
  #applied = new AppliedSize()
  // when the last resize came
  #resizedAt = -Infinity
  // a page that keeps crashing is loaded again a few times, not forever
  #reloads = new RestartBudget(3, 60000)
  // ms to wait before showing, so the start banner doesn't flicker (splash.ts)
  showDelay: () => number = () => 0

  constructor(readonly store: SettingsStore) {
    const s = store.get()
    const t = templates[s.template]
    const size = sizeFor(t, s.windowSizes)
    const areas = screen.getAllDisplays().map((d) => d.workArea)
    const area = screen.getPrimaryDisplay().workArea
    // Where it was last time, at the size this template had; the first time,
    // or when that screen is gone, centered on the main screen.
    const bounds =
      (s.windowPlace && placeSaved(s.windowPlace, size, areas, t)) ??
      placeCentered(area, size, area, t)
    this.#applied.set(bounds, Date.now())

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

    win.on('ready-to-show', () => {
      setTimeout(() => {
        if (win.isDestroyed()) return
        // the window manager may change the size as the window is first shown
        this.#applied.settle(Date.now())
        // bounds above are the normal size, so un-maximizing goes back to them
        if (s.windowPlace?.maximized) win.maximize()
        win.show()
      }, this.showDelay())
    })
    // A crashed page leaves a blank window; load it again. Main has the
    // settings, playlists and queue, so little is lost.
    win.webContents.on('render-process-gone', (_, d) => {
      console.error(`The app page stopped (${d.reason})`)
      if (d.reason === 'clean-exit' || win.isDestroyed()) return
      if (this.#reloads.take(Date.now())) win.webContents.reload()
      else console.error('The app page stopped too often; not loading it again')
    })
    win.on('maximize', () => {
      win.webContents.send(WinChannel.maximized, true)
      this.#rememberPlace()
    })
    win.on('unmaximize', () => {
      win.webContents.send(WinChannel.maximized, false)
      this.#rememberPlace()
    })
    win.on('move', () => {
      clearTimeout(this.#moveTimer)
      this.#moveTimer = setTimeout(() => this.#rememberPlace(), resizeQuietMs)
    })
    win.on('resize', () => {
      this.#resizedAt = Date.now()
      clearTimeout(this.#resizeTimer)
      this.#resizeTimer = setTimeout(() => {
        this.#rememberSize(this.store.live().template)
        // a resize from the left or top edge moves the corner too
        this.#rememberPlace()
      }, resizeQuietMs)
    })
    win.on('close', () => {
      this.#rememberSize(this.store.live().template)
      this.#rememberPlace()
    })

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
    const size = this.#applied.userSize({ width, height }, this.#resizedAt)
    if (size) this.store.setWindowSize(id, size)
  }

  // One place for all templates: the top-left corner, of the normal size
  // when maximized. A minimized or full screen window keeps the last one.
  #rememberPlace(): void {
    clearTimeout(this.#moveTimer)
    const win = this.win
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
    const maximized = win.isMaximized()
    const { x, y } = maximized ? win.getNormalBounds() : win.getBounds()
    this.store.setWindowPlace({ x, y, maximized })
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
    this.#applied.set(bounds, Date.now())
    // Minimum first, or a larger old minimum blocks shrinking.
    win.setMinimumSize(t.window.minWidth, t.window.minHeight)
    win.setBounds(bounds)
  }
}
