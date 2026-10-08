// The library process (an Electron utilityProcess). It owns the index: reads and
// writes library.json, scans the music folders, groups albums, and hands main
// the page's library as ready JSON bytes. Main only forwards, so a 50k library
// never blocks it. Its own process means its own libuv pool: slow NAS reads here
// can't hold up main's audio requests and saves.
import { hash, randomBytes } from 'crypto'
import { existsSync, renameSync } from 'fs'
import { readdir, readFile, rm, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type { ArtistChanges } from '../../../shared/plugins/files/artist-edit'
import {
  addAsked,
  aiKeys,
  applyChanges,
  artistGroupsTask,
  cacheKeys,
  convertOld,
  knownArtists,
  knownCache,
  noArtists,
  noCache,
  parseArtists,
  parseCache,
  parseOldGroups,
  parseOldOverrides,
  prune,
  pruneCache,
  resolve,
  serializeArtists,
  artistsText,
  serializeCache,
  tagSpellings,
  usedKeys,
  yourKeys,
  type ArtistAiCache,
  type ArtistsData,
  type ArtistsFile,
  type Spelling
} from '../../../shared/plugins/files/artists-file'
import type { ScanStatus } from '../../../shared/library'
import type { CoverSource } from '../../../shared/settings'
import { JsonFileWriter, openJsonFile, readJsonFile } from '../../json-file'
import { buildLibrary, type BuiltLibrary } from './group'
import { Pacer, scanSlow, Turns } from './pacer'
import { decodeCue, parseCue } from './cue'
import { probeTags } from './probe'
import { readTags } from './read-tags'
import {
  dirOf,
  dropOutside,
  emptyIndex,
  isUnder,
  missingPalettes,
  parseIndex,
  prunePalettes,
  readAgain,
  serializeIndex,
  coversInUse
} from './merge'
import { extOf, frontCover, normalizeTags } from './tags'
import type { ListedImage } from './walk'
import { scanFiles } from './scan-files'
import { pruneCoverFiles, removeOldTemp } from './cover-prune'
import { ownCopy } from './bytes'
import { ScanChain, Stopped } from './scan-chain'
import { confirmMoves } from './moves'
import { mergeMoves, type IdMoves } from '../../../shared/id-moves'
import { pictureWithHash } from './cover-source'
import { AiOverMessages } from './ai-messages'
import { promptNumber, taskNames } from './group-artists'
import { fullCheckDue, groupArtists, limitWaitMs, startFullCheck } from './group-artists-job'
import { scanLogLine } from './scan-log'
import { markerOf, smallName } from '../../covers/cover-names'
import { CoverFetcher } from './cover-fetch'
import { findSongCover, stopsSongLookups } from './song-cover'
import { loudGapMs, PaceTimer, PublishTimer } from './publish'
import { diffLibrary, type LibraryMessage } from '../../../shared/plugins/files/library-patch'
import { CoverHttp, defaultLimits, NetError } from './cover-http'
import {
  dropGone,
  dropNotFound,
  lostCovers,
  parseFetched,
  serializeFetched,
  type Fetched
} from './fetched-store'
import { listSources, pruneSources, readSource, saveSource } from './fetched-files'
import {
  addLoudness,
  completes,
  isFresh,
  loudCounts,
  loudPlan,
  parseLoudness,
  pruneLoudness,
  serializeLoudness,
  type LoudFile,
  type LoudPlan,
  type LoudStore
} from './loudness'
import { LoudQueue } from './loudness-queue'
import { readLoudness } from './loudness-read'
import {
  cueReaderVersion,
  readerVersion,
  type CueEntry,
  type FileEntry,
  type FolderImage,
  type LibraryIndex,
  type MediaInfo,
  type WorkerIn,
  type WorkerOut,
  type WorkerStart
} from './types'

const port = process.parentPort
// from main's first message; nothing else runs before it comes
let start: WorkerStart

// Disk jobs at once: folder listings, stats, and tag or image reads. Reading is
// mostly waiting on the disk, so a few at once is faster when nothing plays.
// While a song plays, one job at a time of all three kinds, and reads rest
// after each, so a NAS link is left for the audio.
const turns = new Turns()
const dirPace = new Pacer(8, 1, false, undefined, undefined, turns)
const statPace = new Pacer(16, 2, false, undefined, undefined, turns)
const readPace = new Pacer(4, 1, true, undefined, undefined, turns)

// Music files is on. Off: no scan, no album or artist lookup, and the index,
// fetched-covers.json, artists.json and artist-ai-cache.json are not
// written. The radio's song cover lookups go on (see 'set-on').
let on = true

let playing = false
let playingDev: number | undefined
// devices of the music folders being scanned
let scannedDevs = new Set<number>()

function setPace(): void {
  const slow = scanSlow(playing, playingDev, scannedDevs)
  for (const p of [dirPace, statPace, readPace]) p.setSlow(slow)
}

async function devicesOf(folders: string[]): Promise<Set<number>> {
  const out = new Set<number>()
  for (const f of folders) {
    try {
      out.add((await stat(f)).dev)
    } catch {
      // not found; the walk reports it
    }
  }
  return out
}

// Pictures sent to main and not yet written, so a big first scan doesn't pile them up.
const coversAtOnce = 16
// While a scan runs, what was read so far is saved this often, so a quit or crash keeps it.
const saveMs = 15000

function post(msg: WorkerOut): void {
  port.postMessage(msg)
}

function log(text: string): void {
  post({ type: 'log', text })
}

// --- state ---

let ix: LibraryIndex = emptyIndex()
let built: BuiltLibrary = {
  data: { albums: [], tracks: [], folders: [] },
  paths: new Map(),
  queries: [],
  artists: []
}
// the index changed since the page last got the library
let dirty = false
let status: ScanStatus = {
  folders: [],
  phase: 'idle',
  done: 0,
  total: 0,
  tracks: 0,
  albums: 0,
  failed: 0,
  missing: []
}

function setStatus(change: Partial<ScanStatus>): void {
  status = { ...status, ...change }
  post({ type: 'status', status })
}

let lastProgress = 0
function progress(gen: number, change: Partial<ScanStatus>, force = false): void {
  // a stopped scan may still have a listing or read on its way
  if (chain.stale(gen)) return
  const now = Date.now()
  if (!force && now - lastProgress < 100) return
  lastProgress = now
  setStatus(change)
}

// the index changed since it was last handed to the writer
let unsaved = false

// bumped on every change to the index
let ixEdits = 0

function markChanged(): void {
  ixEdits++
  dirty = true
  unsaved = true
  publisher.soon()
}

// --- covers found online (ticket 014) ---

let fetched: Fetched = new Map()
// artist photos, by artist key (ticket 021); same file, own section
let photos: Fetched = new Map()
// none when the file could not be read: it may still be fine, so it is never replaced
let fetchedWriter: JsonFileWriter<unknown> | undefined
// bumped on every change to fetched, for the covers in use
let fetchedEdits = 0
let fetcher: CoverFetcher | undefined
// a scan and its prune have ended at least once
let pruned = false
// the setting from main; a change can come before the fetcher is made
let fetchSetting: { on: boolean; sources: Record<CoverSource, boolean> } | undefined

// a change made while off (a source turned on drops "not found" marks), written once on
let fetchedChangedOff = false

function saveFetched(): void {
  fetchedEdits++
  if (on) fetchedWriter?.schedule(serializeFetched(fetched, photos))
  else fetchedChangedOff = true
}

const abortableSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted || ms <= 0) return resolve()
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        resolve()
      },
      { once: true }
    )
  })

