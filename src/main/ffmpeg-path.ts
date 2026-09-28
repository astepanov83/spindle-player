// Where the bundled ffmpeg and ffprobe are (scripts/fetch-ffmpeg.mjs puts them
// in resources/ffmpeg). In a packaged app they are unpacked next to app.asar,
// since a program inside the archive can't be run.
import { existsSync } from 'fs'
import { join, sep } from 'path'

export function ffmpegTool(name: 'ffmpeg' | 'ffprobe'): string | undefined {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  // out/main in dev and in the build, app.asar/out/main when packaged
  const path = join(__dirname, '..', '..', 'resources', 'ffmpeg', exe).replace(
    `${sep}app.asar${sep}`,
    `${sep}app.asar.unpacked${sep}`
  )
  return existsSync(path) ? path : undefined
}
