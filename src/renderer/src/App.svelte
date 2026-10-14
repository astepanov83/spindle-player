<script lang="ts">
  import { untrack } from 'svelte'
  import { defaultPalettes } from '../../shared/palette'
  import { isSleepPick, sleepPicksFor } from '../../shared/sleep'
  import { isShuffleMode, shuffleNotice } from '../../shared/shuffle'
  import TitleBar from './components/TitleBar.svelte'
  import Settings from './components/Settings.svelte'
  import { keysSection } from './components/settings-sections'
  import CloseAsk from './components/CloseAsk.svelte'
  import SongInfo from './library/SongInfo.svelte'
  import { songInfo } from './library/song-info.svelte'
  import { songKeyOf } from './library/song-info-key'
  import MiniButtons from './components/MiniButtons.svelte'
  import Node from './layout/Node.svelte'
  import Menu from './ui/Menu.svelte'
  import Notice from './ui/Notice.svelte'
  import DragGhost from './ui/DragGhost.svelte'
  import { engine } from './audio/engine'
  import { heard } from './audio/volume'
  import { escapeTarget, isTyping, keyAction, seekStep, usesArrows, type KeyAction } from './keys'
  import { goBack, goForward, onSideButton } from './library/side-buttons'
  import { drawerFocus, focusColumnQueue } from './layout/queue-focus'
  import { IdleTimer, mayHide, pageKeeps } from './layout/idle'
  import { miniMenuItems, miniPick } from './layout/mini-menu'
  import { layout } from './stores/layout.svelte'
  import { menu } from './stores/menu.svelte'
  import { notice } from './stores/notice.svelte'
  import { loveId, loveNotice } from './queue/bar'
  import {
    setupMediaSession,
    showInMediaSession,
    showPositionInMediaSession,
    showSeekInMediaSession,
    showStateInMediaSession
  } from './stores/media-session'
  import { playStateOf } from './stores/play-state'
  import { nowOf, SongNotices } from './stores/song-notice'
  import { itemsVersion, navTabs } from './plugins'
  import { library } from './stores/library.svelte'
  import { lyrics } from './stores/lyrics.svelte'
  import { player, setShuffle, shuffleMode } from './stores/player.svelte'
  import { plays } from './stores/plays.svelte'
  import { queues } from './stores/queues.svelte'
  import { queue } from './stores/queue.svelte'
  import { output } from './stores/output.svelte'
  import { settings, settingsState } from './stores/settings.svelte'
  import { sound, stepVolume, toggleMute } from './stores/sound.svelte'
  import { sleep } from './stores/sleep.svelte'
  import { theme } from './stores/theme.svelte'
  import { barColors } from './visualizer/colors'
  import { setLook } from './visualizer/loop'

  // each cover has a palette per theme; the light one has a darker accent
  const palettes = $derived(queues.art?.palette ?? defaultPalettes)
  const palette = $derived(palettes[theme.light ? 'light' : 'dark'])

  $effect(() => engine.setVolume(heard({ volume: settings.volume, muted: sound.muted })))
  $effect(() => output.use(settings.outputDevice))

  // Shuffle or repeat changes the song that follows, which loads ahead.
  $effect(() => {
    void player.shuffle
    void player.shuffleBy
    void player.repeat
    untrack(() => queue.planNext())
  })
  $effect(() => {
    if (shuffleMode() === 'songs') untrack(() => sleep.shuffleStarted())
  })

  // a new loudness setting is heard on the song playing, not only the next
  $effect(() => {
    void settings.loudness
    untrack(() => queue.regain())
  })

  // The visualizer loop runs outside Svelte; it only hears about slow changes.
  $effect(() =>
    setLook({
      style: settings.visualizer,
      colors: barColors(palettes, theme.light),
      playing: player.playing
    })
  )

  // New data in a plugin, or one turned on or off: songs that are gone leave
  // the queue, a song that waited for its plugin loads, a live item whose
  // plugin went off gives the player back to the queue, and pages that are
  // gone close. A $derived, so a read that changes without changing the
  // version (the scan status, every 100 ms in a scan) doesn't run them.
  const version = $derived(itemsVersion())
  $effect(() => {
    void version
    untrack(() => {
      queues.refresh()
      library.pagesChanged()
    })
  })

  // The library's tabs follow the plugins that are on: one turned off takes
  // its tabs, pages and history steps with it. .pre, so the library is drawn
  // with them from the start.
  $effect.pre(() => {
    const tabs = navTabs()
    untrack(() => library.setTabs(tabs))
  })

  // Counts a play once enough of the song was heard (ticket 085). From what
  // the player shows, not the audio element, so any way a song starts counts.
  $effect(() => {
    const at = [queues.item, player.pos, player.duration, queues.songPlaying] as const
    untrack(() => plays.hear(...at))
  })

  // A song starts: its words are read (ticket 120). Only the key counts, so
  // a library refresh doesn't read them again; a station has none. Its info
  // is followed too, for a song asked before its names were known (121).
  $effect(() => {
    const key = queues.item
    void queues.info
    untrack(() =>
      lyrics.follow(key, () => {
        const i = queues.info
        return (
          i && {
            artist: i.mediaArtist ?? i.subtitle ?? '',
            title: i.title,
            album: i.group ?? '',
            duration: i.length ?? 0
          }
        )
      })
    )
  })

  // The library scan slows down while a song plays, so the audio gets the disk first.
  $effect(() => window.playbackApi.playing(player.playing))

  setupMediaSession()
  $effect(() =>
    showInMediaSession(queues.media, queues.art, settings.noCover, theme.light ? 'light' : 'dark')
  )
  $effect(() => showSeekInMediaSession(queues.active))
  $effect(() => showStateInMediaSession())
  $effect(() => showPositionInMediaSession(player.pos, player.duration))

  // A notification when the song changes (ticket 126); main drops it while
  // the window is in front.
  const songNotices = new SongNotices(
    (n) => window.notifyApi.song(n),
    () => settings.songNotices,
    { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t as number) }
  )
  $effect(() => songNotices.see(nowOf(queues)))

  // The tray menu shows what plays and has Play, Next and Previous (ticket 088).
  $effect(() => window.playbackApi.state(playStateOf(queues, shuffleMode(), sleep.shown)))
  $effect(() =>
    window.playbackApi.onControl((c) => {
      // the sleep timer's submenu (ticket 111) and Shuffle's (ticket 125)
      if (typeof c === 'object') return 'sleep' in c ? pickSleep(c.sleep) : pickShuffle(c.shuffle)
      // the menu can be a step behind the page
      if (queues.nothing) return
      if (c === 'toggle') queues.togglePlay()
      else if (c === 'next') void queues.next()
      else if (c === 'previous') void queues.prev()
    })
  )

  function pickSleep(p: unknown): void {
    if (p === null) sleep.cancel()
    else if (
      isSleepPick(p) &&
      sleepPicksFor({ live: queues.active === 'live', shuffle: shuffleMode() }).includes(p)
    )
      sleep.pick(p)
  }

  function pickShuffle(m: unknown): void {
    if (isShuffleMode(m)) setShuffle(m)
  }

  // S and Shift+S: the bar may be out of view, so a notice says what is on
  function shuffleKey(pick: boolean): void {
    if (pick) setShuffle(player.shuffleBy === 'songs' ? 'albums' : 'songs')
    else player.shuffle = !player.shuffle
    notice.show(shuffleNotice(shuffleMode()))
  }

  // Mini (ticket 110): a double click on the bar asks main to maximize, which
  // goes back to the big layout; a right click opens its menu.
  $effect(() =>
    window.win.onWantsBig(() => {
      if (layout.bar) layout.toBig()
    })
  )
  $effect(() =>
    window.win.onContextMenu(() => {
      if (layout.bar) void miniMenu()
    })
  )
  // Its controls show while the pointer is on the bar, and go at once when
  // it leaves: a wait there read as lag.
  $effect(() => window.win.onPointerIn((on) => (layout.barHot = on)))

  // Focus fades its tabs, controls and title bar while nobody uses it
  // (ticket 113). Any move, key or touch brings them back.
  let idle = $state(false)
  // what the pointer is on; left the window: null
  let pointerAt: Element | null = null
  let lastXY = ''
  const idleTimer = new IdleTimer(
    (h) => (idle = h),
    () =>
      pageKeeps({
        pointerAt,
        focused: document.activeElement,
        windowFocused: document.hasFocus(),
        dialogOpen: !!document.querySelector('dialog[open]')
      })
  )
  $effect(() =>
    idleTimer.allow(
      mayHide({
        on: layout.idleHides,
        playing: player.playing,
        open:
          !!menu.open ||
          layout.settingsOpen ||
          layout.showQueue ||
          (layout.queueMode === 'tab' && layout.tabSel !== 0)
      })
    )
  )
  $effect(() => () => idleTimer.stop())

  function pointerMoved(e: PointerEvent): void {
    pointerAt = e.target instanceof Element ? e.target : null
    // Chromium sends a move when the page shifts under a still pointer
    const xy = `${e.screenX},${e.screenY}`
    if (xy === lastXY) return
    lastXY = xy
    idleTimer.poke()
  }

  // A tap's click lands where the controls are by the time it comes, so the
  // tap that brings them back must not also press one.
  let swallowTap = false

  function pointerDown(e: PointerEvent): void {
    pointerAt = e.target instanceof Element ? e.target : null
    swallowTap = idleTimer.hidden && e.pointerType !== 'mouse'
    idleTimer.poke()
  }

  // Enter on a button clicks with no pointer
  function keyed(): void {
    swallowTap = false
    idleTimer.poke()
  }

  function clicked(e: MouseEvent): void {
    if (!swallowTap) return
    swallowTap = false
    e.preventDefault()
    e.stopPropagation()
  }

  // Also when the controls come back under a still pointer: no move then
  function pointerOver(e: PointerEvent): void {
    pointerAt = e.target instanceof Element ? e.target : null
  }

  function pointerOut(e: PointerEvent): void {
    if (e.relatedTarget) return
    pointerAt = null
    idleTimer.retry()
  }

  // On Linux one right click comes both from main and as the page's own
  // event, and a second menu would close the first.
  let miniMenuOpen = false

  async function miniMenu(): Promise<void> {
    if (miniMenuOpen) return
    miniMenuOpen = true
    const song = {
      buttons: queues.bar.buttons,
      sleep: sleep.set,
      live: queues.active === 'live',
      shuffle: shuffleMode(),
      order: queues.bar.order && !queues.nothing
    }
    const id = await window.win
      .popupMenu(miniMenuItems(settings.template, settings.miniOnTop, song))
      .finally(() => (miniMenuOpen = false))
    const pick = miniPick(id)
    if (!pick) return
    if (pick === 'pin') settings.miniOnTop = !settings.miniOnTop
    else if (typeof pick === 'object' && 'act' in pick) {
      // the heart as the L key, with its notice, as the bar may not show it
      if (pick.act === loveId) love()
      else queues.act(pick.act)
    } else if (typeof pick === 'object' && 'sleep' in pick) pickSleep(pick.sleep)
    else if (typeof pick === 'object' && 'shuffle' in pick) setShuffle(pick.shuffle)
    else if (pick === 'settings') layout.openSettings()
    else if (pick === 'minimize') window.win.minimize()
    else if (pick === 'quit') window.win.quit()
    else layout.chooseTemplate(pick.layout)
  }

  // The page gets the right click itself on a button, on Linux, and maybe on macOS.
  function oncontextmenu(e: MouseEvent): void {
    if (!layout.bar) return
    e.preventDefault()
    void miniMenu()
  }

  // Every change goes to main, which saves it and applies the window size and
  // theme. Settings that failed to load are applied but not saved.
  $effect(() => {
    const s = $state.snapshot(settings)
    window.settingsApi.save(s, settingsState.canSave)
  })

  // The keys, decided in keys.ts (list in docs/design.md). A key a list, the
  // seek bar or the search box already used arrives with defaultPrevented.
  function onkeydown(e: KeyboardEvent): void {
    if (e.defaultPrevented) return
    const t = e.target as HTMLElement
    const act = keyAction(e, { typing: isTyping(t), arrows: usesArrows(t), menuOpen: !!menu.open })
    if (act === 'none') return
    // Space never presses a focused button, with or without a modifier
    e.preventDefault()
    run(act)
  }

  function run(act: KeyAction): void {
    if (act === 'toggle') queues.togglePlay()
    else if (act === 'seekBack' || act === 'seekForward')
      queues.seek(seekStep(player.pos, player.duration, act === 'seekBack' ? -1 : 1))
    else if (act === 'volumeUp' || act === 'volumeDown') stepVolume(act === 'volumeDown' ? -1 : 1)
    else if (act === 'mute') toggleMute()
    else if (act === 'previous') void queues.prev()
    else if (act === 'next') void queues.next()
    else if (act === 'back') goBack()
    else if (act === 'forward') goForward()
    else if (act === 'search') focusSearch()
    else if (act === 'settings') layout.toggleSettings()
    else if (act === 'keys') toggleKeys()
    else if (act === 'escape') escape()
    else if (act === 'visualizer') layout.pressVisualizer()
    else if (act === 'queue') layout.toggleQueue()
    else if (act === 'love') love()
    else if (act === 'info') showSongInfo()
    else if (act === 'shuffle' || act === 'shuffleBy') shuffleKey(act === 'shuffleBy')
    else if (act === 'studio' || act === 'classic' || act === 'focus' || act === 'mini')
      layout.chooseTemplate(act)
  }

  // the bar may be out of view (Focus, a small window), so it says what it did
  function love(): void {
    const on = queues.toggleLove()
    if (on !== undefined) notice.show(loveNotice(on, queues.title))
  }

  // the song row with focus, else the song playing; not in Mini, which has no room
  function showSongInfo(): void {
    if (layout.bar) return
    const key = songKeyOf(document.activeElement) ?? queues.item
    if (key) songInfo.open(key)
  }

  function escape(): void {
    const drawer = layout.queueMode === 'drawer' && layout.showQueue
    const to = escapeTarget({ menu: !!menu.open, settings: layout.settingsOpen, drawer })
    if (to === 'menu') menu.close()
    else if (to === 'settings') layout.closeSettings()
    else if (to === 'drawer') layout.showQueue = false
  }

  // ? opens Settings on the key list, and closes it from there
  function toggleKeys(): void {
    if (layout.settingsAt === keysSection) layout.closeSettings()
    else layout.openSettings(keysSection)
  }

  // A drawer that turns back into a Column hands its focus on to the Column.
  function resized(): void {
    const at = layout.queueMode === 'drawer' ? drawerFocus() : null
    layout.resized(window.innerWidth, window.innerHeight)
    if (at !== null && layout.queueMode === 'col') focusColumnQueue(at)
  }

  // Focus has no search box; there the key does nothing.
  function focusSearch(): void {
    const box = document.querySelector<HTMLInputElement>('input[data-search]')
    if (!box) return
    layout.closeSettings()
    box.focus()
    box.select()
  }
