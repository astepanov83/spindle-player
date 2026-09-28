# Spindle

A desktop music player for local files, built with Electron.

The window takes its colors from the album cover, a visualizer plays around the cover, and the layout comes from a template you choose in settings. Dark and light themes, following the system by default.

## Status

Early. The app shows the three layout templates (Studio, Classic, Focus). Add your music folders under the gear (Settings, Music folders): Spindle reads the tags and covers, keeps an index, and checks the folders again on each start or when you press Rescan. Each album takes its colors from its cover, with a separate accent for dark and light. It plays your music from an album, the song table or a playlist, and carries on with the next album when the list runs out. Formats Chromium can't play (APE, ALAC, WMA, WavPack, AIFF) are decoded with a bundled ffmpeg. A disc image with a `.cue` sheet shows as its tracks, and one track runs into the next with no gap. Settings, volume, playlists and the queue are saved, and each template remembers its window size.

## Run it

Needs Node 22 or newer.

```bash
npm install        # also downloads ffmpeg and ffprobe (see below)
npm run dev        # the app with hot reload
npm run typecheck  # TypeScript and Svelte checks
npm run lint
npm test           # unit tests (Vitest)
npm run package    # AppImage and .deb in dist/
```

### ffmpeg

`npm install` downloads a pinned static build of ffmpeg and ffprobe (7.0.2, Linux x64, about 58 MB) into `resources/ffmpeg/` and checks its sha256. If that fails (offline, another platform), the app still runs, but APE, ALAC, WMA, WavPack and AIFF won't play. `npm run fetch-ffmpeg` tries again; `npm run package` stops if the binaries are missing.

### Ubuntu 24.04 and newer

`npm run dev` may stop with `The SUID sandbox helper binary was found, but is not configured correctly`. Ubuntu blocks the user namespaces that Chromium's sandbox needs. Pick one:

```bash
# Allow them for this repo's Electron only (once per machine, keeps the sandbox)
sudo ./scripts/setup-apparmor-dev.sh

# Or run without Chromium's sandbox, dev only
npx electron-vite dev --noSandbox
```

The installed .deb sets this up by itself. The AppImage turns the sandbox off when it can't use it.

## Prototype

Open `prototype/index.html` in a browser. It has no build step and no dependencies.

- Three layout templates: **Studio**, **Classic** and **Focus**
- Queue placement per template: Tab, Drawer or Column
- Visualizer styles: Ring, Spectrum, Wave, Off
- "Play a song from your computer" runs the visualizer on real sound
- "Show parts" outlines each part, container and button slot

The albums are made up and the covers are generated.

## Design notes

See [docs/design.md](docs/design.md) for how templates, parts and slots fit together.

## License

[MIT](LICENSE)

The packaged app also ships ffmpeg and ffprobe as separate programs, which Spindle runs unmodified. They are not part of Spindle's code and are not under its MIT license: they are John Van Sickle's static build of [FFmpeg](https://ffmpeg.org) 7.0.2, licensed under the GNU GPL version 3 (see `resources/ffmpeg/LICENSE.txt` and `README.txt` after `npm install`, and `resources/app.asar.unpacked/resources/ffmpeg/` in the installed app). The build comes from the [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) release `b6.1.1`.

### Source for ffmpeg and ffprobe

The GPL asks that anyone who gets these programs can also get their source. [`resources/ffmpeg/SOURCE.txt`](resources/ffmpeg/SOURCE.txt) says where it is (an archive next to each release), with a written offer to provide it for at least three years. It is shipped next to the programs.

`node scripts/fetch-ffmpeg-source.mjs` makes that archive: it downloads the FFmpeg 7.0.2 source and the source of each library linked into the build (about 100 MB, needs git and GNU tar), checks each file's sha256 or git commit, and packs them into `ffmpeg-source/ffmpeg-7.0.2-linux-x64-source.tar`. Attach that file to the release and put its link in `SOURCE.txt` before publishing. `SOURCES.txt` in the archive lists what each file is, and the few libraries whose exact version the build does not record.
