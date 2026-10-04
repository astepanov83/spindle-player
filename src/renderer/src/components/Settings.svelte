<!-- The settings sheet under the gear. Main saves every choice (see App.svelte). -->
<script lang="ts">
  import CoverFetch from './CoverFetch.svelte'
  import SettingBlocks from './SettingBlocks.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Seg from '../ui/Seg.svelte'
  import type { QueueMode, TemplateId } from '../../../shared/layout'
  import {
    closeActions,
    themeChoices,
    visualizerStyles,
    type CloseAction,
    type ThemeChoice,
    type VisualizerStyle
  } from '../../../shared/settings'
  import { plugins } from '../../../shared/plugins'
  import { templateIds, templates } from '../../../shared/templates'
  import { settingBlocks } from '../plugins'
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
      value={layout.queueSetting}
      onchange={(q: QueueMode) => layout.chooseQueueMode(q)}
    />
    <p class="hint">
      {layout.queueMode === layout.queueSetting ? queueHints[layout.queueSetting] : narrowHint}
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
  <div class="set">
    <span class="section-label">Theme</span>
    <Seg
      label="Theme"
      options={themeChoices.map((t) => ({ value: t, label: themeNames[t] }))}
      value={settings.theme}
      onchange={(t: ThemeChoice) => (settings.theme = t)}
    />
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
  <div class="set">
    <span class="section-label">Plugins</span>
    {#each plugins as p (p.id)}
      <label class="check">
        <input type="checkbox" bind:checked={settings.plugins[p.id]} />
        {p.name}
      </label>
      {#if settings.plugins[p.id]}
        <p class="hint">{p.about}</p>
        <SettingBlocks plugin={p.id} blocks={settingBlocks(p.id)} />
      {/if}
    {/each}
  </div>
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
  /* a fade, not a movement */
  @media (prefers-reduced-motion: reduce) {
    .settings {
      animation-name: fadein;
    }
  }
  @keyframes fadein {
    from {
      opacity: 0;
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
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: var(--text-s);
    cursor: pointer;
  }
  .check input {
    margin: 0;
    accent-color: var(--c2);
  }
</style>
