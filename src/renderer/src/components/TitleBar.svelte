<script lang="ts">
  import type { TemplateId } from '../../../shared/layout'
  import { templateIds, templates } from '../../../shared/templates'
  import { settings } from '../stores/settings.svelte'
  import { layout } from '../stores/layout.svelte'
  import { layoutChord } from '../keys'
  import Icon from '../ui/Icon.svelte'
  import type { IconName } from '../ui/icons'

  let {
    title,
    settingsOpen = false,
    onSettings
  }: { title: string; settingsOpen?: boolean; onSettings: () => void } = $props()

  let maximized = $state(false)

  const layoutIcons: Record<TemplateId, IconName> = {
    studio: 'layoutStudio',
    classic: 'layoutClassic',
    focus: 'layoutFocus'
  }

  $effect(() => {
    window.win.isMaximized().then((m) => (maximized = m))
    return window.win.onMaximized((m) => (maximized = m))
  })
</script>

<!-- Double-click to maximize comes from the drag area itself, no handler needed. -->
<!-- The window buttons are left out of Tab order: the window manager has keys for them. -->
<header class="titlebar">
  <span class="title">{title}</span>
  <div class="right">
    <div class="layouts" role="group" aria-label="Layout">
      {#each templateIds as id (id)}
        <button
          class="tbbtn"
          class:on={settings.template === id}
          aria-pressed={settings.template === id}
          aria-label="{templates[id].name} layout"
          aria-keyshortcuts={layoutChord(id).replace('Ctrl', 'Control')}
          title="{templates[id].name} ({layoutChord(id)})"
          onclick={() => layout.chooseTemplate(id)}
        >
          <Icon name={layoutIcons[id]} size={16} />
        </button>
      {/each}
    </div>
    <button
      class="tbbtn"
      class:on={settingsOpen}
      aria-label="Settings"
      title="Settings"
      data-settings-toggle
      onclick={onSettings}
    >
      <Icon name="gear" size={16} />
    </button>
    <div class="winbtns">
      <button
        tabindex="-1"
        aria-label="Minimize"
        title="Minimize"
        onclick={() => window.win.minimize()}
      >
        <Icon name="minimize" size={12} />
      </button>
      <button
        tabindex="-1"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? 'Restore' : 'Maximize'}
        onclick={() => window.win.toggleMaximize()}
      >
        <Icon name={maximized ? 'restore' : 'maximize'} size={12} />
      </button>
      <button
        tabindex="-1"
        class="close"
        aria-label="Close"
        title="Close"
        onclick={() => window.win.close()}
      >
        <Icon name="winClose" size={12} />
      </button>
    </div>
  </div>
</header>

<style>
  .titlebar {
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px 0 14px;
    font-size: var(--text-xs);
    font-weight: 500;
    position: relative;
    z-index: 8;
    color: var(--ink-2);
    background: var(--bg-title);
    border-bottom: 1px solid var(--edge);
    -webkit-app-region: drag;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  button {
    -webkit-app-region: no-drag;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--ink-2);
  }
  button:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .tbbtn.on {
    background: var(--active);
    color: var(--ink);
  }
  .tbbtn {
    width: 30px;
  }
  /* the chosen layout also gets a bar in the album's color, so a hovered
     one never looks chosen too */
  .layouts .tbbtn {
    position: relative;
  }
  .layouts .tbbtn.on::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 2px;
    width: 14px;
    height: 2px;
    margin-left: -7px;
    border-radius: 1px;
    background: var(--c2);
  }
  .layouts {
    display: flex;
    gap: 2px;
    margin-right: 8px;
  }
  .winbtns {
    display: flex;
  }
  .winbtns button {
    width: 34px;
  }
  .winbtns button.close:hover {
    background: var(--close-hover);
    color: var(--on-danger);
  }
</style>
