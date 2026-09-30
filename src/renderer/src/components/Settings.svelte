<!-- The settings sheet under the gear. Main saves every choice (see App.svelte). -->
<script lang="ts">
  import CoverFetch from './CoverFetch.svelte'
  import MusicFolders from './MusicFolders.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Seg from '../ui/Seg.svelte'
  import type { QueueMode, TemplateId } from '../../../shared/layout'
  import {
    themeChoices,
    visualizerStyles,
    type ThemeChoice,
    type VisualizerStyle
  } from '../../../shared/settings'
  import { templateIds, templates } from '../../../shared/templates'
  import { layout } from '../stores/layout.svelte'
  import { settings } from '../stores/settings.svelte'

  const queueNames: Record<QueueMode, string> = { tab: 'Tab', drawer: 'Drawer', col: 'Column' }
  const queueHints: Record<QueueMode, string> = {
    tab: 'The queue shares a spot with Now playing. Switch with the tabs.',
    drawer:
      'The queue slides in from the right. Open it with the queue button next to the visualizer button.',
    col: 'The queue is always visible in its own column.'
  }
  const vzNames: Record<VisualizerStyle, string> = {
    ring: 'Ring',
    spectrum: 'Spectrum',
    wave: 'Wave',
    off: 'Off'
  }
  const themeNames: Record<ThemeChoice, string> = { dark: 'Dark', light: 'Light', system: 'System' }

  let el: HTMLDivElement | undefined = $state()

  // A click outside closes the sheet. The gear is skipped, since its own click toggles it.
  function onpointerdown(e: PointerEvent): void {
    const t = e.target as Element
    if (el?.contains(t) || t.closest('[data-settings-toggle]')) return
    layout.settingsOpen = false
  }

  // Focus goes into the sheet on open, and back to the gear on close unless
  // a click outside put it somewhere else.
  $effect(() => {
    el?.querySelector<HTMLElement>('.close button')?.focus()
    return () => {
      const at = document.activeElement
      if (!at || at === document.body || el?.contains(at))
        document.querySelector<HTMLElement>('[data-settings-toggle]')?.focus()
    }
  })
</script>

<svelte:window onpointerdowncapture={onpointerdown} />

<div class="settings" role="dialog" aria-label="Settings" bind:this={el}>
  <div class="top">
    <h3>Settings</h3>
    <span class="close">
      <IconButton
        icon="close"
        label="Close settings"
        onclick={() => (layout.settingsOpen = false)}
      />
    </span>
  </div>
  <div class="set">
    <span class="section-label">Layout</span>
    <Seg
      label="Layout"
      options={templateIds.map((id) => ({ value: id, label: templates[id].name }))}
      value={settings.template}
      onchange={(id: TemplateId) => layout.chooseTemplate(id)}
    />
  </div>
  <div class="set">
    <span class="section-label">Queue</span>
    <Seg
      label="Queue"
      options={layout.template.queueOptions.map((q) => ({ value: q, label: queueNames[q] }))}
      value={layout.queueMode}
      onchange={(q: QueueMode) => layout.chooseQueueMode(q)}
    />
    <p class="hint">{queueHints[layout.queueMode]}</p>
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
  <div class="set">
    <span class="section-label">Theme</span>
    <Seg
      label="Theme"
      options={themeChoices.map((t) => ({ value: t, label: themeNames[t] }))}
      value={settings.theme}
      onchange={(t: ThemeChoice) => (settings.theme = t)}
    />
  </div>
  <CoverFetch />
  <MusicFolders />
</div>

<style>
  .settings {
    position: absolute;
    top: 40px;
    right: 12px;
    z-index: 20;
    width: min(340px, calc(100% - 24px));
    max-height: calc(100% - 52px);
    overflow: auto;
    padding: 16px 18px 18px;
    border-radius: 14px;
    background: var(--panel);
    backdrop-filter: blur(20px);
    box-shadow:
      0 20px 50px var(--shadow),
      0 0 0 1px var(--edge);
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: fadeup 0.2s;
  }
  @keyframes fadeup {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: -6px -8px -6px 0;
  }
  .close {
    --icobtn: 32px;
  }
  h3 {
    margin: 0;
    font: 600 var(--text-l) var(--ui);
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
</style>
