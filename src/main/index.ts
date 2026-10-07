// first, so main's libuv pool is made at this size
import './pool-size'
import { promises as dns } from 'dns'
import { join } from 'path'
import { app, BrowserWindow, nativeTheme, net, safeStorage, session, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  AiChannel,
  PlaybackChannel,
  PlaylistChannel,
  SettingsChannel,
  WinChannel
} from '../shared/ipc'
import { plugins as pluginList } from '../shared/plugins'
import { pageSettings } from '../shared/settings'
import { canOpenExternal } from '../shared/web-link'
import { callbackServer } from './ai/callback-server'
import { createProviders } from './ai/providers/list'
import { FileSecrets } from './ai/secrets'
import { aiPageCalls } from './ai/page-calls'
import { createAiService, type AiService } from './ai/service'
import { coverRoute, handleProtocol, registerScheme } from './protocol'
import { CoverCache } from './covers/cover-cache'
import { pageIpc } from './page-ipc'
import { Covers } from './covers/covers'
import { createPlugins } from './plugins/list'
import { oldIds } from './plugins/old-ids'
import type { MainPlugin, Route } from './plugins/types'
import type { IdMoves } from '../shared/id-moves'
import { PlaylistFile, QueueFile } from './page-files'
import { SettingsStore } from './settings-store'
import { Splash } from './splash'
import { devRetryData, isDevRetry, takeLock } from './single-instance'
import { parseCloseAnswer } from './close-ask'
import { hasTrayHost, hidesOnMinimize, makeTray, parsePlayState, type SpindleTray } from './tray'
import { currentBackground, MainWindow } from './window'

let store: SettingsStore
let playlists: PlaylistFile
let savedQueue: QueueFile
// each plugin owns its files, requests and IPC; this file only loops over them
let plugins: MainPlugin[] = []
let main: MainWindow | null = null
// the core's cover cache, for every plugin; made at start whatever is on
let coverCache: CoverCache | undefined
// language models for the plugins' tasks; made at start whatever is on
let ai: AiService | undefined
// kept here so it isn't garbage collected, which would remove the icon
let tray: SpindleTray | null = null

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
// set once the files are read and the plugins started
let started = false
let quitting = false
app.on('before-quit', () => (quitting = true))

function createWindow(splash?: Splash): void {
  coverCache?.allow()
  for (const p of plugins) p.windowOpened?.()
  main = new MainWindow(store)
  main.hideOnMinimize = () =>
    tray ? hidesOnMinimize(process.platform, hasTrayHost) : Promise.resolve(false)
  main.quitting = () => quitting
  splash?.endWith(main)
  // a crashed page sends no pause; a reloaded one sends its state again
  main.win.webContents.on('render-process-gone', () => {
    for (const p of plugins) p.playing?.(false)
    tray?.setState(undefined)
  })
  main.win.on('closed', () => {
    main = null
    tray?.setState(undefined)
    // a hidden cover window would keep the app running with no window
    coverCache?.shutDown()
    for (const p of plugins) p.windowClosed?.()
  })
}

// From the tray icon or a second copy of the app.
function showMain(): void {
  // a window made now would close again with the app
  if (!started || quitting) return
  if (main) main.bringBack()
  else createWindow()
}

