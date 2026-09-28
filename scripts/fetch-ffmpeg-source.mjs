// Gathers the source code of the ffmpeg and ffprobe builds Spindle ships
// (scripts/fetch-ffmpeg.mjs) into one archive, to attach to a release next to
// the app. The builds are GPL v3, and section 6 of the GPL asks for their
// Corresponding Source to be offered with them. See resources/ffmpeg/SOURCE.txt.
//
// The builds' own build scripts are not public, and a few libraries linked
// into them have no known version. Those are listed as missing in the
// archive's SOURCES.txt; nothing here can fill that gap.
//
//   node scripts/fetch-ffmpeg-source.mjs
//
// Needs git and GNU tar. Not run by npm install: it downloads about 100 MB.
// Writes ffmpeg-source/ (git-ignored): files/ holds each download, and
// ffmpeg-7.0.2-linux-x64-source.tar is the archive to publish.
/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS, run by node */
import { spawnSync } from 'child_process'
import { createHash } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'ffmpeg-source')
const filesDir = join(outDir, 'files')
const archive = join(outDir, 'ffmpeg-7.0.2-linux-x64-source.tar')

// How sure each entry is to be the source that was built:
//   exact    the version or commit the build's README.txt prints
//   debian   the Debian package version the README prints (Debian 10 "buster")
//   version  a version found in the binary; the build may have used Debian
//            10's package of it, which can carry Debian's patches
//   likely   a commit that fits the printed version and the build's date
//   guess    the printed version fits many commits; this is one of them
const snapshot = (sha1) => `https://snapshot.debian.org/file/${sha1}`
const sources = [
  // FFmpeg itself
  {
    what: 'FFmpeg 7.0.2',
    how: 'exact',
    file: 'ffmpeg-7.0.2.tar.xz',
    url: 'https://ffmpeg.org/releases/ffmpeg-7.0.2.tar.xz',
    sha256: '8646515b638a3ad303e23af6a3587734447cb8fc0a0c064ecdb8e95c4fd8b389'
  },
  // Libraries named in the build's README.txt
  {
    what: 'libaom 3.2.0-393-g402e264b94',
    how: 'exact',
    file: 'aom-402e264b94fd.tar.gz',
    git: 'https://aomedia.googlesource.com/aom',
    commit: '402e264b94fd74bdf66837da216b6251805b4ae4'
  },
  {
    what: 'libass 0.17.3',
    how: 'exact',
    file: 'libass-0.17.3.tar.xz',
    url: 'https://github.com/libass/libass/releases/download/0.17.3/libass-0.17.3.tar.xz',
    sha256: 'eae425da50f0015c21f7b3a9c7262a910f0218af469e22e2931462fed3c50959'
  },
  {
    what: 'libgme (Game Music Emu) 0.6.3',
    how: 'exact',
    file: 'libgme-0.6.3-src.tar.gz',
    url: 'https://github.com/libgme/game-music-emu/releases/download/0.6.3/libgme-0.6.3-src.tar.gz',
    sha256: '4c4ea6279d112e30f0c6e401c2d5161a577c07b01ec071d6838a3a03204a8892'
  },
  {
    what: 'libsrt 1.4.4',
    how: 'exact',
    file: 'srt-1.4.4.tar.gz',
    url: 'https://github.com/Haivision/srt/archive/refs/tags/v1.4.4.tar.gz',
    sha256: '93f5f3715bd5bd522b8d65fc0d086ef2ad49db6a41ad2d7b35df2e8bd7094114'
  },
  {
    what: 'libvpx 1.11.0-30-g888bafc78',
    how: 'exact',
    file: 'libvpx-888bafc78d8b.tar.gz',
    git: 'https://chromium.googlesource.com/webm/libvpx',
    commit: '888bafc78d8bddb5cfc4262c93f456c812763571'
  },
  {
    what: 'libvmaf 2.3.0',
    how: 'exact',
    file: 'vmaf-2.3.0.tar.gz',
    url: 'https://github.com/Netflix/vmaf/archive/refs/tags/v2.3.0.tar.gz',
    sha256: 'd8dcc83f8e9686e6855da4c33d8c373f1735d87294edbd86ed662ba2f2f89277'
  },
  {
    what: 'libx264 0.164.3191 (commit 3191 of x264)',
    how: 'exact',
    file: 'x264-4613ac3c15fd.tar.gz',
    git: 'https://code.videolan.org/videolan/x264.git',
    commit: '4613ac3c15fd75cebc4b9f65b7fb95e70a3acce1'
  },
  {
    what: 'libx265 3.5+1-f0c1022b6',
    how: 'exact',
    file: 'x265-f0c1022b6be1.tar.gz',
    git: 'https://bitbucket.org/multicoreware/x265_git.git',
    commit: 'f0c1022b6be121a753ff02853fbe33da71988656'
  },
  {
    what: 'libxvid 1.3.7',
    how: 'exact',
    file: 'xvidcore-1.3.7.tar.bz2',
    url: 'https://downloads.xvid.com/downloads/xvidcore-1.3.7.tar.bz2',
    sha256: 'aeeaae952d4db395249839a3bd03841d6844843f5a4f84c271ff88f7aa1acff7'
  },
  {
    what: 'libwebp 0.6.1',
    how: 'exact',
    file: 'libwebp-0.6.1.tar.gz',
    url: 'https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-0.6.1.tar.gz',
    sha256: '06503c782d9f151baa325591c3579c68ed700ffc62d4f5a32feead0ff017d8ab'
  },
  {
    what: 'libzimg 3.0.3',
    how: 'exact',
    file: 'zimg-3.0.3.tar.gz',
    url: 'https://github.com/sekrit-twc/zimg/archive/refs/tags/release-3.0.3.tar.gz',
    sha256: '5e002992bfe8b9d2867fdc9266dc84faca46f0bfd931acc2ae0124972b6170a7'
  },
  {
    what: 'libzvbi 0.2.36',
    how: 'exact',
    file: 'zvbi-0.2.36.tar.gz',
    url: 'https://github.com/zapping-vbi/zvbi/archive/refs/tags/v0.2.36.tar.gz',
    sha256: 'e9a2a694ab1770d63d49fffc303c8b24548119e6002e9680a1b42d3d91ea79b9'
  },
  {
    what: 'libdav1d 1.4.2',
    how: 'exact',
    file: 'dav1d-1.4.2.tar.xz',
    url: 'https://downloads.videolan.org/pub/videolan/dav1d/1.4.2/dav1d-1.4.2.tar.xz',
    sha256: '7392cf4c432734eebb383319b5e05e994bffdcdfe66f82287c38873601a4ef0b'
  },
  {
    what: 'libgnutls 3.7.2',
    how: 'exact',
    file: 'gnutls-3.7.2.tar.xz',
    url: 'https://www.gnupg.org/ftp/gcrypt/gnutls/v3.7/gnutls-3.7.2.tar.xz',
    sha256: '646e6c5a9a185faa4cea796d378a1ba8e1148dbb197ca6605f95986a25af2752'
  },
  {
    // the last commit before 2025 (none from Oct 2020 to Mar 2025), and
    // configure.ac there says 1.2.0alpha1+git
    what: 'libtheora 1.2.0alpha1+git',
    how: 'likely',
    file: 'theora-7180717276af.tar.gz',
    git: 'https://gitlab.xiph.org/xiph/theora.git',
    commit: '7180717276af1ebc7da15c83162d6c5d6203aabf'
  },
  {
    what: 'libfrei0r 1.6.1-2 (Debian source package, headers only: plugins load at run time)',
    how: 'debian',
    file: 'frei0r_1.6.1.orig.tar.gz',
    url: snapshot('e76c4608aff637822bbde8bf0b2a8ce0440b0141'),
    sha256: 'e0c24630961195d9bd65aa8d43732469e8248e8918faa942cfb881769d11515e'
  },
  {
    what: 'libfrei0r 1.6.1-2, Debian changes',
    how: 'debian',
    file: 'frei0r_1.6.1-2.debian.tar.xz',
    url: snapshot('3f95fed0ab78f447a17fb91fc5173335fa465776'),
    sha256: '7cca9261e11ee5a42493f61e9bd09735fbf1aab5f15185260896e2706077ba23'
  },
  {
    what: 'libfrei0r 1.6.1-2, Debian description',
    how: 'debian',
    file: 'frei0r_1.6.1-2.dsc',
    url: snapshot('6179b8a355e7cd8fd12a15781816399af6509937'),
    sha256: '63c1c3211cd18458cbbc7f46ab5c565d6c911425a68555836bacaa5f2d254f83'
  },
  {
    // "1.20" is major 1, minor 2, patch 0: every commit from Nov 2020 on
    what: 'libvidstab 1.20',
    how: 'guess',
    file: 'vid.stab-1.1.1.tar.gz',
    url: 'https://github.com/georgmartius/vid.stab/archive/refs/tags/v1.1.1.tar.gz',
    sha256: '9001b6df73933555e56deac19a0f225aae152abbc0e97dc70034814a1943f3d4'
  },
  {
    what: 'libfreetype 2.9.1-3+deb10u1 (Debian source package)',
    how: 'debian',
    file: 'freetype_2.9.1.orig.tar.gz',
    url: snapshot('7498739e34e5dca4c61d05efdde6191ba69a2df0'),
    sha256: 'ec391504e55498adceb30baceebd147a6e963f636eb617424bcfc47a169898ce'
  },
  {
    what: 'libfreetype 2.9.1-3+deb10u1, Debian changes',
    how: 'debian',
    file: 'freetype_2.9.1-3+deb10u1.debian.tar.xz',
    url: snapshot('c931189a12099b4b14e286d921d30324853fec9c'),
    sha256: '7a2765961a01332f2d402d86a126a9480efb326c995b0db2108c0f825d78cbe2'
  },
  {
    what: 'libfreetype 2.9.1-3+deb10u1, Debian description',
    how: 'debian',
    file: 'freetype_2.9.1-3+deb10u1.dsc',
    url: snapshot('b46ddb826f42e410b5a384419bb9ab0173fd6bb3'),
    sha256: 'ef4825d67d044be4ea2e86444eae166057f8bd7d5606abf82d5095f47a3a7bd1'
  },
  {
    what: 'libharfbuzz 3.1.1',
    how: 'exact',
    file: 'harfbuzz-3.1.1.tar.xz',
    url: 'https://github.com/harfbuzz/harfbuzz/releases/download/3.1.1/harfbuzz-3.1.1.tar.xz',
    sha256: 'f3f3247bdeabf36765acc237a5f651e651e4e9706582b9cc2cf6c9b8102dfa93'
  },
  {
    what: 'libopenjpeg 2.4.0',
    how: 'exact',
    file: 'openjpeg-2.4.0.tar.gz',
    url: 'https://github.com/uclouvain/openjpeg/archive/refs/tags/v2.4.0.tar.gz',
    sha256: '8702ba68b442657f11aaeb2b338443ca8d5fb95b0d845757968a7be31ef7f16d'
  },
  {
    what: 'libalsa 1.2.4',
    how: 'exact',
    file: 'alsa-lib-1.2.4.tar.bz2',
    url: 'https://www.alsa-project.org/files/pub/lib/alsa-lib-1.2.4.tar.bz2',
    sha256: 'f7554be1a56cdff468b58fc1c29b95b64864c590038dd309c7a978c7116908f7'
  },
  {
    what: 'libsoxr 0.1.3',
    how: 'exact',
    file: 'soxr-0.1.3-Source.tar.xz',
    url: 'https://downloads.sourceforge.net/project/soxr/soxr-0.1.3-Source.tar.xz',
    sha256: 'b111c15fdc8c029989330ff559184198c161100a59312f5dc19ddeb9b5a15889'
  },
  {
    what: 'libopus 1.3.1',
    how: 'exact',
    file: 'opus-1.3.1.tar.gz',
    url: 'https://downloads.xiph.org/releases/opus/opus-1.3.1.tar.gz',
    sha256: '65b58e1e25b2a114157014736a3d9dfeaad8d41be1c8179866f144a2fb44ff9d'
  },
  {
    what: 'libspeex 1.2',
    how: 'exact',
    file: 'speex-1.2.0.tar.gz',
    url: 'https://downloads.xiph.org/releases/speex/speex-1.2.0.tar.gz',
    sha256: 'eaae8af0ac742dc7d542c9439ac72f1f385ce838392dc849cae4536af9210094'
  },
  {
    what: 'libvorbis 1.3.7',
    how: 'exact',
    file: 'libvorbis-1.3.7.tar.xz',
    url: 'https://downloads.xiph.org/releases/vorbis/libvorbis-1.3.7.tar.xz',
    sha256: 'b33cc4934322bcbf6efcbacf49e3ca01aadbea4114ec9589d1b1e9d20f72954b'
  },
  {
    what: 'libmp3lame 3.100',
    how: 'exact',
    file: 'lame-3.100.tar.gz',
    url: 'https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz',
    sha256: 'ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e'
  },
  {
    // upstream's own server cuts this download short; Debian keeps the same file
    what: 'librubberband 1.8.2',
    how: 'exact',
    file: 'rubberband-1.8.2.tar.bz2',
    url: snapshot('6398c8b8448befe06dc5250967df06974b7ea1bc'),
    sha256: '86bed06b7115b64441d32ae53634fcc0539a50b9b648ef87443f936782f6c3ca'
  },
  {
    what: 'libvo-amrwbenc 0.1.3-1+b1 (Debian source package 0.1.3-1)',
    how: 'debian',
    file: 'vo-amrwbenc_0.1.3.orig.tar.gz',
    url: snapshot('427a147a378d258614d5d470f1f222e249535be7'),
    sha256: '5652b391e0f0e296417b841b02987d3fd33e6c0af342c69542cbb016a71d9d4e'
  },
  {
    what: 'libvo-amrwbenc 0.1.3-1, Debian changes',
    how: 'debian',
    file: 'vo-amrwbenc_0.1.3-1.debian.tar.gz',
    url: snapshot('a3427d36ddec65afd2f3e1c0c607067414e6698e'),
    sha256: 'e5703663cd1a6505aede0119e0a3f6dbc13e73a462d15ba5231ae839866d0ef2'
  },
  {
    what: 'libvo-amrwbenc 0.1.3-1, Debian description',
    how: 'debian',
    file: 'vo-amrwbenc_0.1.3-1.dsc',
    url: snapshot('2034efd185679b7a3be289cf32aa03916e3fea6f'),
    sha256: 'c8d77da0c8b3e13ee3fbfd445142a3fbed10f427024b2692f9fbdaf123cb25f0'
  },
  {
    what: 'libopencore-amrnb and -amrwb 0.1.3-2.1+b2 (Debian source package 0.1.3-2.1)',
    how: 'debian',
    file: 'opencore-amr_0.1.3.orig.tar.gz',
    url: snapshot('737f00e97a237f4ae701ea55913bb38dc5513501'),
    sha256: '106bf811c1f36444d7671d8fd2589f8b2e0cca58a2c764da62ffc4a070595385'
  },
  {
    what: 'libopencore-amr 0.1.3-2.1, Debian changes',
    how: 'debian',
    file: 'opencore-amr_0.1.3-2.1.debian.tar.xz',
    url: snapshot('db9b77dc582b340592590f999f8ac630b6990989'),
    sha256: '1cb886486324d437dceaa6ec2f579be4a01ea5930fc8f4265da494ecc45937b0'
  },
  {
    what: 'libopencore-amr 0.1.3-2.1, Debian description',
    how: 'debian',
    file: 'opencore-amr_0.1.3-2.1.dsc',
    url: snapshot('0786a2f31d93d7421019eb32607624adfa71d366'),
    sha256: 'daee797176202a65e32f5c954438a2a429b5f2f5d3269126c9e7a67a404a1bb6'
  },
  // Not in README.txt, but their version strings are in the binary
  {
    what: 'FriBidi 1.0.11',
    how: 'version',
    file: 'fribidi-1.0.11.tar.xz',
    url: 'https://github.com/fribidi/fribidi/releases/download/v1.0.11/fribidi-1.0.11.tar.xz',
    sha256: '30f93e9c63ee627d1a2cedcf59ac34d45bf30240982f99e44c6e015466b4e73d'
  },
  {
    what: 'libxml2 2.9.8',
    how: 'version',
    file: 'libxml2-2.9.8.tar.xz',
    url: 'https://download.gnome.org/sources/libxml2/2.9/libxml2-2.9.8.tar.xz',
    sha256: 'dcca21d624bbbe094fcc104e1f15f2eacfb65aecd0e38ed220aeca56b62c81e2'
  },
  {
    what: 'zlib 1.2.11',
    how: 'version',
    file: 'zlib-1.2.11.tar.gz',
    url: 'https://zlib.net/fossils/zlib-1.2.11.tar.gz',
    sha256: 'c3e5e9fdd5004dcb542feda5ee4f0ff0744628baf8ed2dd5d66f8ca1197cb1a1'
  },
  {
    what: 'bzip2 1.0.6',
    how: 'version',
    file: 'bzip2-1.0.6.tar.gz',
    url: 'https://sourceware.org/pub/bzip2/bzip2-1.0.6.tar.gz',
    sha256: 'a2848f34fcd5d6cf47def00461fcb528a0484d8edef8208d6d2e2909dc61d9cd'
  },
  {
    what: 'libpng 1.6.36',
    how: 'version',
    file: 'libpng-1.6.36.tar.xz',
    url: 'https://downloads.sourceforge.net/project/libpng/libpng16/older-releases/1.6.36/libpng-1.6.36.tar.xz',
    sha256: 'eceb924c1fa6b79172fdfd008d335f0e59172a86a66481e09d4089df872aa319'
  },
  {
    what: 'Expat 2.2.6',
    how: 'version',
    file: 'expat-2.2.6.tar.bz2',
    url: 'https://github.com/libexpat/libexpat/releases/download/R_2_2_6/expat-2.2.6.tar.bz2',
    sha256: '17b43c2716d521369f82fc2dc70f359860e90fa440bea65b3b85f0b246ea81f2'
  },
  {
    what: 'XZ Utils (liblzma) 5.2.4',
    how: 'version',
    file: 'xz-5.2.4.tar.xz',
    url: 'https://downloads.sourceforge.net/project/lzmautils/xz-5.2.4.tar.xz',
    sha256: '9717ae363760dedf573dad241420c5fea86256b65bc21d2cf71b2b12f0544f4b'
  },
  {
    what: 'FFTW 3.3.8 (for Rubber Band)',
    how: 'version',
    file: 'fftw-3.3.8.tar.gz',
    url: 'https://fftw.org/fftw-3.3.8.tar.gz',
    sha256: '6113262f6e92c5bd474f2875fa1b01054c4ad5040f6b0da7c03c98821d9ae303'
  },
  {
    what: 'libsamplerate 0.1.9 (for Rubber Band)',
    how: 'version',
    file: 'libsamplerate-0.1.9.tar.gz',
    url: 'https://github.com/libsndfile/libsamplerate/releases/download/0.1.9/libsamplerate-0.1.9.tar.gz',
    sha256: '0a7eb168e2f21353fb6d84da152e4512126f7dc48ccb0be80578c565413444c1'
  }
]

