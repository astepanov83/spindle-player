// One copy of the app per user-data folder. Two copies would both write
// settings.json, library.json, playlists.json, queue.json and the cover cache,
// and one's clean-up of stray temp files could delete the other's live ones.

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Sent with each ask after the first, so the running copy doesn't come to the
// front 40 times while a dev copy waits for it to quit.
export const devRetryData = { devRetry: true }

// True for the extra data of a dev copy asking again (see takeLock).
export function isDevRetry(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && (data as { devRetry?: unknown }).devRetry === true
  )
}

// Takes the lock. `waitMs` is for dev: electron-vite starts the new copy right
// after it stops the old one, which still saves its files for up to 2s, so the
// new one asks again for a while instead of quitting at once (and then
// electron-vite would exit with it). The first ask is right away, with no wait.
// `tryLock` gets true for the asks after the first.
export async function takeLock(
  tryLock: (retry: boolean) => boolean,
  waitMs = 0,
  everyMs = 250,
  wait: (ms: number) => Promise<void> = sleep
): Promise<boolean> {
  if (tryLock(false)) return true
  for (let waited = 0; waited < waitMs; waited += everyMs) {
    await wait(everyMs)
    if (tryLock(true)) return true
  }
  return false
}
