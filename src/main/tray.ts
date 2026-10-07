// The tray icon, its menu with the play controls (ticket 088), and whether
// minimize hides the window to it (ticket 048).
// See work/specs/window.md, "Tray".
import { execFile } from 'child_process'
import { app, Menu, nativeImage, Tray } from 'electron'
import icon from '../../resources/icon.png?asset'
import type { PlayControl, PlayState } from '../shared/ipc'

// The icon's size in points; a 2x copy is added for sharp screens.
function iconSize(platform: NodeJS.Platform): number {
  return platform === 'linux' ? 24 : 16
}

// A tray menu item, from the play state; makeTray turns them into Electron's.
export type TrayAction = PlayControl | 'show' | 'quit'
export type TrayItem =
  | { kind: 'text'; label: string }
  | { kind: 'do'; label: string; action: TrayAction; enabled: boolean }
  | { kind: 'line' }

// About what fits a tray menu on a small screen.
const lineMax = 40

// Cut by code points, so a cut never splits an emoji or a surrogate pair.
export function cut(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max
    ? text
    : chars
        .slice(0, max - 1)
        .join('')
        .trimEnd() + '…'
}

// "Title - Artist", or the title alone; '' when nothing plays.
export function songLine(state: PlayState | undefined): string {
  if (!state || state.nothing || !state.title) return ''
  return state.artist ? `${state.title} - ${state.artist}` : state.title
}

// Before the page has said what plays (loading, crashed, closed), only Show
// and Quit. Next and Previous follow the player bar: hidden when it hides
// them (a live item before it can step), disabled with nothing picked.
export function trayItems(state: PlayState | undefined): TrayItem[] {
  // Some Linux panels open this menu on a left click and never send 'click'.
  const end: TrayItem[] = [
    { kind: 'do', label: 'Show Spindle', action: 'show', enabled: true },
    { kind: 'line' },
    { kind: 'do', label: 'Quit', action: 'quit', enabled: true }
  ]
  if (!state) return end
  const can = !state.nothing
  const pause = state.live ? 'Stop' : 'Pause'
  const items: TrayItem[] = [
    { kind: 'text', label: cut(songLine(state), lineMax) || 'Nothing playing' },
    { kind: 'do', label: state.playing ? pause : 'Play', action: 'toggle', enabled: can }
  ]
  if (state.next) items.push({ kind: 'do', label: 'Next', action: 'next', enabled: can })
  if (state.previous)
    items.push({ kind: 'do', label: 'Previous', action: 'previous', enabled: can })
  return [...items, { kind: 'line' }, ...end]
}

// The icon's tooltip: the song, or the app's name when nothing plays.
export function trayTip(state: PlayState | undefined, appName: string): string {
  return cut(songLine(state), 200) || appName
}

// On Windows and Linux "&" marks the next letter as the menu's shortcut key,
// so "Simon & Garfunkel" would lose it. "&&" is a plain "&".
export function menuLabel(text: string, platform: NodeJS.Platform): string {
  return platform === 'darwin' ? text : text.replaceAll('&', '&&')
}

// What the page sends can't be trusted.
export function parsePlayState(raw: unknown): PlayState | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const text = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 500) : '')
  const flag = (v: unknown): boolean => v === true
  return {
    title: text(r.title),
    artist: text(r.artist),
    playing: flag(r.playing),
    live: flag(r.live),
    nothing: r.nothing !== false,
    next: flag(r.next),
    previous: flag(r.previous)
  }
}

export interface SpindleTray {
  // undefined: the page can't say what plays (crashed, closed)
  setState(state: PlayState | undefined): void
}

export function makeTray(show: () => void, control: (c: PlayControl) => void): SpindleTray {
  const full = nativeImage.createFromPath(icon)
  const size = iconSize(process.platform)
  const image = nativeImage.createEmpty()
  for (const scaleFactor of [1, 2]) {
    const png = full.resize({ width: size * scaleFactor, quality: 'best' }).toPNG()
    image.addRepresentation({ scaleFactor, buffer: png })
  }
  const tray = new Tray(image)
  const run = (a: TrayAction): void => {
    if (a === 'show') show()
    else if (a === 'quit') app.quit()
    else control(a)
  }
  // the page sends its state on every change it sees; most change nothing here
  let shown = ''
  const setState = (state: PlayState | undefined): void => {
    const items = trayItems(state)
    const tip = trayTip(state, app.getName())
    const key = JSON.stringify([items, tip])
    if (key === shown) return
    shown = key
    tray.setToolTip(tip)
    // Built anew: Electron doesn't promise that a label changed in a built menu shows.
    tray.setContextMenu(
      Menu.buildFromTemplate(
        items.map((i) =>
          i.kind === 'line'
            ? { type: 'separator' }
            : i.kind === 'text'
              ? { label: menuLabel(i.label, process.platform), enabled: false }
              : { label: i.label, enabled: i.enabled, click: () => run(i.action) }
        )
      )
    )
  }
  setState(undefined)
  // on Linux an "activation", which may not be a left click
  tray.on('click', show)
  // Windows only; Linux sends a middle click as another activation
  tray.on('middle-click', () => control('toggle'))
  return { setState }
}

// macOS keeps its normal minimize, to the Dock. On Linux a hidden window with
// no tray host to show the icon (GNOME without the AppIndicator extension)
// could not be brought back, so ask the session bus first.
export function hidesOnMinimize(
  platform: NodeJS.Platform,
  hasTrayHost: () => Promise<boolean>
): Promise<boolean> {
  if (platform === 'win32') return Promise.resolve(true)
  if (platform === 'linux') return hasTrayHost()
  return Promise.resolve(false)
}

// gdbus prints "(true,)" or "(false,)"
export function parseHasOwner(out: string): boolean {
  return out.trim() === '(true,)'
}

// Asked on each minimize: the host can start or stop while the app runs.
// No gdbus, no bus or no answer in 1s counts as no host.
export function hasTrayHost(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'gdbus',
      [
        'call',
        '--session',
        '--dest',
        'org.freedesktop.DBus',
        '--object-path',
        '/org/freedesktop/DBus',
        '--method',
        'org.freedesktop.DBus.NameHasOwner',
        'org.kde.StatusNotifierWatcher'
      ],
      { timeout: 1000 },
      (err, stdout) => resolve(!err && parseHasOwner(stdout))
    )
  })
}