</script>

<!-- the last position (and a long song's place) goes to main before the window closes; the size picks
     how a queue Column is drawn (layout/narrow.ts) and the wide layout (layout/wide.ts) -->
<svelte:window
  {onkeydown}
  onkeydowncapture={keyed}
  onpointermovecapture={pointerMoved}
  onpointerdowncapture={pointerDown}
  onclickcapture={clicked}
  onwheelcapture={() => idleTimer.poke()}
  onpointerovercapture={pointerOver}
  onpointerout={pointerOut}
  onblur={() => idleTimer.retry()}
  onmouseup={onSideButton}
  onpagehide={() => {
    queue.savePos()
    queue.keepPlace()
  }}
  onresize={resized}
/>

<div
  class="app vz-{settings.visualizer}"
  class:playing={player.playing}
  class:song-playing={queues.songPlaying}
  class:idle
  style:--c1={palette[0]}
  style:--c2={palette[1]}
  style:--c3={palette[2]}
>
  {#if !layout.bar}
    <TitleBar
      title="Spindle · {layout.template.name}"
      settingsOpen={layout.settingsOpen}
      onSettings={() => layout.toggleSettings()}
    />
  {/if}
  <!-- inert under the Settings page, so Tab and clicks stay on the page.
       Mini has no title bar: all of it drags the window but its buttons. -->
  <main
    class="winbody"
    class:bar={layout.bar}
    class:hot={layout.bar && layout.barHot}
    inert={layout.settingsOpen}
    {oncontextmenu}
  >
    <Node node={layout.built.root} />
    {#if layout.bar}<MiniButtons />{/if}
  </main>
  {#if layout.settingsOpen}<Settings />{/if}
  <Notice />
  <Menu />
  <CloseAsk />
  <SongInfo />
  <DragGhost />
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    background: var(--bg);
  }
  /* Focus while nobody uses it: fades out, and comes back at once */
  .app.idle :global([data-fades]) {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.6s;
  }
  /* the album's colors go on under the faded title bar, not a flat band */
  .app.idle :global(.winbody > .look-ambient) {
    overflow: visible;
    clip-path: inset(-34px 0 0);
  }
  .app.idle :global(.winbody > .look-ambient > .amb-shade) {
    top: -34px;
  }
  .app.idle,
  .app.idle :global(*) {
    cursor: none !important;
  }
  .winbody {
    flex: 1;
    display: flex;
    min-height: 0;
    position: relative;
  }
  .winbody.bar {
    -webkit-app-region: drag;
    user-select: none;
  }
  .winbody.bar :global(button) {
    -webkit-app-region: no-drag;
  }
  /* Mini: the song's text at rest, its controls while the pointer is on it
     or a key moved the focus into them (Controls.svelte, MiniButtons.svelte) */
  .winbody.bar :global(.mini-rest),
  .winbody.bar :global(.mini-hot) {
    transition: opacity 0.15s;
  }
  /* the controls lie over the whole bar, not their own empty wrapper */
  .winbody.bar :global(.part:has(> .compact)) {
    position: static;
  }
  .winbody.bar :global(.mini-hot) {
    opacity: 0;
    pointer-events: none;
  }
  .winbody.bar.hot :global(.mini-hot),
  .winbody.bar:has(:global(:focus-visible)) :global(.mini-hot) {
    opacity: 1;
    pointer-events: auto;
  }
  .winbody.bar.hot :global(.mini-rest),
  .winbody.bar:has(:global(:focus-visible)) :global(.mini-rest) {
    opacity: 0;
  }
</style>