function setFetch(on: boolean, sources: Record<CoverSource, boolean>): void {
  const before = fetchSetting
  fetchSetting = { on, sources }
  fetcher?.setOptions(on, sources)
  if (!on) setStatus({ fetch: undefined })
  // a lookup holds the services it started with; main asks again
  if (stopsSongLookups(before, fetchSetting)) stopSongLookups()
}

// --- radio song covers (ticket 032) ---

// the album lookup's, so both keep to the same limits
let http: CoverHttp | undefined
// song cover lookups running, by main's request number
const songLookups = new Map<number, AbortController>()

function stopSongLookups(): void {
  for (const stop of songLookups.values()) stop.abort()
}

// Looks the song up with the setting as it is now; main makes the cover.
async function songCover(req: number, artist: string, song: string): Promise<void> {
  const s = fetchSetting
  if (!s?.on || !http || closing) return post({ type: 'reply', req, song: 'later' })
  const stop = new AbortController()
  songLookups.set(req, stop)
  try {
    const r = await findSongCover(http, s.sources, { artist, song }, stop.signal)
    if (typeof r === 'string') post({ type: 'reply', req, song: r })
    else post({ type: 'reply', req, song: 'found', data: r.data })
  } catch (e) {
    if (!stop.signal.aborted) log(`Song cover lookup failed: ${e}`)
    post({ type: 'reply', req, song: 'later' })
  } finally {
    songLookups.delete(req)
  }
}

// the downloaded pictures, to make the large cover from
let sourcesDir = ''
let sources = new Set<string>()

async function startFetcher(s: WorkerStart): Promise<void> {
  sourcesDir = join(dirname(s.fetchedPath), 'fetched-covers')
  sources = await listSources(sourcesDir)
  const r = readJsonFile(s.fetchedPath)
  if (r.kind === 'broken' || r.kind === 'unreadable')
    log(`Online covers file is ${r.kind}: ${s.fetchedPath}`)
  fetched = parseFetched(r.kind === 'ok' ? r.value : undefined)
  photos = parseFetched(r.kind === 'ok' ? r.value : undefined, 'artists')
  if (r.kind !== 'unreadable')
    fetchedWriter = new JsonFileWriter<unknown>(
      s.fetchedPath,
      1000,
      (e) => log(`Could not save ${s.fetchedPath}: ${e}`),
      0
    )
  http = new CoverHttp({
    fetch: (u, i) => fetch(u, i),
    sleep: abortableSleep,
    userAgent: s.userAgent,
    limits: defaultLimits()
  })
  fetcher = new CoverFetcher({
    http,
    addCover: addFetchedCover,
    // with no source picture there is no large cover, so it is downloaded again
    hasCover: (h) => cached.has(h) && sources.has(h),
    fetched,
    photos,
    changed: (found) => {
      saveFetched()
      if (found) publisher.soon()
    },
    status: (f) => {
      if (fetchSetting?.on) setStatus({ fetch: f })
    },
    now: () => Date.now(),
    sleep: abortableSleep,
    log
  })
  const opt = fetchSetting ?? s.fetch
  setFetch(opt.on, opt.sources)
}

// --- loudness curves for the sound picture (ticket 106) ---

// the sound style is chosen: the curves are read and sent with the albums
let sound = false
let loud: LoudStore = new Map()
// none when the file could not be read: it may still be fine, so it is never replaced
let loudWriter: JsonFileWriter<unknown> | undefined
// the files to read, from the last build while sound is on
let plan: LoudPlan | undefined
// files before this place in plan.files are read
let planDone = 0
const loudValues = new WeakMap<Uint8Array, string>()
// files that could not be read this time (a drive gone away), tried again after the next scan
const loudLater = new Set<string>()
// the app window is closed: nothing is read until one opens
let windowGone = false
// a change not handed to the writer yet
let loudUnsaved = false
let loudSave: ReturnType<typeof setTimeout> | undefined

function loadLoudness(s: WorkerStart): void {
  const r = readJsonFile(s.loudnessPath)
  if (r.kind === 'broken' || r.kind === 'unreadable')
    log(`Loudness file is ${r.kind}: ${s.loudnessPath}`)
  loud = parseLoudness(r.kind === 'ok' ? r.value : undefined)
  if (r.kind !== 'unreadable')
    loudWriter = new JsonFileWriter<unknown>(
      s.loudnessPath,
      0,
      (e) => log(`Could not save ${s.loudnessPath}: ${e}`),
      0
    )
}

// A file read every second or so would put off a debounced write for ever,
// so it is written at most every saveMs. Nothing is written while off.
function saveLoudness(): void {
  loudUnsaved = true
  if (loudSave || !on) return
  loudSave = setTimeout(() => {
    loudSave = undefined
    if (!on || !loudUnsaved) return
    loudUnsaved = false
    loudWriter?.schedule(serializeLoudness(loud))
  }, saveMs)
}

function flushLoudness(): void {
  clearTimeout(loudSave)
  loudSave = undefined
  if (on && loudUnsaved) {
    loudUnsaved = false
    loudWriter?.schedule(serializeLoudness(loud))
  }
  loudWriter?.flushSync()
}

function nextLoud(running: ReadonlySet<string>): LoudFile | undefined {
  const files = plan?.files ?? []
  for (let i = planDone; i < files.length; i++) {
    const f = files[i]
    const fresh = isFresh(loud.get(f.path), f)
    if (fresh && i === planDone) planDone++
    if (fresh || running.has(f.path) || loudLater.has(f.path)) continue
    // a music folder the last scan could not reach: ffmpeg would fail on each file
    if (status.missing.some((m) => isUnder(f.path, m))) continue
    return f
  }
  return undefined
}