// Linked into the build (the configure line or strings in the binary show
// them), with no version recorded anywhere we could find.
const missing = [
  'GMP (--enable-gmp)',
  "Nettle and Hogweed (for GnuTLS 3.7.2, so 3.6 or newer, not Debian 10's 3.4.1)",
  'libtasn1 (for GnuTLS)',
  'Fontconfig (--enable-fontconfig)',
  'libogg (for Vorbis and Theora)',
  "GNU C Library, linked statically (the build notes say so); likely Debian 10's 2.28",
  "GCC's runtime (libgcc, libstdc++) from GCC 8.3.0 and 6.3.0 (Debian); under the GCC Runtime Library Exception",
  "John Van Sickle's build scripts, which are not published"
]

function fail(text) {
  console.error(`fetch-ffmpeg-source: ${text}`)
  process.exit(1)
}

const sha256 = (b) => createHash('sha256').update(b).digest('hex')

function tool(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  if (r.error) fail(`${bin} is needed: ${r.error.message}`)
  if (r.status !== 0)
    fail(`${bin} ${args.join(' ')} failed: ${r.stderr.toString().trim().slice(0, 500)}`)
  return r.stdout
}

async function download(s, path) {
  let body
  // some of these servers are slow or drop a download now and then
  for (let tries = 1; !body; tries++) {
    try {
      const res = await fetch(s.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      body = Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (tries === 3) fail(`could not download ${s.file} from ${s.url}: ${e.message}`)
      console.warn(`fetch-ffmpeg-source: ${s.file}: ${e.message}, trying again`)
    }
  }
  if (sha256(body) !== s.sha256) fail(`${s.file} does not match its pinned sha256`)
  writeFileSync(`${path}.tmp`, body)
  renameSync(`${path}.tmp`, path)
}

// A git commit's files as a .tar.gz. The commit id is the check: git
// verifies every object it fetches against its hash.
function gitArchive(s, path) {
  const repo = join(outDir, 'git-tmp')
  rmSync(repo, { recursive: true, force: true })
  tool('git', ['init', '-q', '--bare', repo])
  tool('git', ['-C', repo, 'fetch', '-q', '--depth', '1', s.git, s.commit])
  const got = tool('git', ['-C', repo, 'rev-parse', 'FETCH_HEAD']).toString().trim()
  if (got !== s.commit) fail(`${s.git} gave ${got}, not ${s.commit}`)
  const prefix = s.file.replace(/\.tar\.gz$/, '')
  tool('git', [
    '-C',
    repo,
    'archive',
    '--format=tar.gz',
    `--prefix=${prefix}/`,
    `--output=${path}.tmp`,
    s.commit
  ])
  renameSync(`${path}.tmp`, path)
  rmSync(repo, { recursive: true, force: true })
}

mkdirSync(filesDir, { recursive: true })
const hashes = new Map()
for (const s of sources) {
  const path = join(filesDir, s.file)
  const have = existsSync(path)
  if (s.git) {
    if (!have) gitArchive(s, path)
  } else if (!have || sha256(readFileSync(path)) !== s.sha256) await download(s, path)
  hashes.set(s.file, sha256(readFileSync(path)))
  if (!have) console.log(`fetch-ffmpeg-source: ${s.file}`)
}

// The build's own README.txt and LICENSE.txt, and the written offer
const ffmpegDir = join(root, 'resources', 'ffmpeg')
for (const [name, as] of [
  ['README.txt', 'BUILD-README.txt'],
  ['LICENSE.txt', 'LICENSE.txt'],
  ['SOURCE.txt', 'SOURCE.txt']
]) {
  if (!existsSync(join(ffmpegDir, name)))
    fail(`resources/ffmpeg/${name} is missing (run npm run fetch-ffmpeg)`)
  copyFileSync(join(ffmpegDir, name), join(filesDir, as))
}

const how = {
  exact: 'the version or commit the build prints',
  debian: 'the Debian 10 package version the build prints',
  version: 'a version found in the binary (may have been built from Debian 10 with its patches)',
  likely: 'most likely the commit built (see note)',
  guess: 'one of many commits that print this version'
}
const list = [
  'Source code for the ffmpeg and ffprobe programs shipped with Spindle',
  '',
  "Build: John Van Sickle's static ffmpeg 7.0.2 for Linux x64 (ffmpeg-7.0.2-amd64-static),",
  'as republished by https://github.com/eugeneware/ffmpeg-static release b6.1.1.',
  "Spindle runs these programs unmodified. BUILD-README.txt is the build's own README.",
  '',
  'FFmpeg configure line:',
  '  --enable-gpl --enable-version3 --enable-static --disable-debug --disable-ffplay',
  '  --disable-indev=sndio --disable-outdev=sndio --cc=gcc --enable-fontconfig --enable-frei0r',
  '  --enable-gnutls --enable-gmp --enable-libgme --enable-gray --enable-libaom --enable-libfribidi',
  '  --enable-libass --enable-libvmaf --enable-libfreetype --enable-libmp3lame',
  '  --enable-libopencore-amrnb --enable-libopencore-amrwb --enable-libopenjpeg',
  '  --enable-librubberband --enable-libsoxr --enable-libspeex --enable-libsrt --enable-libvorbis',
  '  --enable-libopus --enable-libtheora --enable-libvidstab --enable-libvo-amrwbenc',
  '  --enable-libvpx --enable-libwebp --enable-libx264 --enable-libx265 --enable-libxml2',
  '  --enable-libdav1d --enable-libxvid --enable-libzvbi --enable-libzimg',
  '',
  'Files, with where they came from and their sha256:',
  ''
]
for (const s of sources) {
  list.push(`${s.file}`)
  list.push(`  ${s.what}: ${how[s.how]}`)
  list.push(`  from ${s.git ? `${s.git} commit ${s.commit}` : s.url}`)
  list.push(`  sha256 ${hashes.get(s.file)}`)
}
list.push('', 'Linked into the build, but no version is known, so not included:', '')
for (const m of missing) list.push(`- ${m}`)
list.push('')
writeFileSync(join(filesDir, 'SOURCES.txt'), list.join('\n'))

// One tar with fixed order, owner and times, so the same files give the same bytes
tool('tar', [
  '--create',
  `--file=${archive}.tmp`,
  '--sort=name',
  '--owner=0',
  '--group=0',
  '--numeric-owner',
  '--mtime=2024-08-03 00:00Z',
  '--transform=s,^\\.,ffmpeg-7.0.2-linux-x64-source,',
  '-C',
  filesDir,
  '.'
])
renameSync(`${archive}.tmp`, archive)
const sum = sha256(readFileSync(archive))
writeFileSync(`${archive}.sha256`, `${sum}  ${archive.split('/').pop()}\n`)
console.log(
  `fetch-ffmpeg-source: ${archive} (${(readFileSync(archive).length / 1e6).toFixed(1)} MB)`
)
console.log(`sha256 ${sum}`)
