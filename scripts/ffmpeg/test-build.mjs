// Checks that a build of ffmpeg and ffprobe (scripts/ffmpeg/build.sh) does
// what Spindle asks of them, with the same arguments: ffprobe reads a file's
// format and tags and counts its packets, and ffmpeg decodes, seeks, mixes and
// resamples it to raw PCM. Run by .github/workflows/ffmpeg.yml on Linux and
// on Windows, against short samples from FFmpeg's own test suite.
//
//   node scripts/ffmpeg/test-build.mjs <ffmpeg> <ffprobe> <samples dir>
/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS, run by node */
import { spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const [ffmpeg, ffprobe, samplesDir] = process.argv.slice(2).map((p) => p && resolve(p))
if (!samplesDir) {
  console.error('usage: node scripts/ffmpeg/test-build.mjs <ffmpeg> <ffprobe> <samples dir>')
  process.exit(2)
}

const suite = 'https://fate-suite.ffmpeg.org'
// Each sample: where it is in the suite, its sha256, what it holds, and how
// long it decodes to (by another ffmpeg build). Some are cut short; those
// only need to give `atLeast` that much before their end.
const samples = [
  {
    path: 'lossless-audio/luckynight-partial.ape',
    sha256: 'ce0769473b9302477c224fb1425194788bf6bab2e2dad3964d2c68a3b9711a07',
    codec: 'ape',
    rate: 44100,
    atLeast: 9.5
  },
  {
    path: 'wavpack/num_channels/mono_16bit_int.wv',
    sha256: 'b4322ec56021f3f8db77d2640f0e8fdf20136fda3aa4561d1c755595632fcc4f',
    codec: 'wavpack',
    rate: 48000,
    seconds: 23.933
  },
  {
    path: 'lossless-audio/inside.tta',
    sha256: '10e0f0e08c702c6dc9af58d07cf24222692628143bf36fa1c4d204dda5d6fa6a',
    codec: 'tta',
    rate: 44100,
    seconds: 11.888
  },
  {
    path: 'lossless-audio/luckynight-partial.tak',
    sha256: 'e84f57bd1e070bfd0fec20971bfc5b9bede4a58f74ef669d03080c547e2fd0e0',
    codec: 'tak',
    rate: 44100,
    seconds: 9.5
  },
  {
    path: 'lossless-audio/luckynight-partial.shn',
    sha256: '84e58dfb03c6b7ed6fc44f09fd6c25021be6b578db3485c1025f417b8aaeb6ba',
    codec: 'shorten',
    rate: 44100,
    atLeast: 8
  },
  {
    path: 'xwma/ergon.xwma',
    sha256: '3e25391489c17b134f4cf908def2a6b8932d973137aaf7a56445d57d89798237',
    codec: 'wmav2',
    rate: 48000,
    seconds: 20.011
  },
  {
    path: 'lossless-audio/g2_24bit.wma',
    sha256: '0dbe31e8b7bc8b589df5109cf6e2a1a782cdf8491ecbc1cc1fee887648ff45b7',
    codec: 'wmalossless',
    rate: 44100,
    seconds: 0.229
  },
  {
    path: 'wmapro/Beethovens_9th-1_small.wma',
    sha256: '1d5a3b307d485ec47a6469591f3bc9900ff4576378695d3b777b0ea6f8d40665',
    codec: 'wmapro',
    rate: 48000,
    atLeast: 1.8
  },
  {
    path: 'lossless-audio/inside.m4a',
    sha256: '882dd6d3636175459564df1be2c17719bf0df3d5842ff3a03c59f8a32774bf0b',
    codec: 'alac',
    rate: 44100,
    seconds: 11.888
  }
]

const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const name = (s) => s.path.split('/').pop()
let failed = 0

function check(what, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`)
  if (!ok) failed++
}

function run(bin, args) {
  const r = spawnSync(bin, args, { maxBuffer: 256 * 1024 * 1024 })
  if (r.error) throw r.error
  return { code: r.status, out: r.stdout, err: r.stderr.toString().trim() }
}

// Spindle's ffprobe for tags (probe.ts: probeTags)
const entries =
  'format=format_long_name,duration:format_tags' +
  ':stream=codec_name,codec_long_name,codec_type,sample_rate,channels,bits_per_raw_sample,bits_per_sample,duration:stream_tags'
const probe = (file) =>
  run(ffprobe, ['-v', 'error', '-show_entries', entries, '-of', 'json', `file:${file}`])

// Spindle's ffmpeg for decoding (decode.ts: ffmpegArgs)
function decode(file, { seconds = 0, channels = 2, rate = 44100, bits = 16 } = {}) {
  const pcm = bits === 24 ? 's24le' : 's16le'
  return run(ffmpeg, [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    ...(seconds > 0 ? ['-ss', seconds.toFixed(6)] : []),
    '-i',
    `file:${file}`,
    '-map',
    '0:a:0',
    '-vn',
    '-ac',
    String(channels),
    '-ar',
    String(rate),
    '-f',
    pcm,
    '-c:a',
    `pcm_${pcm}`,
    'pipe:1'
  ])
}

// Is `bytes` of PCM about `seconds` long? Within 1% or 50 ms.
function length(what, r, seconds, frameBytes, rate) {
  const got = r.out.length / frameBytes / rate
  const ok = r.code === 0 && Math.abs(got - seconds) <= Math.max(0.01 * seconds, 0.05)
  check(what, ok, `${got.toFixed(3)} s, expected ${seconds} s${r.err ? `; ${r.err}` : ''}`)
}

// The samples, downloaded once and checked
mkdirSync(samplesDir, { recursive: true })
for (const s of samples) {
  const file = join(samplesDir, name(s))
  if (existsSync(file) && sha256(readFileSync(file)) === s.sha256) continue
  const res = await fetch(`${suite}/${s.path}`)
  if (!res.ok) throw new Error(`${s.path}: HTTP ${res.status}`)
  const body = Buffer.from(await res.arrayBuffer())
  if (sha256(body) !== s.sha256) throw new Error(`${s.path} does not match its pinned sha256`)
  writeFileSync(file, body)
}

console.log(run(ffmpeg, ['-hide_banner', '-version']).out.toString().split('\n')[0])

for (const s of samples) {
  const file = join(samplesDir, name(s))
  const p = probe(file)
  let stream
  try {
    stream = JSON.parse(p.out.toString()).streams?.find((x) => x.codec_type === 'audio')
  } catch {
    // stays undefined
  }
  check(
    `${name(s)}: ffprobe reads it`,
    p.code === 0 && stream?.codec_name === s.codec && Number(stream?.sample_rate) === s.rate,
    `${stream?.codec_name} ${stream?.sample_rate} Hz${p.err ? `; ${p.err}` : ''}`
  )
  const d = decode(file)
  if (s.seconds) length(`${name(s)}: decodes`, d, s.seconds, 4, 44100)
  else {
    const got = d.out.length / 4 / 44100
    check(`${name(s)}: decodes up to where it's cut`, got >= s.atLeast, `${got.toFixed(3)} s`)
  }
}