function loudDone(
  f: LoudFile,
  o: { kind: 'ok'; curves: Uint8Array[] } | { kind: 'bad' | 'later'; why: string }
): void {
  if (o.kind === 'later') {
    loudLater.add(f.path)
    log(`Loudness: could not read ${f.path}, trying after the next scan: ${o.why}`)
    return
  }
  // the file changed or went while it was read
  const e = ix.files.get(f.path)
  if (!e || e.size !== f.size || e.mtime !== f.mtime) return
  loud.set(f.path, {
    size: f.size,
    mtime: f.mtime,
    cuts: f.key,
    ...(o.kind === 'ok' ? { curves: o.curves } : {})
  })
  if (o.kind === 'bad') log(`Loudness: could not decode ${f.path}: ${o.why}`)
  saveLoudness()
  loudStatusSoon()
  if (loudRun) {
    loudRun.files++
    loudRun.songs += f.cuts.length
    const c = plan && loudCounts(plan, loud)
    if (c && c.done === c.total) {
      const s = ((performance.now() - loudRun.t0) / 1000).toFixed(1)
      log(`Loudness: read ${loudRun.files} files (${loudRun.songs} songs) in ${s} s`)
      loudRun = undefined
    }
  }
  // the page gets the library again only when an album's curves are all in
  if (plan && completes(plan, loud, f.path)) loudSends.soon()
}

// Curves send the library on their own, slower timer (see loudGapMs).
const loudSends = new PaceTimer({
  run: () => {
    dirty = true
    publisher.soon()
  },
  gapMs: () => loudGapMs(built.data.tracks.length),
  now: () => performance.now(),
  setTimer: (f, ms) => {
    const t = setTimeout(f, ms)
    return () => clearTimeout(t)
  }
})

// when the reads began, for the log line once all are read
let loudRun: { t0: number; files: number; songs: number } | undefined

// The counts go to the page at most once a second.
let loudStatusTimer: ReturnType<typeof setTimeout> | undefined
function loudStatusSoon(): void {
  loudStatusTimer ??= setTimeout(() => {
    loudStatusTimer = undefined
    if (sound && plan) setStatus({ loudness: loudCounts(plan, loud) })
  }, 1000)
}

// After the scan and the cover jobs, while the sound style is chosen.
const loudQueue = new LoudQueue({
  next: nextLoud,
  read: (f, signal) => {
    loudRun ??= { t0: performance.now(), files: 0, songs: 0 }
    return readLoudness(start.ffmpeg!, f.path, f.duration, f.cuts, signal)
  },
  done: loudDone,
  halted: (why) => log(`Loudness: ffmpeg could not run, trying again after the next scan: ${why}`),
  canRun: () =>
    !!plan &&
    sound &&
    on &&
    !closing &&
    !windowGone &&
    !!start.ffmpeg &&
    !chain.busy &&
    sent.size === 0,
  playing: () => playing,
  now: () => performance.now(),
  setTimer: (f, ms) => {
    const t = setTimeout(f, ms)
    return () => clearTimeout(t)
  }
})

function setSound(next: boolean): void {
  if (next === sound) return
  sound = next
  if (!sound) {
    loudQueue.stop()
    plan = undefined
  } else {
    loudLater.clear()
    loudQueue.reset()
  }
  // the albums get their curves, or lose them
  dirty = true
  publisher.now()
  if (!sound) setStatus({ loudness: undefined })
  loudQueue.kick()
}

// --- who is who: artists.json (ticket 069) ---

let artists: ArtistsFile = noArtists()
// none when the file could not be read: it may still be fine, so it is never replaced
let artistsWriter: JsonFileWriter<ArtistsData> | undefined
// the tags already sent to the model (artist-ai-cache.json)
let aiCache: ArtistAiCache = noCache(promptNumber)
let cacheWriter: JsonFileWriter<unknown> | undefined
// AiClient.on and AiClient.enabled of the files plugin's tasks, from main (see 'ai-on')
let aiOn: Record<string, boolean> = {}
let aiEnabled: Record<string, boolean> = {}
// each tag key's spelling in the library, from the last build
let spellings = new Map<string, string>()
const spelling: Spelling = (k) => spellings.get(k)

// A broken file or one of an unknown version is copied aside before it is
// written again (see openJsonFile): these took the user's time to make. True
// when artists.json was there, and whether none of it could be used.
function loadArtists(s: WorkerStart): { had: boolean; unusable: boolean } {
  const had = existsSync(s.artistsPath)
  const f = openJsonFile(s.artistsPath, 'Artists', knownArtists)
  artists = parseArtists(f.value)
  if (f.canWrite)
    artistsWriter = new JsonFileWriter<ArtistsData>(
      s.artistsPath,
      1000,
      (e) => log(`Could not save ${s.artistsPath}: ${e}`),
      artistsText
    )
  const c = openJsonFile(s.aiCachePath, 'Artist AI cache', knownCache)
  aiCache = parseCache(c.value, promptNumber)
  if (c.canWrite)
    cacheWriter = new JsonFileWriter<unknown>(s.aiCachePath, 1000, (e) =>
      log(`Could not save ${s.aiCachePath}: ${e}`)
    )
  return { had, unusable: had && !knownArtists(f.value) }
}

const saveArtists = (): void => {
  if (on) artistsWriter?.schedule(serializeArtists(artists))
}

const saveCache = (): void => {
  if (on) cacheWriter?.schedule(serializeCache(aiCache))
}

function setArtists(c: ArtistChanges): void {
  if (!on || !applyChanges(artists, c, spelling)) return
  saveArtists()
  dirty = true
  publisher.now()
}

// The old files still to move: write: artists.json came from them, so it is
// written first. Nothing is written while off, so the move waits for on.
let oldFiles: { write: boolean } | undefined
// The index was empty at start, so the move waits for the first finished scan.
let convertLater = false

