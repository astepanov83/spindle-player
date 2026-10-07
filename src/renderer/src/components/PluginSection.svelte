<!-- A plugin's section of the Settings page: its name, its about line and its
     switch, and while it is on, its blocks. Off, only the header shows. -->
<script lang="ts">
  import SettingBlocks from './SettingBlocks.svelte'
  import Switch from '../ui/Switch.svelte'
  import type { PluginInfo } from '../../../shared/plugins'
  import { settingBlocks } from '../plugins'
  import { settings } from '../stores/settings.svelte'

  let { plugin }: { plugin: PluginInfo } = $props()

  const uid = $props.id()
  const on = $derived(settings.plugins[plugin.id])
</script>

<header class="head">
  <div class="name">
    <h2 id="{uid}-name">{plugin.name}</h2>
    <Switch
      {on}
      labelledby="{uid}-name"
      describedby="{uid}-about"
      onchange={(v) => (settings.plugins[plugin.id] = v)}
    />
  </div>
  <p class="about" id="{uid}-about">{plugin.about}</p>
</header>
{#if on}
  <div class="blocks">
    <SettingBlocks plugin={plugin.id} blocks={settingBlocks(plugin.id)} />
  </div>
{/if}

<style>
  .head {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .name {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  h2 {
    margin: 0;
    font: 700 var(--title-m) var(--display);
    letter-spacing: -0.01em;
  }
  .about {
    margin: 0;
    font-size: var(--text-s);
    line-height: 1.45;
    color: var(--ink-2);
  }
  .blocks {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  @media (max-width: 639px) {
    h2 {
      font-size: var(--title-s);
    }
  }
</style>