function toPage(channel: string, data: unknown): void {
  if (main && !main.win.isDestroyed()) main.win.webContents.send(channel, data)
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
page.on(WinChannel.closeShown, () => main?.closeShown())
page.on(WinChannel.closeAnswer, (_, raw) => {
  const action = parseCloseAnswer(raw)
  if (action) main?.answerClose(action)
})

page.handle(SettingsChannel.load, () => pageSettings(store.get()))
page.on(SettingsChannel.save, (_, raw, toFile) => {
  const { before, next } = store.setFromPage(raw, toFile !== false)
  if (next.theme !== before.theme) nativeTheme.themeSource = next.theme
  if (next.template !== before.template) main?.applyTemplate(before.template, next.template)
  if (
    next.fetchCovers !== before.fetchCovers ||
    JSON.stringify(next.coverSources) !== JSON.stringify(before.coverSources)
  ) {
    // in list order: the song lookup has the new setting before another plugin asks it
    for (const p of plugins) p.coverSettingChanged?.()
  }
  for (const p of plugins)
    if (next.plugins[p.id] !== before.plugins[p.id]) p.setOn(next.plugins[p.id])
})

page.handle(PlaylistChannel.load, () => playlists.get())
page.on(PlaylistChannel.save, (_, raw) => playlists.setFromPage(raw))
page.handle(PlaybackChannel.loadQueue, () => savedQueue.get())
page.on(PlaybackChannel.saveQueue, (_, raw) => savedQueue.setFromPage(raw))
page.on(PlaybackChannel.savePlace, (_, raw) => savedQueue.setPlace(raw))
page.on(PlaybackChannel.savePlaying, (_, raw) => savedQueue.setPlaying(raw))
page.on(PlaybackChannel.playing, (_, playing) => {
  for (const p of plugins) p.playing?.(playing === true)
})
page.on(PlaybackChannel.state, (_, raw) => tray?.setState(parsePlayState(raw)))
page.on(PlaybackChannel.log, (_, text) => {
  if (typeof text === 'string') console.warn(text.slice(0, 1000))
})

// Another copy was started: it quits, and this one comes to the front.
app.on('second-instance', (_e, _argv, _cwd, data) => {
  // a dev copy asking again while it waits for this one to quit
  if (isDevRetry(data)) return
  showMain()
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
  playlists = new PlaylistFile(oldIds)
  savedQueue = new QueueFile(oldIds)
  const userData = app.getPath('userData')
  const log = (text: string): void => console.warn(text)
  coverCache = new CoverCache(join(userData, 'covers'), join(__dirname, '../preload/covers.js'))
  const covers = new Covers(coverCache)
  const routes = new Map<string, Route>([['cover', coverRoute(covers)]])
  const netFetch = ((url, init) => net.fetch(url as string, init)) as typeof fetch
  ai = createAiService({
    providers: createProviders(),
    tasks: pluginList.flatMap((p) => p.aiTasks ?? []),
    settings: { get: () => store.get().ai, set: (v) => store.setAi(v) },
    secrets: new FileSecrets(join(userData, 'ai-secrets.json'), safeStorage, log),
    fetch: netFetch,
    openExternal: (url) => {
      if (canOpenExternal(url)) void shell.openExternal(url)
    },
    callbackServer: () => callbackServer(),
    log
  })
  const aiCalls = aiPageCalls(ai)
  page.handle(AiChannel.load, () => ai!.state())
  page.on(AiChannel.act, (_, provider, id, actionId, value) =>
    aiCalls.act(provider, id, actionId, value)
  )
  page.on(AiChannel.setTask, (_, task, on) => aiCalls.setTask(task, on))
  page.on(AiChannel.setProvider, (_, id) => aiCalls.setProvider(id))
  ai.onState(() => toPage(AiChannel.state, ai!.state()))
  // made first: a plugin may open files now that another's start asks about (the cover prune)
  plugins = createPlugins({ userData, log })
  const ctx = {
    settings: store,
    userData,
    userAgent: `Spindle/${app.getVersion()}`,
    log,
    toPage,
    page,
    route: (host: string, handler: Route) => routes.set(host, handler),
    fetch: netFetch,
    request: (o: Electron.ClientRequestConstructorOptions) => net.request(o),
    dns,
    covers,
    ai: ai.client
  }
  for (const p of plugins)
    p.start({
      ...ctx,
      idsMoved: (moves: IdMoves) => {
        // both, even when the first fails
        const lists = playlists.moveIds(p.id, moves)
        const queue = savedQueue.moveIds(p.id, moves)
        return lists && queue
      }
    })
  // the saved value, as the plugins have only seen the setting at start
  for (const p of plugins) p.setOn(store.get().plugins[p.id])
  handleProtocol(routes)

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
  tray = makeTray(showMain, (c) => toPage(PlaybackChannel.control, c))
  // After the first paint: read earlier, it shows software drawing before the GPU process is up.
  main!.win.once('ready-to-show', () => console.log('GPU:', app.getGPUFeatureStatus()))

  // macOS: the dock icon makes a new app window. The hidden cover window doesn't count.
  app.on('activate', () => {
    if (!main) createWindow()
  })
})

// Last chance to write a change still waiting for its delay. Some plugins
// save on their own, so quitting waits for their answer (2s at most).
app.on('will-quit', (e) => {
  ai?.stop()
  store?.flushSync()
  playlists?.flushSync()
  savedQueue?.flushSync()
  for (const p of plugins) p.flushSync()
  const waits = plugins.flatMap((p) => p.flush?.() ?? [])
  if (!waits.length) return
  e.preventDefault()
  void Promise.all(waits).then(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