// artist-overrides.json (024) and artist-groups.json (068) become
// artists.json once, at start, after the index is read: tag keys get their
// spelling from the library. With artists.json there already, they are only
// moved aside. With no files in the index there are no spellings yet, so the
// move waits for the first scan that ended (see convertLater). True when
// artists.json came from them.
function convertOldFiles(
  s: WorkerStart,
  had: boolean,
  unusable: boolean,
  scanned: boolean
): boolean {
  const o = readJsonFile(s.oldOverridesPath)
  const g = readJsonFile(s.oldGroupsPath)
  if (o.kind === 'missing' && g.kind === 'missing') return false
  // it may still be fine: tried again next start
  if (o.kind === 'unreadable' || g.kind === 'unreadable') {
    log(
      `Old artist files can't be read; not moving them: ${s.oldOverridesPath}, ${s.oldGroupsPath}`
    )
    return false
  }
  if (!had && !scanned && ix.files.size === 0) {
    convertLater = true
    return false
  }
  oldFiles = { write: !had }
  if (had) {
    if (unusable) log(`${s.artistsPath} can't be used, so the old names stay in the .v1.json files`)
    moveOldFiles(s)
    return false
  }
  for (const [r, path] of [
    [o, s.oldOverridesPath],
    [g, s.oldGroupsPath]
  ] as const)
    if (r.kind === 'broken') log(`Old artist file is broken, nothing was taken from it: ${path}`)
  const old = convertOld(
    parseOldOverrides(o.kind === 'ok' ? o.value : undefined),
    parseOldGroups(g.kind === 'ok' ? g.value : undefined),
    spelling
  )
  artists = old.artists
  addAsked(aiCache.joined, old.cache.joined)
  log(`Artists: moved the old artist files to ${s.artistsPath}`)
  moveOldFiles(s)
  return true
}

// Renames the old files to *.v1.json, never over one that is there. The new
// files are on disk first, so a crash in between moves nothing twice.
function moveOldFiles(s: WorkerStart): void {
  if (!oldFiles || !on) return
  const { write } = oldFiles
  oldFiles = undefined
  if (write) {
    // the cache first: if artists.json is written, its asked keys are there too
    cacheWriter?.schedule(serializeCache(aiCache))
    cacheWriter?.flushSync()
    artistsWriter?.schedule(serializeArtists(artists))
    const ok = artistsWriter?.flushSync() ?? false
    // the old files stay, so the next start makes artists.json again
    if (!ok) return
  }
  for (const path of [s.oldOverridesPath, s.oldGroupsPath]) {
    const to = path.replace(/\.json$/, '.v1.json')
    if (!existsSync(path)) continue
    if (existsSync(to)) {
      log(`Not moving ${path}: ${to} is there already`)
      continue
    }
    try {
      renameSync(path, to)
    } catch (e) {
      log(`Could not move ${path}: ${e}`)
    }
  }
}

// --- artist spellings grouped by a model (ticket 068) ---

// The task's AiClient: messages to main, which has the key.
const ai = new AiOverMessages((m) => post(m))
// the job running, and the wait for a limit to end
let groupsJob: AbortController | undefined
let groupsRetry: ReturnType<typeof setTimeout> | undefined

function setAiOn(tasks: Record<string, boolean>, enabled: Record<string, boolean>): void {
  const wasOn = !!aiOn[artistGroupsTask]
  const wasShown = !!aiEnabled[artistGroupsTask]
  aiOn = tasks
  aiEnabled = enabled
  ai.setOn(tasks, enabled)
  const nowOn = !!aiOn[artistGroupsTask]
  if (wasOn !== nowOn) {
    if (nowOn) startGroupsJob()
    else {
      stopGroupsJob()
      setStatus({ groups: undefined })
    }
  }
  if (wasShown === !!aiEnabled[artistGroupsTask] || !aiKeys(artists).size) return
  dirty = true
  publisher.now()
}

// The button: a run going stops, then every name is checked again. While a
// scan runs the job waits; the saved cache makes the scan's end go on with it.
function recheckNames(): void {
  if (!on || !aiOn[artistGroupsTask]) return
  stopGroupsJob()
  startFullCheck(artists, aiCache)
  saveCache()
  log('Artist groups: checking all names again, asked on the page')
  startGroupsJob()
}

function stopGroupsJob(): void {
  // its progress would stay up; the next run shows its own
  if (groupsJob && status.groups?.state === 'running') setStatus({ groups: undefined })
  groupsJob?.abort()
  groupsJob = undefined
  clearTimeout(groupsRetry)
  groupsRetry = undefined
}

// After a scan that ran to the end, when the task turns on, and when a limit
// ends. One job at a time; it goes on from the keys already asked. Never while
// a scan or its prune runs: the library is half built, and the scan's end
// starts it.
function startGroupsJob(): void {
  if (!on || closing || groupsJob || chain.busy || !aiOn[artistGroupsTask]) return
  clearTimeout(groupsRetry)
  groupsRetry = undefined
  // the names come from the library as it is now
  if (dirty) publisher.now()
  const stop = new AbortController()
  groupsJob = stop
  // a cache from another prompt number loads empty: every name is asked again
  if (fullCheckDue(artists, aiCache)) {
    startFullCheck(artists, aiCache)
    saveCache()
    log('Artist groups: checking all names again')
  }
  groupArtists(
    {
      ai,
      names: taskNames(built.data.albums, built.data.tracks, yourKeys(artists)),
      artists,
      cache: aiCache,
      spelling,
      saved: () => {
        saveArtists()
        saveCache()
        // setAiOn shows nothing new when there were no groups, so it is done here
        dirty = true
        publisher.now()
      },
      status: (groups) => setStatus({ groups }),
      log,
      now: () => Date.now()
    },
    stop.signal
  )
    .then(
      (end) => {
        if (end.end !== 'limit' || end.retryAt === undefined || stop.signal.aborted) return
        groupsRetry = setTimeout(startGroupsJob, limitWaitMs(end.retryAt, Date.now()))
      },
      (e) => {
        // a stop throws the abort error; what was saved stays
        if (!stop.signal.aborted) log(`Artist groups failed: ${e}`)
      }
    )
    .finally(() => {
      if (groupsJob === stop) groupsJob = undefined
    })
}

// Groups albums, for the page and the lookups.
function build(): void {
  dirty = false
  built = buildLibrary(
    ix,
    (h) => cached.has(h),
    fetched,
    status.folders,
    photos,
    // While the task is switched off the AI's links are kept but not shown.
    // A provider that is not ready (a key that lasts until quit, a refused
    // key) does not hide them: only the job waits for it.
    resolve(artists, !!aiEnabled[artistGroupsTask])
  )
  const track = new Map(built.data.tracks.map((t) => [t.id, t]))
  spellings = tagSpellings(built.data.albums, (id) => track.get(id))
  let failed = 0
  for (const e of ix.files.values()) if (e.error) failed++
  if (sound) {
    plan = loudPlan(
      built.data,
      (id) => built.paths.get(id),
      (p) => ix.files.get(p)
    )
    planDone = 0
    addLoudness(built.data, plan, loud, loudValues)
  }
  setStatus({
    tracks: built.data.tracks.length,
    albums: built.data.albums.length,
    failed,
    ...(plan && sound ? { loudness: loudCounts(plan, loud) } : {})
  })
  fetcher?.setQueries(built.queries, built.artists)
}

