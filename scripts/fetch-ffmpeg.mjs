// Downloads the ffmpeg and ffprobe builds Spindle ships into resources/ffmpeg.
// Pinned to one release, with sha256 checks, so every install gets the same bytes.
// The builds are John Van Sickle's static ffmpeg 7.0.2, as republished by the
// ffmpeg-static project. They are GPL v3, a separate program from Spindle (MIT).
//
//   node scripts/fetch-ffmpeg.mjs          fetch if missing; warn and go on if it can't
//   node scripts/fetch-ffmpeg.mjs --strict fail if the binaries can't be had (packaging)
/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS, run by node */
import { createHash } from 'crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { gunzipSync } from 'zlib'

const release = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1'
// sha256 of each downloaded file (the .gz before unpacking)
const builds = {
  'linux-x64': {
    'ffmpeg-linux-x64.gz': [
      'ffmpeg',
      'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa'
    ],
    'ffprobe-linux-x64.gz': [
      'ffprobe',
      '25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067'
    ],
    'linux-x64.LICENSE': [
      'LICENSE.txt',
      '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903'
    ],
    'linux-x64.README': [
      'README.txt',
      '72f4b1b06d419d22ace6e7cc75f06826f90737345aa0b1736158929f4aacc537'
    ]
  }
}

const strict = process.argv.includes('--strict')
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'ffmpeg')
const key = `${process.platform}-${process.arch}`
const files = builds[key]

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
// the pinned hash is kept next to each file, so a later install skips the download
const stamp = (name) => join(dir, `.${name}.sha256`)

function present(name, hash) {
  try {
    return existsSync(join(dir, name)) && readFileSync(stamp(name), 'utf8') === hash
  } catch {
    return false
  }
}

mkdirSync(dir, { recursive: true })
for (const [asset, [name, hash]] of Object.entries(files)) {
  if (present(name, hash)) continue
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
  const tmp = join(dir, `${name}.tmp`)
  writeFileSync(tmp, out)
  if (!name.endsWith('.txt')) chmodSync(tmp, 0o755)
  renameSync(tmp, join(dir, name))
  writeFileSync(stamp(name), hash)
  console.log(`fetch-ffmpeg: ${name} (${(out.length / 1e6).toFixed(1)} MB)`)
}
