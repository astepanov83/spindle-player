// Keeps the app's pages where they are: no navigation away from the app page
// (a dropped .html file would run with the preload's APIs), and links open in
// the browser only when they are https.
import type { WebContents } from 'electron'

export function canOpenExternal(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

export function blockNavigation(contents: WebContents): void {
  const block = (e: Electron.Event, url: string): void => {
    e.preventDefault()
    console.error(`Blocked navigation to ${url.slice(0, 200)}`)
  }
  contents.on('will-navigate', (e) => block(e, e.url))
  contents.on('will-frame-navigate', (e) => block(e, e.url))
}
