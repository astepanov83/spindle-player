<!-- The Settings page: over everything under the title bar, a list of
     sections on the left and the chosen one on the right (a row of chips on
     top in a narrow window). Main saves every choice (see App.svelte). -->
<script lang="ts">
  import CoverFetch from './CoverFetch.svelte'
  import KeyList from './KeyList.svelte'
  import NoCoverPick from './NoCoverPick.svelte'
  import PluginSection from './PluginSection.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Seg from '../ui/Seg.svelte'
  import type { QueueMode, TemplateId } from '../../../shared/layout'
  import {
    closeActions,
    loudnessChoices,
    themeChoices,
    visualizerStyles,
    type CloseAction,
    type Loudness,
    type ThemeChoice,
    type VisualizerStyle
  } from '../../../shared/settings'
  import { plugins } from '../../../shared/plugins'
  import { templateIds, templates } from '../../../shared/templates'
  import { keysSection, layoutSection, sectionOf, settingsSections } from './settings-sections'
  import { layout } from '../stores/layout.svelte'
  import { settings } from '../stores/settings.svelte'
  import { vzNames } from '../visualizer/names'

  const queueNames: Record<QueueMode, string> = { tab: 'Tab', drawer: 'Drawer', col: 'Column' }
  const queueHints: Record<QueueMode, string> = {
    tab: 'The queue shares a spot with Now playing. Switch with the tabs.',
    drawer:
      'The queue slides in from the right. Open it with the queue button next to the visualizer button.',
    col: 'The queue is always visible in its own column.'
  }
  // a Column drawn as a Drawer in a narrow window (layout/narrow.ts)
  const narrowHint =
    'The queue gets its own column when the window is wider. Until then it slides in from the right, from the queue button.'
  const themeNames: Record<ThemeChoice, string> = { dark: 'Dark', light: 'Light', system: 'System' }
  const closeNames: Record<CloseAction, string> = { ask: 'Ask', minimize: 'Minimize', quit: 'Quit' }
  const closeHints: Record<CloseAction, string> = {
    ask: 'Closing the window asks whether to minimize or quit.',
    minimize: 'Closing the window minimizes it, and the music keeps playing.',
    quit: 'Closing the window quits Spindle.'
  }

  const loudnessNames: Record<Loudness, string> = {
    off: 'Off',
    song: 'By song',
    album: 'By album'
  }
  const loudnessHints: Record<Loudness, string> = {
    off: 'Songs play as loud as their files are.',
    song: 'Each song plays as loud as the others, by the ReplayGain tags in its file. Songs without them play as they are.',
    album:
      'An album played in order plays as loud as other albums and keeps its quiet songs quiet. With shuffle, or songs from different albums, each song is evened out on its own. Songs without ReplayGain tags play as they are.'
  }

  const sections = settingsSections(plugins)
  const cur = $derived(sectionOf(sections, layout.settingsAt))

  let el: HTMLDivElement | undefined = $state()
  let body: HTMLDivElement | undefined = $state()

  // a new section starts at its top
  $effect(() => {
    void cur
    body?.scrollTo(0, 0)
  })

  // Focus goes to the open section in the list, and back to what opened the
  // page on close (else the gear), unless a click put it somewhere else.
  // Back after a frame: the page under it is inert until this one is gone.
  $effect(() => {
    el?.querySelector<HTMLElement>('[aria-current="page"]')?.focus()
    return () => {
      const at = document.activeElement
      if (at && at !== document.body && !el?.contains(at)) return
      const to = layout.settingsOpener
      requestAnimationFrame(() => {
        const back = to?.isConnected ? to : null
        ;(back ?? document.querySelector<HTMLElement>('[data-settings-toggle]'))?.focus()
      })
    }
  })
</script>

