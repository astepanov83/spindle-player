// The app window: its size per template and what it remembers. See work/specs/window.md.
import { join } from 'path'
import { app, BrowserWindow, nativeTheme, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { TemplateId } from '../shared/layout'
import { templates } from '../shared/templates'
import { WinChannel } from '../shared/ipc'
import { windowBackground } from '../shared/theme'
import type { SettingsStore } from './settings-store'
import { closeStep } from './close-ask'
import { RestartBudget } from './restart'
import { blockNavigation, canOpenExternal } from './web-guard'
import {
  AppliedSize,
  anyWidth,
  applyWindowKind,
  mostOn,
  normalOn,
  placeCentered,
  placeStart,
  placeToSave,
  pointerOver,
  settleMs,
  sizeFor,
  type Rect
} from './window-place'

export function currentBackground(): string {
  return nativeTheme.shouldUseDarkColors ? windowBackground.dark : windowBackground.light
}

// Resize and move events come many per second while dragging. Save once it stops.
const resizeQuietMs = 400
// A page that doesn't say it shows the close question by then is stuck, and
// the window closes anyway.
const askWaitMs = 1000
// How often Mini looks where the pointer is: its controls show while it is
// on the bar. Short, so they follow the pointer with no seen lag.
const pointerMs = 30

export class MainWindow {
  readonly win: BrowserWindow
  #resizeTimer: ReturnType<typeof setTimeout> | undefined
  #moveTimer: ReturnType<typeof setTimeout> | undefined
  // The size we set on a template switch. Not saved as the user's choice,
  // so a size cut down to a small screen doesn't replace the one they picked,
  // and neither is the window manager's rounding of it.
  #applied = new AppliedSize()
  // Until then, maximize and unmaximize come from our own template switch,
  // not the user, so they are not saved.
  #switchedUntil = -Infinity
  // when the last resize came
  #resizedAt = -Infinity
  // a page that keeps crashing is loaded again a few times, not forever
  #reloads = new RestartBudget(3, 60000)
  // ms to wait before showing, so the start banner doesn't flicker (splash.ts)
  showDelay: () => number = () => 0
  // whether minimize hides the window to the tray (tray.ts)
  hideOnMinimize: () => Promise<boolean> = () => Promise.resolve(false)
  // hidden by minimize, not still loading
  #inTray = false
  // true while the app quits (index.ts), so closing asks nothing
  quitting: () => boolean = () => false
  // the close was decided, so the next one goes through
  #closeNow = false
  #askTimer: ReturnType<typeof setTimeout> | undefined
  // the pointer was on the bar at the last look (Mini)
  #pointerIn = false
  // The last bounds of the window while neither maximized, minimized nor full
  // screen. Kept here, as getNormalBounds() makes one up for a window that
  // was maximized before it was first shown (the start).
  #normal: Rect

  constructor(readonly store: SettingsStore) {
    const s = store.get()
    const t = templates[s.template]
    const size = sizeFor(t, s.windowSizes)
    const areas = screen.getAllDisplays().map((d) => d.workArea)
    const area = screen.getPrimaryDisplay().workArea
    // Where it was last time, at the size this template had; the first time,
    // or when that screen is gone, centered on the main screen. A window
    // maximized at start opens on the screen it was maximized on.
    const maximized = !!s.windowMaximized[s.template] && !t.window.maxHeight
    const bounds = placeStart(s.windowPlace, size, areas, area, t, maximized)
    this.#applied.set(bounds, Date.now())
    this.#normal = bounds

    this.win = new BrowserWindow({
      ...bounds,
      minWidth: t.window.minWidth,
      minHeight: t.window.minHeight,
      ...(t.window.maxHeight ? { maxWidth: anyWidth, maxHeight: t.window.maxHeight } : {}),
      alwaysOnTop: !!t.window.onTop && s.miniOnTop,
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

    const watch = setInterval(() => this.#watchPointer(), pointerMs)
    win.on('closed', () => clearInterval(watch))
    // a page loaded again knows nothing yet: say it again when the pointer is on
    win.webContents.on('did-finish-load', () => (this.#pointerIn = false))

    win.on('ready-to-show', () => {
      // Known only once the GPU process is up. Without a GPU, blurs and
      // animations are drawn on the CPU, so the page leaves some out.
      win.webContents.send(
        WinChannel.noGpu,
        !app.getGPUFeatureStatus().gpu_compositing.startsWith('enabled')
      )
      setTimeout(() => {
        if (win.isDestroyed()) return
        // the window manager may change the size as the window is first shown
        this.#applied.settle(Date.now())
        // bounds above are the normal size, so un-maximizing goes back to them
        if (s.windowMaximized[s.template] && !t.window.maxHeight) win.maximize()
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
      // A bar (Mini) is never maximized: a double click on it, or the window
      // manager's maximize, asks for the big layout instead.
      if (this.#isBar()) {
        win.unmaximize()
        if (!this.#switching()) win.webContents.send(WinChannel.wantsBig)
        return
      }
      win.webContents.send(WinChannel.maximized, true)
      this.#rememberMaximized(true)
      this.#rememberPlace()
    })
    win.on('unmaximize', () => {
      // Linux sends this when a maximized window is minimized (or hidden to
      // the tray), though it comes back maximized. Saving it would open the
      // app not maximized after a quit from the tray.
      if (this.#isBar() || win.isMinimized()) return
      win.webContents.send(WinChannel.maximized, false)
      this.#rememberMaximized(false)
      this.#rememberPlace()
    })
    win.on('minimize', () => {
      void this.hideOnMinimize().then((hide) => {
        // it may have been brought back while we asked
        if (!hide || win.isDestroyed() || !win.isMinimized()) return
        this.#inTray = true
        win.hide()
      })
    })
    win.on('show', () => (this.#inTray = false))
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
    // A right click on a drag area. Mini has no title bar, so the whole bar is
    // one, and the page shows its own menu there (Windows and Linux).
    win.on('system-context-menu', (e) => {
      if (templates[this.store.live().template].titleBar !== false) return
      e.preventDefault()
      win.webContents.send(WinChannel.contextMenu)
    })
    // Windows logging off closes windows with no quit first
    win.on('session-end', () => (this.#closeNow = true))
    win.on('close', (e) => {
      const page = win.webContents
      const step = closeStep(this.store.live().closeAction, {
        closing: this.#closeNow || this.quitting(),
        pageUp: !page.isLoading() && !page.isCrashed()
      })
      if (step === 'close') {
        clearTimeout(this.#askTimer)
        this.#rememberSize(this.store.live().template)
        this.#rememberPlace()
        return
      }
      e.preventDefault()
      if (step === 'ask') this.#askClose()
      else this.answerClose(step)
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

  // From the tray or a second copy: back on screen and in front. A window
  // still loading is left to show itself.
  bringBack(): void {
    const win = this.win
    if (win.isDestroyed()) return
    if (!win.isVisible() && !this.#inTray && !win.isMinimized()) return
    win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
  }

  // The question must be seen, so a minimized window comes back first.
  #askClose(): void {
    const win = this.win
    if (!win.isVisible()) win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
    clearTimeout(this.#askTimer)
    this.#askTimer = setTimeout(() => this.#close(), askWaitMs)
    win.webContents.send(WinChannel.askClose)
  }

  // The page shows the question; now it may take as long as the user does.
  closeShown(): void {
    clearTimeout(this.#askTimer)
  }

  // From the page's question, or the setting. Quit ends the app on macOS too.
  answerClose(action: 'minimize' | 'quit'): void {
    clearTimeout(this.#askTimer)
    if (this.win.isDestroyed()) return
    if (action === 'minimize') this.win.minimize()
    else app.quit()
  }

  #close(): void {
    if (this.win.isDestroyed()) return
    this.#closeNow = true
    this.win.close()
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

  // Mini shows its controls while the pointer is on it. Its bar is a drag
  // area, which gets no hover in the page, so main looks for it.
  #watchPointer(): void {
    const win = this.win
    if (win.isDestroyed()) return
    const on =
      this.#isBar() &&
      win.isVisible() &&
      !win.isMinimized() &&
      pointerOver(screen.getCursorScreenPoint(), win.getBounds())
    if (on === this.#pointerIn) return
    this.#pointerIn = on
    win.webContents.send(WinChannel.pointerIn, on)
  }

  #isBar(): boolean {
    return !!templates[this.store.live().template].window.maxHeight
  }

  // The pin in Mini, from the page's settings.
  applyOnTop(): void {
    const s = this.store.live()
    if (!this.win.isDestroyed()) applyWindowKind(this.win, templates[s.template], s.miniOnTop)
  }

  #switching(): boolean {
    return Date.now() < this.#switchedUntil
  }

  #rememberMaximized(on: boolean): void {
    if (!this.#switching()) this.store.setWindowMaximized(this.store.live().template, on)
  }

  // One place for all templates: the top-left corner, of the normal size
  // when maximized. A minimized or full screen window keeps the last one.
  #rememberPlace(): void {
    clearTimeout(this.#moveTimer)
    const win = this.win
    if (win.isDestroyed()) return
    const w = {
      maximized: win.isMaximized(),
      minimized: win.isMinimized(),
      fullScreen: win.isFullScreen(),
      bounds: win.getBounds(),
      normal: this.#normal
    }
    if (!w.maximized && !w.minimized && !w.fullScreen) this.#normal = w.bounds
    const place = placeToSave(w)
    if (place) this.store.setWindowPlace(place)
  }

  // Saves the size and maximized state of the template we leave, then moves
  // to the next one's size around the same center, kept on the same screen,
  // and maximizes it there if it was left maximized.
  applyTemplate(from: TemplateId, to: TemplateId): void {
    this.#rememberSize(from)
    const win = this.win
    const t = templates[to]
    const maximized = win.isMaximized()
    // right after a switch the window may not have its new state yet; a bar
    // is never maximized
    if (!this.#switching() && !templates[from].window.maxHeight)
      this.store.setWindowMaximized(from, maximized)
    // setBounds is ignored while maximized, so go back to the normal size
    // first. The normal bounds stay on the screen it is maximized on.
    const areas = screen.getAllDisplays().map((d) => d.workArea)
    const now = win.getBounds()
    const maxArea = maximized ? mostOn(now, areas) : undefined
    const old = maxArea ? normalOn(this.#normal, maxArea, areas, t) : maximized ? this.#normal : now
    if (maximized) win.unmaximize()
    const area = screen.getDisplayMatching(old).workArea
    const bounds = placeCentered(old, sizeFor(t, this.store.get().windowSizes), area, t)
    this.#applied.set(bounds, Date.now())
    // Limits first, or an old minimum blocks shrinking and Mini's most height growing.
    applyWindowKind(win, t, this.store.live().miniOnTop)
    win.setBounds(bounds)
    this.#normal = bounds
    this.#switchedUntil = Date.now() + settleMs
    // after setBounds, so un-maximizing goes back to this template's size
    if (this.store.get().windowMaximized[to] && !t.window.maxHeight) win.maximize()
  }
}
