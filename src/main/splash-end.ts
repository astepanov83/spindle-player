// When the start banner goes away. Kept apart from splash.ts so it can be
// tested without Electron.

interface Emitter {
  once(event: string, fn: () => void): unknown
}

// The app window showing ends the banner. So does anything that means it
// won't show soon: the window closed, or its page stopped (a reloaded page
// shows the window later, with no banner).
export function endSplashWith(win: Emitter, page: Emitter, close: () => void): void {
  let done = false
  const end = (): void => {
    if (done) return
    done = true
    close()
  }
  win.once('show', end)
  win.once('closed', end)
  page.once('render-process-gone', end)
}

// How long the app window waits before it shows, so a banner that showed
// stays up at least `min` ms: gone sooner, it looks like a flicker. A banner
// that hasn't shown yet is skipped, not shown late.
export function showWait(shownAt: number | undefined, now: number, min: number): number {
  return shownAt === undefined ? 0 : Math.max(0, shownAt + min - now)
}