// New each time this process starts, so the page can tell a patch made here
// from one of a process before it (see library-patch.ts).
const epoch = randomBytes(6).toString('hex')
// libraries sent to the page so far; built.data is the last one
let libraries = 0

const encode = (m: LibraryMessage): Uint8Array => new TextEncoder().encode(JSON.stringify(m))

// The index started empty (no library.json yet, or a broken one) and no scan
// has ended since: the page counts no song as gone until one has (see
// FullLibrary), so an upgrade's first scan doesn't drop the queue's songs.
let partial = false
// what the page was last told
let sentPartial = false
const partialPart = (): { partial?: true } => {
  sentPartial = partial
  return partial ? { partial: true } : {}
}

// The whole library, for a page load or a page that missed a patch.
function encodeLibrary(): Uint8Array {
  return encode({ epoch, n: libraries, ...built.data, ...partialPart() })
}

// Groups albums and sends the page what changed since the last library it got.
function publish(): void {
  const old = built.data
  build()
  const d = diffLibrary(old, built.data)
  if (!d && sentPartial === partial) return
  const body = d ?? { albums: [], tracks: [], goneTracks: [] }
  post({
    type: 'library',
    bytes: encode({
      patch: true,
      epoch,
      from: libraries,
      n: libraries + 1,
      ...body,
      ...partialPart()
    })
  })
  libraries++
  firstSent ??= Math.round(performance.now() - scanStart)
}

// when the running scan started, and when it first sent songs, for the log
let scanStart = 0
let firstSent: number | undefined

// The page gets changes a few seconds apart at most (see publish.ts).
const publisher = new PublishTimer({
  publish,
  tracks: () => built.data.tracks.length,
  now: () => performance.now(),
  setTimer: (f, ms) => {
    const t = setTimeout(f, ms)
    return () => clearTimeout(t)
  }
})

// One line, since the index can be tens of MB. The writer keeps one write at a
// time and drops a write that a newer one replaced; flushSync is for quitting.
let writer: JsonFileWriter<unknown> | undefined
const makeWriter = (): JsonFileWriter<unknown> =>
  new JsonFileWriter<unknown>(
    start.indexPath,
    1000,
    (e) => log(`Could not save the library index: ${e}`),
    0
  )

// set once main asked for the last save before quitting
let closing = false

function saveIndex(): void {
  if (!unsaved || closing || !writer || !on) return
  unsaved = false
  writer.schedule(serializeIndex(ix))
}

// --- cover cache ---

// "<hash>.jpg" made, "<hash>.bad" could not be decoded, sent: waiting for main.
// claimed: sent, or waiting for a free slot. It is taken before any wait, so two
// files with the same picture never send it twice (two writes to one file).
const cached = new Set<string>()
const bad = new Set<string>()
const sent = new Set<string>()
const claimed = new Set<string>()
let coverWaiters: (() => void)[] = []

function wakeCoverWaiters(): void {
  const w = coverWaiters
  coverWaiters = []
  for (const f of w) f()
}

// A manual Rescan tries pictures marked bad once more: a decode can fail for
// lack of memory, and the marker would keep the album without a cover for good.
let retryBad = false
const known = (h: string): boolean => cached.has(h) || (!retryBad && bad.has(h))

async function sendCover(data: Uint8Array, gen: number): Promise<string> {
  const h = hash('sha1', data)
  if (known(h) || claimed.has(h)) return h
  claimed.add(h)
  await waitForSlot(h, () => checkGen(gen))
  sent.add(h)
  post({ type: 'cover', hash: h, data: ownCopy(data) })
  return h
}

// A picture found online: sent like a local one, then waited for, so the
// lookup knows whether it decoded before it keeps it.
async function addFetchedCover(data: Uint8Array): Promise<{ hash: string; ok: boolean }> {
  const h = hash('sha1', data)
  if (cached.has(h)) return { hash: h, ok: await keepSource(h, data) }
  // Chromium could not decode it before; no need to send it to main again
  if (bad.has(h)) return { hash: h, ok: false }
  if (!claimed.has(h)) {
    claimed.add(h)
    await waitForSlot(h, () => {})
    sent.add(h)
    post({ type: 'cover', hash: h, data })
  }
  while (claimed.has(h)) await new Promise<void>((r) => coverWaiters.push(r))
  if (cached.has(h)) return { hash: h, ok: await keepSource(h, data) }
  if (bad.has(h)) return { hash: h, ok: false }
  // main could not make it this time (no window, a timeout): look again later
  throw new NetError('the cover could not be made yet')
}

// Keeps a downloaded picture for the large cover. Not kept (a full disk): the
// lookup counts it as not found yet and downloads it again later.
async function keepSource(h: string, data: Uint8Array): Promise<boolean> {
  if (sources.has(h)) return true
  try {
    await saveSource(sourcesDir, h, data)
    sources.add(h)
    return true
  } catch (e) {
    log(`Could not keep a downloaded cover: ${e}`)
    return false
  }
}

// Waits for a free slot to send a picture to main. The hash must be claimed
// first. check throws when the wait should end (a stopped scan).
async function waitForSlot(h: string, check: () => void): Promise<void> {
  try {
    while (sent.size >= coversAtOnce) {
      await new Promise<void>((r) => coverWaiters.push(r))
      check()
    }
  } catch (e) {
    claimed.delete(h)
    throw e
  }
}

// Covers cached before palettes were picked (an index from before 009, or a
// quit before the index was saved) get one from the small cover, so no music
// file is read again.
async function fillPalettes(gen: number): Promise<void> {
  for (const h of missingPalettes(ix, (x) => cached.has(x), fetched, photos)) {
    if (claimed.has(h)) continue
    claimed.add(h)
    await waitForSlot(h, () => checkGen(gen))
    let data: Uint8Array
    try {
      data = new Uint8Array(await readFile(join(start.coversDir, smallName(h))))
    } catch {
      // pruned or deleted meanwhile; the file is read again when its cover is missing
      claimed.delete(h)
      continue
    }
    sent.add(h)
    post({ type: 'cover', hash: h, data, paletteOnly: true })
  }
}

