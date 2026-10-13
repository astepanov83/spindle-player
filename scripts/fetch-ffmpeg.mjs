// Puts ffmpeg and ffprobe into resources/ffmpeg. For working on Spindle it
// downloads a ready-made build, pinned to one release, with sha256 checks, so
// every install gets the same bytes: John Van Sickle's static ffmpeg 7.0.2 on
// Linux and gyan.dev's static ffmpeg 6.1.1 "essentials" on Windows, as
// republished by the ffmpeg-static project (GPL v3). Released packages carry
// the release workflow's own build instead (see SPINDLE_FFMPEG_DIR below).
//
//   node scripts/fetch-ffmpeg.mjs          fetch if missing; warn and go on if it can't
//   node scripts/fetch-ffmpeg.mjs --strict fail if the binaries can't be had (packaging)
/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS, run by node */
import { createHash } from 'crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { gunzipSync } from 'zlib'

const release = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1'
// Each file: its name here, the sha256 of the download (a .gz before
// unpacking) and the sha256 of the file itself.
const builds = {
  'linux-x64': {
    'ffmpeg-linux-x64.gz': [
      'ffmpeg',
      'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa',
      'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99'
    ],
    'ffprobe-linux-x64.gz': [
      'ffprobe',
      '25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067',
      '4f231a1960d83e403d08f7971e271707bec278a9ae18e21b8b5b03186668450d'
    ],
    'linux-x64.LICENSE': [
      'LICENSE.txt',
      '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903',
      '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903'
    ],
    'linux-x64.README': [
      'README.txt',
      '72f4b1b06d419d22ace6e7cc75f06826f90737345aa0b1736158929f4aacc537',
      '72f4b1b06d419d22ace6e7cc75f06826f90737345aa0b1736158929f4aacc537'
    ]
  },
  'win32-x64': {
    'ffmpeg-win32-x64.gz': [
      'ffmpeg.exe',
      '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77',
      '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00'
    ],
    'ffprobe-win32-x64.gz': [
      'ffprobe.exe',
      'f309e6223ad89d2fe54bccd420a7709b66fd27540674e92309578ed491a43c8d',
      '3a7e2dc003dc2cd1472827e4c7c4f056ae1ae0ae7c5bbc580c99b49827351ba4'
    ],
    'win32-x64.LICENSE': [
      'LICENSE.txt',
      '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903',
      '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903'
    ],
    'win32-x64.README': [
      'README.txt',
      'a636a7183c58006351acbaf35303c0ed85c6e1320fd4e80de453ba6157de6311',
      'a636a7183c58006351acbaf35303c0ed85c6e1320fd4e80de453ba6157de6311'
    ]
  }
}

const strict = process.argv.includes('--strict')
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'ffmpeg')
const key = `${process.platform}-${process.arch}`
const files = builds[key]

// The release workflow (.github/workflows/release.yml) builds its own ffmpeg
// and ffprobe from source and hands them over in SPINDLE_FFMPEG_DIR, with their
// license and source offer: those replace the folder, and nothing is fetched.
const prebuilt = process.env.SPINDLE_FFMPEG_DIR
if (prebuilt) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(prebuilt)) {
    copyFileSync(join(prebuilt, name), join(dir, name))
    if (!name.endsWith('.txt')) chmodSync(join(dir, name), 0o755)
  }
  console.log(`fetch-ffmpeg: took ${readdirSync(dir).join(', ')} from ${prebuilt}`)
  process.exit(0)
}

function fail(text) {
  if (strict) {
    console.error(`fetch-ffmpeg: ${text}`)
    process.exit(1)
  }
  console.warn(`fetch-ffmpeg: ${text}. APE, WMA, WavPack, AIFF and ALAC won't play.`)
  process.exit(0)
}

if (!files) fail(`no pinned ffmpeg build for ${key}`)

const sha256 = (b) => createHash('sha256').update(b).digest('hex')

// No stamp files next to them: electron-builder packs this folder, and
// leaving files out of it there broke app.asar.
function present(name, fileHash) {
  const path = join(dir, name)
  return existsSync(path) && sha256(readFileSync(path)) === fileHash
}

mkdirSync(dir, { recursive: true })
for (const [asset, [name, hash, fileHash]] of Object.entries(files)) {
  if (present(name, fileHash)) continue
  let body
  try {
    const res = await fetch(`${release}/${asset}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    body = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    fail(`could not download ${asset}: ${e.message}`)
  }
  if (sha256(body) !== hash) fail(`${asset} does not match its pinned sha256`)
  const out = asset.endsWith('.gz') ? gunzipSync(body) : body
  if (sha256(out) !== fileHash) fail(`${name} does not match its pinned sha256`)
  const tmp = join(dir, `${name}.tmp`)
  writeFileSync(tmp, out)
  if (!name.endsWith('.txt')) chmodSync(tmp, 0o755)
  renameSync(tmp, join(dir, name))
  console.log(`fetch-ffmpeg: ${name} (${(out.length / 1e6).toFixed(1)} MB)`)
}