<div class="settings" role="dialog" aria-modal="true" aria-label="Settings" bind:this={el}>
  <nav class="side" aria-label="Settings sections">
    <h2 class="title">Settings</h2>
    <ul>
      {#each sections as s (s.id)}
        <li>
          <button
            class="item"
            aria-current={s.id === cur.id ? 'page' : undefined}
            onclick={() => (layout.settingsAt = s.id)}
          >
            <span class="label">{s.label}</span>
            {#if s.plugin && !settings.plugins[s.plugin.id]}<span class="off">Off</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  </nav>
  <span class="close">
    <IconButton icon="close" label="Close settings" onclick={() => layout.closeSettings()} />
  </span>
  <div class="body" bind:this={body}>
    <section class="page" aria-label={cur.label}>
      {#if cur.plugin}
        <PluginSection plugin={cur.plugin} />
      {:else}
        <h2 class="head">{cur.label}</h2>
        {#if cur.id === layoutSection}
          <div class="set">
            <span class="section-label">Layout</span>
            <Seg
              label="Layout"
              options={templateIds.map((id) => ({ value: id, label: templates[id].name }))}
              value={settings.template}
              onchange={(id: TemplateId) => layout.chooseTemplate(id)}
            />
            <p class="hint">
              The buttons left of the gear in the title bar switch it too, and so do Ctrl+1, Ctrl+2
              and Ctrl+3.
            </p>
          </div>
          <div class="set">
            <span class="section-label">Queue</span>
            <Seg
              label="Queue"
              options={layout.template.queueOptions.map((q) => ({
                value: q,
                label: queueNames[q]
              }))}
              value={layout.queueSetting}
              onchange={(q: QueueMode) => layout.chooseQueueMode(q)}
            />
            <p class="hint">
              {layout.queueMode === layout.queueSetting
                ? queueHints[layout.queueSetting]
                : narrowHint}
            </p>
          </div>
          <div class="set">
            <span class="section-label">Visualizer</span>
            <Seg
              label="Visualizer"
              options={visualizerStyles.map((v) => ({ value: v, label: vzNames[v] }))}
              value={settings.visualizer}
              onchange={(v: VisualizerStyle) => layout.chooseVisualizer(v)}
            />
          </div>
        {:else if cur.id === keysSection}
          <KeyList />
        {:else}
          <div class="set">
            <span class="section-label">Theme</span>
            <Seg
              label="Theme"
              options={themeChoices.map((t) => ({ value: t, label: themeNames[t] }))}
              value={settings.theme}
              onchange={(t: ThemeChoice) => (settings.theme = t)}
            />
          </div>
          <NoCoverPick />
          <div class="set">
            <span class="section-label">Even out loudness</span>
            <Seg
              label="Even out loudness"
              options={loudnessChoices.map((l) => ({ value: l, label: loudnessNames[l] }))}
              value={settings.loudness}
              onchange={(l: Loudness) => (settings.loudness = l)}
            />
            <p class="hint">{loudnessHints[settings.loudness]}</p>
          </div>
          <div class="set">
            <span class="section-label">Closing the window</span>
            <Seg
              label="Closing the window"
              options={closeActions.map((c) => ({ value: c, label: closeNames[c] }))}
              value={settings.closeAction}
              onchange={(c: CloseAction) => (settings.closeAction = c)}
            />
            <p class="hint">{closeHints[settings.closeAction]}</p>
          </div>
          <CoverFetch />
        {/if}
      {/if}
    </section>
  </div>
</div>

<style>
  /* over the window's body, under the title bar (34px) */
  .settings {
    position: absolute;
    inset: 34px 0 0;
    z-index: 20;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    background: var(--bg);
    animation: fadein 0.15s;
  }
  @keyframes fadein {
    from {
      opacity: 0;
    }
  }
  .side {
    padding: 22px 12px;
    background: var(--bg-side);
    border-right: 1px solid var(--edge);
    overflow: auto;
  }
  .title {
    margin: 0 12px 14px;
    font: 700 var(--title-s) var(--display);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .item {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    text-align: left;
    font-size: var(--text-m);
    color: var(--ink-2);
  }
  .item:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .item[aria-current='page'] {
    background: var(--active);
    color: var(--ink);
    font-weight: 600;
  }
  .label {
    flex: 1;
    min-width: 0;
    line-height: 1.3;
  }
  .off {
    flex: none;
    font-size: var(--text-xs);
    font-weight: 400;
    color: var(--ink-3);
  }
  .close {
    position: absolute;
    top: 12px;
    right: 14px;
    z-index: 1;
    --icobtn: 34px;
  }
  .body {
    overflow: auto;
    min-height: 0;
  }
  .page {
    max-width: 600px;
    padding: 22px 32px 40px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .head {
    margin: 0;
    font: 700 var(--title-m) var(--display);
    letter-spacing: -0.01em;
  }
  .set {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hint {
    margin: 0;
    font-size: var(--text-s);
    line-height: 1.45;
    color: var(--ink-2);
  }

  /* Focus and other narrow windows: the list becomes a row of chips on top */
  @media (max-width: 639px) {
    .settings {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    .side {
      padding: 14px 16px 12px;
      border-right: 0;
      border-bottom: 1px solid var(--edge);
      overflow: visible;
    }
    .title {
      margin: 4px 0 12px;
    }
    ul {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 6px;
    }
    .item {
      width: auto;
      padding: 6px 12px;
      border-radius: 99px;
      font-size: var(--text-s);
      background: var(--field);
    }
    .item:hover {
      background: color-mix(in srgb, var(--ink) 12%, var(--field));
    }
    .item[aria-current='page'] {
      background: var(--ink);
      color: var(--bg);
      font-weight: 500;
    }
    .item[aria-current='page'] .off {
      color: inherit;
      opacity: 0.7;
    }
    .close {
      top: 10px;
      right: 10px;
    }
    .page {
      padding: 18px 16px 32px;
    }
    .head {
      font-size: var(--title-s);
    }
  }
</style>