// Found covers whose small file is gone get it made again from the kept
// picture, so they show even with the online lookup off.
async function refillFetched(gen: number): Promise<void> {
  const kept = (x: string): boolean => sources.has(x)
  const lost = new Set([...lostCovers(fetched, known, kept), ...lostCovers(photos, known, kept)])
  for (const h of lost) {
    let data: Uint8Array
    try {
      data = await readSource(sourcesDir, h)
    } catch {
      // gone meanwhile; the lookup downloads it again
      continue
    }
    checkGen(gen)
    await sendCover(data, gen)
  }
}

async function loadCached(): Promise<void> {
  try {
    for (const name of await readdir(start.coversDir)) {
      const m = markerOf(name)
      if (m) (m.bad ? bad : cached).add(m.hash)
    }
  } catch {
    // no cache yet
  }
}

// Covers other plugins keep in the cover cache (station logos), and a count of changes.
let keptCovers: string[] = []
let keptEdits = 0

// The covers the index, the online lookup and main use, made again only after one changed.
let usedCache: { edits: string; used: Set<string> } | undefined
function liveUsed(): Set<string> {
  const edits = `${ixEdits}.${fetchedEdits}.${keptEdits}`
  if (usedCache?.edits !== edits)
    usedCache = { edits, used: coversInUse(ix, [fetched, photos], keptCovers) }
  return usedCache.used
}

// Deletes covers nothing points at any more, and their palettes. It stops when
// a newer scan is asked for; that scan prunes when it ends. The chain starts
// no scan before it ended, so it never deletes a cover a newer scan uses.
async function pruneCovers(gen: number): Promise<void> {
  const stale = (): boolean => chain.stale(gen)
  if (stale()) return
  // palettes don't change what the page shows, so only the file needs saving
  if (prunePalettes(ix, liveUsed())) {
    unsaved = true
    saveIndex()
  }
  await pruneCoverFiles({
    dir: start.coversDir,
    used: liveUsed,
    busy: (h) => claimed.has(h),
    stale,
    forget: (h) => {
      cached.delete(h)
      bad.delete(h)
    }
  })
}

// --- scan ---

const checkGen = (gen: number): void => chain.check(gen)

async function readFileEntry(
  path: string,
  mtime: number,
  size: number,
  gen: number
): Promise<FileEntry> {
  let meta
  try {
    meta = await readTags(path, { probe })
  } catch (error) {
    // listed by its file and folder names; tried again on a Rescan or once it changes
    return { path, mtime, size, duration: 0, error: String((error as Error)?.message ?? error) }
  }
  const entry: FileEntry = { path, mtime, size, ...normalizeTags(meta, extOf(path)) }
  const pic = frontCover(meta.common.picture)
  if (pic?.data.length) entry.cover = await sendCover(pic.data, gen)
  return entry
}

// ffprobe, once main said where it is
const probe = (path: string): ReturnType<typeof probeTags> =>
  start.ffprobe ? probeTags(start.ffprobe, path) : Promise.reject(new Error('no ffprobe'))

// Cue sheets are a few KB. One that can't be read or has no audio tracks is
// kept without a sheet, so it isn't read again until it changes.
async function readCue(f: { path: string; mtime: number; size: number }): Promise<CueEntry> {
  const c: CueEntry = { ...f, reader: cueReaderVersion }
  try {
    // a "cue" of megabytes is not a cue sheet
    if (f.size <= 1024 * 1024) {
      const sheet = parseCue(decodeCue(new Uint8Array(await readFile(f.path))))
      if (sheet) c.sheet = sheet
    }
  } catch {
    // gone or unreadable: no sheet; the image is listed as one song
  }
  return c
}

async function readImage(
  { dir, path }: ListedImage,
  old: FolderImage | undefined,
  gen: number
): Promise<FolderImage | undefined> {
  let s
  let data
  try {
    s = await stat(path)
    const mtime = Math.floor(s.mtimeMs)
    if (old && old.path === path && old.mtime === mtime && old.size === s.size && known(old.cover))
      return old
    data = await readFile(path)
  } catch {
    return undefined
  }
  const cover = await sendCover(data, gen)
  const im: FolderImage = { path, mtime: Math.floor(s.mtimeMs), size: s.size, cover }
  if (dir !== dirOf(path)) im.dir = dir
  return im
}

// Turned off: a scan running stops, the lookup holds, and what was read or
// found while on is written now, as nothing is written while off. Turned on:
// main asks for a scan, as at start.
function setOn(next: boolean): void {
  if (next === on) return
  if (!next) {
    chain.stop()
    fetcher?.hold()
    stopGroupsJob()
    loudQueue.stop()
    flushLoudness()
    saveIndex()
    writer?.flushSync()
    fetchedWriter?.flushSync()
    artistsWriter?.flushSync()
    cacheWriter?.flushSync()
  }
  on = next
  if (on) moveOldFiles(start)
  if (on && fetchedChangedOff) {
    fetchedChangedOff = false
    saveFetched()
  }
  if (on && loudUnsaved) saveLoudness()
  if (on) {
    clearTimeout(offPrune)
    offPrune = undefined
  } else pruneWhileOff()
}

// While off no scan runs, and so no prune after one: covers other plugins drop
// (radio song covers) would stay on disk for good. So the prune runs alone, a
// while after the start and after the kept covers change; one wait covers a
// run of changes. The index's covers stay in use, so files' own are kept.
export const offPruneMs = 30_000
let offPrune: ReturnType<typeof setTimeout> | undefined
function pruneWhileOff(): void {
  if (on || closing || offPrune) return
  offPrune = setTimeout(() => {
    offPrune = undefined
    // a scan of nothing: the chain keeps it apart from a scan asked for later
    if (!on && !closing) void chain.request(async () => {})
  }, offPruneMs)
}

// Old id -> new id of songs whose path moved this run, so a song that was
// playing under its old id still plays.
let aliases: IdMoves = {}

// Files found under a new path (decision 104) moved in the index with what
// was read; main and the page get the id changes once, before the library
// with the new ids.
function movedIds(ids: IdMoves, files: number): void {
  markChanged()
  aliases = mergeMoves(aliases, ids)
  // kept in the index until main says the files have them
  ix.pendingMoves = mergeMoves(ix.pendingMoves, ids)
  log(`Library: ${files} files are now reached by another path; their ids changed`)
  // On disk before main renames its files: a crash in between must not leave
  // new ids in the queue and old paths in the index. If this write fails the
  // map is still sent, so this run stays right.
  saveIndex()
  writer?.flushSync()
  post({ type: 'ids-moved', moves: ix.pendingMoves })
  publisher.now()
}

