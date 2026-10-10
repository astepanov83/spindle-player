#!/bin/sh
# Builds the ffmpeg and ffprobe Spindle ships, from FFmpeg's own source. They
# only read and decode audio, with FFmpeg's built-in decoders and no outside
# libraries, so the build is LGPL and its whole source is the FFmpeg tarball
# and this script. Run by .github/workflows/ffmpeg.yml: linux-x64 in Alpine
# (musl, so the programs are fully static), win32-x64 cross-compiled with
# mingw-w64 on Ubuntu.
#
#   scripts/ffmpeg/build.sh <linux-x64 | win32-x64> <ffmpeg-X.tar.xz> <out dir>
#
# Writes ffmpeg and ffprobe (named ffmpeg-<target>[.exe]) and
# BUILD-<target>.txt, the configure line and compiler, to <out dir>.
set -eu

target=$1
tarball=$2
out=$(mkdir -p "$3" && cd "$3" && pwd)

work=$(mktemp -d)
tar -xJf "$tarball" -C "$work" --strip-components=1
cd "$work"

# Every built-in audio decoder: the ones between "audio codecs" and
# "subtitles" in allcodecs.c. Spindle hands ffmpeg any file Chromium can't
# play, and ffprobe any file music-metadata can't read.
decoders=$(sed -n '/^\/\* audio codecs \*\//,/^\/\* subtitles \*\//s/^.*ff_\([a-z0-9_]*\)_decoder;.*$/\1/p' \
  libavcodec/allcodecs.c | paste -sd, -)
count=$(echo "$decoders" | tr ',' '\n' | wc -l)
if [ "$count" -lt 150 ]; then
  echo "build.sh: found only $count audio decoders; allcodecs.c has changed" >&2
  exit 1
fi

# What Spindle asks of them (src/main/plugins/files/decode.ts and probe.ts):
# read a local file or pipe, find the first audio stream, seek, decode, mix
# and resample, and write raw 16 or 24-bit PCM to stdout.
set -- \
  --disable-everything --disable-autodetect --disable-network \
  --disable-doc --disable-debug --disable-ffplay \
  --disable-avdevice --disable-swscale \
  --enable-protocol=file,pipe \
  --enable-demuxers --enable-parsers --enable-bsfs \
  --enable-decoder="$decoders" \
  --enable-encoder=pcm_s16le,pcm_s24le \
  --enable-muxer=pcm_s16le,pcm_s24le \
  --enable-filter=aresample \
  --extra-version=spindle

case $target in
  linux-x64)
    set -- "$@" --extra-ldflags=-static
    cc=gcc
    exe=
    ;;
  win32-x64)
    set -- "$@" --arch=x86_64 --target-os=mingw32 \
      --cross-prefix=x86_64-w64-mingw32- --extra-ldflags=-static
    cc=x86_64-w64-mingw32-gcc
    exe=.exe
    ;;
  *)
    echo "build.sh: unknown target $target" >&2
    exit 1
    ;;
esac

./configure "$@" >configure.log 2>&1 || { cat configure.log; tail -50 ffbuild/config.log >&2; exit 1; }
cat configure.log
# configure only warns about a name it doesn't know, and leaves that part out
if grep -q 'did not match anything' configure.log; then
  echo "build.sh: configure didn't know an option above" >&2
  exit 1
fi
make -j"$(nproc)" ffmpeg$exe ffprobe$exe

# Nothing linked at run time but the system: none on Linux, and only
# Windows' own DLLs on Windows. SHELL32 is how ffmpeg gets its arguments as
# Unicode, so file names in any language reach it whole.
for p in ffmpeg ffprobe; do
  case $target in
    linux-x64)
      if readelf -d $p | grep -q NEEDED; then
        echo "build.sh: $p is not static" >&2
        readelf -d $p >&2
        exit 1
      fi
      ;;
    win32-x64)
      dlls=$(x86_64-w64-mingw32-objdump -p $p.exe | sed -n 's/^.*DLL Name: //p' | tr 'a-z' 'A-Z')
      echo "$p.exe imports: $(echo $dlls)"
      for d in $dlls; do
        case $d in
          KERNEL32.DLL | MSVCRT.DLL | API-MS-WIN-CRT-*.DLL | ADVAPI32.DLL | BCRYPT.DLL | \
            SHELL32.DLL | OLE32.DLL | USER32.DLL | PSAPI.DLL) ;;
          *)
            echo "build.sh: $p.exe needs $d, which Windows doesn't have" >&2
            exit 1
            ;;
        esac
      done
      echo "$dlls" | grep -qx SHELL32.DLL || {
        echo "build.sh: $p.exe doesn't take Unicode arguments (no SHELL32)" >&2
        exit 1
      }
      ;;
  esac
  cp $p$exe "$out/$p-$target$exe"
done

{
  echo "FFmpeg $(cat VERSION) for $target"
  echo "Compiler: $($cc --version | head -1)"
  echo "Configure line:"
  printf '  %s\n' "$@" | sed 's/^  --enable-decoder=.*/  --enable-decoder=(every audio decoder; see below)/'
  echo "Audio decoders ($count):"
  echo "$decoders" | tr ',' '\n' | paste -sd' ' - | fold -s -w 76 | sed 's/^/  /'
} >"$out/BUILD-$target.txt"
cat "$out/BUILD-$target.txt"

cd /
rm -rf "$work"
