<!-- The settings sheet under the gear. Main saves every choice (see App.svelte). -->
<script lang="ts">
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
</script>

<div class="settings" role="dialog" aria-label="Settings">
  <h3>Settings</h3>
  <div class="set">
    <span class="label">Layout</span>
    <Seg
      options={templateIds.map((id) => ({ value: id, label: templates[id].name }))}
      value={settings.template}
      onchange={(id: TemplateId) => layout.chooseTemplate(id)}
    />
  </div>
  <div class="set">
    <span class="label">Queue</span>
    <Seg
      options={layout.template.queueOptions.map((q) => ({ value: q, label: queueNames[q] }))}
      value={layout.queueMode}
      onchange={(q: QueueMode) => layout.chooseQueueMode(q)}
    />
    <p class="hint">{queueHints[layout.queueMode]}</p>
  </div>
  <div class="set">
    <span class="label">Visualizer</span>
    <Seg
      options={visualizerStyles.map((v) => ({ value: v, label: vzNames[v] }))}
      value={settings.visualizer}
      onchange={(v: VisualizerStyle) => layout.chooseVisualizer(v)}
    />
  </div>
  <div class="set">
    <span class="label">Theme</span>
    <Seg
      options={themeChoices.map((t) => ({ value: t, label: themeNames[t] }))}
      value={settings.theme}
      onchange={(t: ThemeChoice) => (settings.theme = t)}
    />
  </div>
</div>

<style>
  .settings {
    position: absolute;
    top: 40px;
    right: 12px;
    z-index: 20;
    width: min(340px, calc(100% - 24px));
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
  h3 {
    margin: 0;
    font: 600 15px var(--ui);
  }
  .set {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .label {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
  }
  .hint {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--ink-2);
  }
</style>
