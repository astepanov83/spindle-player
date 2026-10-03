// "Show in file manager" on the album page. The page names the folder as a
// music folder and the names below it, and only such a folder is opened:
// shell.openPath on a file would run it.
import { stat } from 'fs/promises'
import { join } from 'path'
import { shell } from 'electron'

export function folderToOpen(parts: unknown, roots: string[]): string | null {
  if (!Array.isArray(parts) || !parts.length) return null
  if (!parts.every((p) => typeof p === 'string')) return null
  const [root, ...names] = parts as string[]
  if (!roots.includes(root)) return null
  if (names.some((n) => !n || n === '.' || n === '..' || /[/\\\0]/.test(n))) return null
  return join(root, ...names)
}

// false when the folder is gone (an unplugged drive) or nothing opened it
export async function showFolder(parts: unknown, roots: string[]): Promise<boolean> {
  const path = folderToOpen(parts, roots)
  if (!path) return false
  const dir = await stat(path).then(
    (s) => s.isDirectory(),
    () => false
  )
  if (!dir) return false
  const error = await shell.openPath(path)
  if (error) console.error(`Could not open ${path}: ${error}`)
  return !error
}
