// Which links leave the app for the browser: https only. Main opens nothing
// else (web-guard.ts), and the page draws no link it would refuse.
export function canOpenExternal(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
