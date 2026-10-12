<!-- "Sound output" in Settings, General (ticket 112): the device songs play
     on. A saved device that is unplugged stays picked and is used again
     when it is back. -->
<script lang="ts">
  import { outputChoices } from '../audio/output'
  import { output } from '../stores/output.svelte'
  import { settings } from '../stores/settings.svelte'

  const uid = $props.id()
  // plugged in or out while Settings is open
  $effect(() => output.watch())
  const choices = $derived(
    outputChoices(output.devices, settings.outputDevice, settings.outputDeviceName)
  )

  function pick(id: string): void {
    settings.outputDevice = id
    // its name, to show while it is not plugged in
    settings.outputDeviceName = id ? (output.devices?.find((d) => d.id === id)?.name ?? '') : ''
  }
</script>

<div class="set">
  <label class="section-label" for="{uid}-out">Sound output</label>
  <select
    id="{uid}-out"
    class="box"
    value={settings.outputDevice}
    onchange={(e) => pick(e.currentTarget.value)}
  >
    {#each choices as c (c.id)}
      <option value={c.id} selected={c.id === settings.outputDevice}>{c.name}</option>
    {/each}
  </select>
  {#if output.missing}
    <p class="hint warn">Not found. Songs play on the system default until it is back.</p>
  {/if}
</div>

<style>
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
  .warn {
    color: var(--warn);
  }
  .box {
    height: 34px;
    max-width: 100%;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: var(--field);
    color: var(--ink);
    font: var(--text-s) var(--ui);
    cursor: pointer;
  }
</style>
