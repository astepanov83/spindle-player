<!-- The bitrate picker: the station's streams, highest first. The pick is kept per station. -->
<script lang="ts">
  import { streamChoices } from '../plugins/radio/logic'
  import { menu } from '../stores/menu.svelte'
  import { radio } from '../plugins/radio/store.svelte'

  // short: "320" for the bar, else "320 kbps mp3"
  let { short = false }: { short?: boolean } = $props()

  const choices = $derived(streamChoices(radio.station?.streams ?? []))
  const current = $derived(choices.find((c) => c.index === radio.stream))
  const text = $derived(current && (short ? current.short : current.label))

  function open(e: MouseEvent): void {
    menu.showFor(e, [
      { heading: 'Stream' },
      ...choices.map((c) => ({
        label: c.label,
        checked: c.index === radio.stream,
        run: () => radio.choose(c.index)
      }))
    ])
  }
</script>

{#if choices.length > 1}
  <button
    class="picker chip"
    aria-haspopup="menu"
    aria-label="Stream: {current?.label ?? 'none'}"
    title={current?.label}
    onclick={open}>{text ?? 'Stream'}<span class="arrow">▾</span></button
  >
{:else if current}
  <!-- one stream: nothing to pick, so there is room to say what it is -->
  <span class="picker one">{current.label}</span>
{/if}

<style>
  .picker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex: none;
  }
  .one {
    background: none;
    padding: 4px 0;
  }
  .arrow {
    font-size: 10px;
  }
</style>