const wv = join(samplesDir, 'mono_16bit_int.wv')
const tta = join(samplesDir, 'inside.tta')
length('seeks (-ss 10)', decode(wv, { seconds: 10 }), 13.933, 4, 44100)
length('decodes to 24-bit', decode(join(samplesDir, 'g2_24bit.wma'), { bits: 24 }), 0.229, 6, 44100)
length(
  'mixes to mono and resamples 48 to 22.05 kHz',
  decode(join(samplesDir, 'ergon.xwma'), { channels: 1, rate: 22050 }),
  20.011,
  2,
  22050
)

// Spindle's packet count for a length (probe.ts: probeLength)
{
  const r = run(ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'packet=pts_time,duration_time',
    '-of',
    'csv=p=0',
    `file:${tta}`
  ])
  const lines = r.out.toString().trim().split('\n')
  const [pts, dur] = lines[lines.length - 1].split(',').map(Number)
  const end = pts + dur
  check(
    'ffprobe lists packets',
    r.code === 0 && Math.abs(end - 11.888) < 0.05,
    `${lines.length} packets, ending at ${end}`
  )
}

// A file name in other scripts: on Windows this needs ffmpeg to take its
// arguments as Unicode
{
  const file = join(samplesDir, 'Лунная ночь – ü 音.tta')
  copyFileSync(tta, file)
  length('reads a file named in other scripts', decode(file), 11.888, 4, 44100)
}

// AIFF: none in FFmpeg's suite, so one second of a tone, written here. It
// holds big-endian samples, so the decoded output is exactly them swapped.
{
  const frames = 44100
  const pcm = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / 44100) * 12000)
    pcm.writeInt16BE(v, i * 4)
    pcm.writeInt16BE(-v, i * 4 + 2)
  }
  const comm = Buffer.alloc(26)
  comm.write('COMM', 0)
  comm.writeUInt32BE(18, 4)
  comm.writeUInt16BE(2, 8) // channels
  comm.writeUInt32BE(frames, 10)
  comm.writeUInt16BE(16, 14) // bits
  // 44100 as an 80-bit extended float
  Buffer.from([0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0]).copy(comm, 16)
  const ssnd = Buffer.alloc(16)
  ssnd.write('SSND', 0)
  ssnd.writeUInt32BE(8 + pcm.length, 4)
  const form = Buffer.alloc(12)
  form.write('FORM', 0)
  form.writeUInt32BE(4 + comm.length + ssnd.length + pcm.length, 4)
  form.write('AIFF', 8)
  const file = join(samplesDir, 'tone.aiff')
  writeFileSync(file, Buffer.concat([form, comm, ssnd, pcm]))
  const d = decode(file)
  const want = Buffer.from(pcm).swap16()
  check('decodes AIFF exactly', d.code === 0 && d.out.equals(want), d.err)
}

console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
