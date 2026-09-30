// The tray icon, and whether minimize hides the window to it (ticket 048).
// See work/specs/window.md, "Tray".
import { execFile } from 'child_process'
import { app, Menu, nativeImage, Tray } from 'electron'
import icon from '../../resources/icon.png?asset'

// The icon's size in points; a 2x copy is added for sharp screens.
function iconSize(platform: NodeJS.Platform): number {
  return platform === 'linux' ? 24 : 16
}

export function makeTray(show: () => void): Tray {
  const full = nativeImage.createFromPath(icon)
  const size = iconSize(process.platform)
  const image = nativeImage.createEmpty()
  for (const scaleFactor of [1, 2]) {
    const png = full.resize({ width: size * scaleFactor, quality: 'best' }).toPNG()
    image.addRepresentation({ scaleFactor, buffer: png })
  }
  const tray = new Tray(image)
  tray.setToolTip(app.getName())
  // Some Linux panels open this menu on a left click and never send 'click'.
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Spindle', click: show },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  // on Linux an "activation", which may not be a left click
  tray.on('click', show)
  return tray
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