// Walks, stats and reads the music folders (see scan-files.ts). New and
// changed songs reach the page as they are read (publish.ts). True when it
// ran to the end; a stopped scan throws.
async function scan(
  folders: string[],
  retryFailed: boolean,
  gen: number,
  id: number
): Promise<boolean> {
  const t0 = performance.now()
  scanStart = t0
  firstSent = undefined
  // when the walk, the stats and the reads ended, for the log
  const ends: number[] = []
  const saving = setInterval(saveIndex, saveMs)
  let failed = false
  let read = 0
  // the online lookup waits for the scan and its prune (see the chain below)
  fetcher?.hold()
  try {
    retryBad = retryFailed
    setStatus({
      folders,
      phase: 'walk',
      done: 0,
      total: 0,
      read: 0,
      missing: [],
      scanFailed: false
    })
    // a folder taken off the list: its songs go at once
    if (dropOutside(ix, folders)) markChanged()
    scannedDevs = await devicesOf(folders)
    setPace()

    // files an older tag reader read are read once more (readTags falls back to ffprobe)
    const oldReader = ix.reader < readerVersion
    ;({ read } = await scanFiles({
      ix,
      folders,
      retryFailed,
      known,
      again: readAgain(ix.reader),
      pace: { dir: dirPace, stat: statPace, read: readPace },
      check: () => checkGen(gen),
      changed: markChanged,
      unsaved: () => (unsaved = true),
      count: (c, force) =>
        progress(
          gen,
          c.walking
            ? { phase: 'walk', done: c.listed, total: 0, read: c.read }
            : { phase: 'read', done: c.read, total: c.planned, read: undefined },
          force
        ),
      lap: () => void ends.push(Math.round(performance.now() - t0)),
      walked: (skipped) =>
        setStatus({ missing: folders.filter((f) => skipped.some((s) => isUnder(f, s))) }),
      moved: movedIds,
      readFile: (path, mtime, size) => readFileEntry(path, mtime, size, gen),
      readCue,
      readImage: (listed, old) => readImage(listed, old, gen)
    }))
    if (oldReader) {
      ix.reader = readerVersion
      unsaved = true
    }
    await fillPalettes(gen)
    await refillFetched(gen)
    // wait until main has every picture, so the covers are there for the albums
    while (sent.size > 0) {
      await new Promise<void>((r) => coverWaiters.push(r))
      checkGen(gen)
    }
  } catch (error) {
    // a stopped scan keeps what it read; the next one carries on from there
    if (error instanceof Stopped) {
      saveIndex()
      throw error
    }
    log(`Library scan failed: ${error}`)
    failed = true
  } finally {
    clearInterval(saving)
  }
  // a stopped scan threw above, so it leaves the library partial
  const ended = partial
  partial = false
  if (dirty || ended) publisher.now()
  saveIndex()
  // results of albums and artists that are gone; a failed scan may have missed some
  if (!failed) {
    const albums = dropGone(fetched, new Set(built.data.albums.map((a) => a.id)))
    const gonePhotos = dropGone(photos, new Set(built.artists.map((a) => a.id)))
    if (albums || gonePhotos) saveFetched()
    const credits = [...built.data.albums, ...built.data.tracks]
    const used = usedKeys(credits)
    if (prune(artists, used)) saveArtists()
    if (pruneCache(aiCache, cacheKeys(artists, used))) saveCache()
    // moved and changed files; a moved one is read again under its new path
    if (pruneLoudness(loud, (p) => ix.files.get(p))) saveLoudness()
    if (convertLater) {
      convertLater = false
      if (convertOldFiles(start, false, false, true)) publisher.now()
    }
  }
  setStatus({ phase: 'idle', done: 0, total: 0, read: undefined, scanFailed: failed })
  post({ type: 'scanned', id })
  log(
    scanLogLine(
      Math.round(performance.now() - t0),
      ends,
      read,
      status.tracks,
      status.albums,
      firstSent
    )
  )
  return !failed
}

// The artist groups job runs once a scan that ran to the end and its prune
// are done. A newer scan asked for meanwhile keeps the chain busy, so its own
// end starts the job.
function scanThenGroups(folders: string[], retryFailed: boolean, id: number): void {
  let ended = false
  void chain
    .request(async (gen) => {
      ended = await scan(folders, retryFailed, gen, id)
    })
    .then(() => {
      if (ended) startGroupsJob()
      // a drive that was gone may be back
      loudLater.clear()
      loudQueue.reset()
      loudQueue.kick()
    })
}

// --- lookups for the protocol ---

// Folder images first: reading one is cheaper than reading tags.
function* coverCandidates(h: string): Generator<() => Promise<Uint8Array | undefined>> {
  for (const im of ix.images.values()) if (im.cover === h) yield () => readFile(im.path)
  for (const e of ix.files.values())
    if (e.cover === h) yield async () => frontCover((await readTags(e.path)).common.picture)?.data
  if (sources.has(h)) yield () => readSource(sourcesDir, h)
}

function coverSource(h: string): Promise<Uint8Array | undefined> {
  return pictureWithHash(h, coverCandidates(h))
}

// What main needs to serve a file by its id.
function mediaInfo(id: string): MediaInfo | undefined {
  const path =
    built.paths.get(id) ?? (Object.hasOwn(aliases, id) ? built.paths.get(aliases[id]) : undefined)
  const e = path ? ix.files.get(path) : undefined
  if (!e) return undefined
  const { codec, duration, sampleRate, channels, bits } = e
  return { path: e.path, codec, duration, sampleRate, channels, bits }
}

port.on('message', (e: Electron.MessageEvent) => {
  const m = e.data as WorkerIn
  switch (m.type) {
    case 'start':
      // here, not when ready: a 'keep-covers' after it may come before that
      keptCovers = m.start.keepCovers
      keptEdits++
      on = m.start.on
      sound = m.start.sound
      aiOn = m.start.aiOn
      aiEnabled = m.start.aiEnabled
      ai.setOn(aiOn, aiEnabled)
      started(m.start)
      pruneWhileOff()
      break
    case 'keep-covers':
      keptCovers = m.hashes
      keptEdits++
      pruneWhileOff()
      break
    case 'scan':
      // main asks for none while off
      if (!on) break
      // it goes on after this scan, from the keys already asked
      stopGroupsJob()
      // the scan gets the disk; what was being read is read again after it
      loudQueue.stop()
      // a manual Rescan looks up every miss again
      if (m.retryFailed) {
        const albums = dropNotFound(fetched)
        if (dropNotFound(photos) || albums) saveFetched()
      }
      scanThenGroups(m.folders, m.retryFailed, m.id)
      break
    case 'fetch-covers':
      setFetch(m.on, m.sources)
      break
    case 'song-cover':
      ready.then(
        () => songCover(m.req, m.artist, m.song),
        () => post({ type: 'reply', req: m.req, song: 'later' })
      )
      break
    case 'cancel':
      songLookups.get(m.req)?.abort()
      break
    case 'set-on':
      setOn(m.on)
      break
    case 'sound':
      void ready.then(() => setSound(m.on))
      break
    case 'song-start':
      loudQueue.hold()
      break
    case 'set-artists':
      void ready.then(() => setArtists(m.changes))
      break
    case 'ai-recheck':
      void ready.then(recheckNames)
      break
    case 'ai-on':
      void ready.then(() => setAiOn(m.tasks, m.enabled))
      break
    case 'ai-reply':
      ai.reply(m)
      break
    case 'resume':
      // a new window: go on unless a scan runs (it releases when done) or none
      // has ended yet (the lookup waits for the first)
      if (on && pruned && !chain.busy && !closing) fetcher?.release()
      windowGone = false
      loudQueue.kick()
      break
    case 'playing':
      playing = m.playing
      playingDev = m.dev
      setPace()
      loudQueue.kick()
      break
    case 'stop':
      chain.stop()
      fetcher?.hold()
      stopSongLookups()
      windowGone = true
      loudQueue.stop()
      break
    case 'cover-done':
      sent.delete(m.hash)
      claimed.delete(m.hash)
      // "retry" stays unknown, so the next scan reads that file again
      if (m.result === 'ok') {
        // A cover made again from its kept picture (refillFetched) comes with
        // no palette, and the send that dropped it may have gone out: send again.
        if (!cached.has(m.hash)) {
          dirty = true
          publisher.soon()
        }
        cached.add(m.hash)
        bad.delete(m.hash)
      } else if (m.result === 'bad') bad.add(m.hash)
      else if (m.result === 'rebuild') {
        // the next scan reads the file or image again, since its cover is gone
        cached.delete(m.hash)
        markChanged()
      }
      if (m.palette) {
        ix.palettes.set(m.hash, m.palette)
        ix.stalePalettes.delete(m.hash)
        markChanged()
      }
      wakeCoverWaiters()
      loudQueue.kick()
      break
    case 'find-track':
      ready.then(
        () => post({ type: 'reply', req: m.req, media: mediaInfo(m.id) }),
        () => post({ type: 'reply', req: m.req })
      )
      break
    case 'get-library':
      ready.then(
        () => post({ type: 'reply', req: m.req, data: encodeLibrary() }),
        () => post({ type: 'reply', req: m.req })
      )
      break
    case 'flush':
      // quitting: main waits for the answer a short while, then this process ends
      saveIndex()
      writer?.flushSync()
      fetcher?.hold()
      stopSongLookups()
      fetchedWriter?.flushSync()
      artistsWriter?.flushSync()
      cacheWriter?.flushSync()
      stopGroupsJob()
      loudQueue.stop()
      flushLoudness()
      closing = true
      clearTimeout(offPrune)
      chain.close()
      post({ type: 'flushed' })
      break
    case 'ids-saved': {
      const left = confirmMoves(ix.pendingMoves, m.moves)
      if (Object.keys(left).length === Object.keys(ix.pendingMoves).length) break
      ix.pendingMoves = left
      // only the file changes; the page's library is the same
      unsaved = true
      saveIndex()
      break
    }
    case 'cover-source':
      ready
        .then(() => coverSource(m.hash))
        .then(
          (data) => post({ type: 'reply', req: m.req, data: data && ownCopy(data) }),
          () => post({ type: 'reply', req: m.req })
        )
      break
  }
})

// Temp files left by a quit or crash in the middle of a write. Only this
// process writes the index, and the one before it has ended. Main writes the
// covers and may be at it now (a restart), so only old ones go there.
async function removeStrayTemp(): Promise<void> {
  const dir = dirname(start.indexPath)
  const names = [start.indexPath, start.artistsPath, start.aiCachePath, start.loudnessPath].map(
    (p) => basename(p)
  )
  try {
    for (const n of await readdir(dir))
      if (names.some((f) => n.startsWith(f + '.')) && n.endsWith('.tmp'))
        await rm(join(dir, n), { force: true })
  } catch {
    // no folder yet
  }
  await removeOldTemp(start.coversDir)
}

// Reads the index and groups it once main sent the start data; main asks for
// the library with 'get-library'.
let started: (s: WorkerStart) => void
const ready = new Promise<WorkerStart>((r) => (started = r)).then(async (s) => {
  start = s
  writer = makeWriter()
  status = { ...status, folders: s.folders }
  await removeStrayTemp()
  await loadCached()
  const { had: hadArtists, unusable } = loadArtists(s)
  await startFetcher(s)
  loadLoudness(s)
  const r = readJsonFile(start.indexPath)
  // the index is only a cache of the music files, so it is made again either way
  if (r.kind === 'broken' || r.kind === 'unreadable')
    log(`Library index is ${r.kind}, scanning again: ${start.indexPath}`)
  ix = parseIndex(r.kind === 'ok' ? r.value : undefined)
  partial = ix.files.size === 0
  ixEdits++
  aliases = mergeMoves(s.aliases ?? {}, ix.pendingMoves)
  // a quit or crash came before main saved them: send them again
  if (Object.keys(ix.pendingMoves).length) post({ type: 'ids-moved', moves: ix.pendingMoves })
  build()
  // the first build gives the tags' spellings
  if (convertOldFiles(s, hadArtists, unusable, false)) build()
})

// Scans and prunes, one after the other; see scan-chain.ts.
const chain = new ScanChain(ready, {
  // after the prune, so it can't delete a cover the lookup just made
  prune: async (gen) => {
    await pruneCovers(gen)
    if (chain.stale(gen)) return
    await pruneSources(sourcesDir, (h) => liveUsed().has(h))
    sources = await listSources(sourcesDir)
    // the lookup stays held while off (a prune with no scan)
    if (chain.stale(gen) || !on) return
    pruned = true
    fetcher?.release()
  },
  // let a stopped scan's waits wake up and see the new number
  wake: wakeCoverWaiters,
  // the window closed mid-scan: a new window must not show old progress
  stopped: () => setStatus({ phase: 'idle', done: 0, total: 0 }),
  log
})
