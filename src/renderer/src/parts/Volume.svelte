<!-- The volume: the Mute button and the slider. With `pop`, a narrow player
     bar (the bar-end container in Controls) shows a button instead, which
     opens both above it. Up / Down and M work from anywhere either way, and
     the mouse wheel over any of it steps 5%. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import { silent, volumeIcon } from '../audio/volume'
  import { settings } from '../stores/settings.svelte'
  import { setVolume, sound, toggleMute, wheelVolume } from '../stores/sound.svelte'

  let { width = 90, pop = false }: { width?: number; pop?: boolean } = $props()

  let open = $state(false)
  let btn: HTMLButtonElement | undefined = $state()
  let slider: HTMLInputElement | undefined = $state()

  const now = $derived({ volume: settings.volume, muted: sound.muted })
  const icon = $derived(volumeIcon(now))
  const said = $derived(`${settings.volume}%${sound.muted ? ', muted' : ''}`)

  function toggle(): void {
    open = !open
    // the arrows work on the slider right away, from the mouse or the keyboard
    if (open) queueMicrotask(() => slider?.focus())
  }

  // Focus leaving closes it, so Tab walks on and a click elsewhere shuts it.
  function onfocusout(e: FocusEvent & { currentTarget: HTMLElement }): void {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) open = false
  }

  // Escape closes it before anything else (Settings, the drawer)
  function onkeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !open) return
    e.preventDefault()
    open = false
    btn?.focus()
  }

  // the value while dragging, then once more on release, which is kept for Mute at 0%
  const oninput = (e: Event & { currentTarget: HTMLInputElement }): void =>
    setVolume(e.currentTarget.valueAsNumber, false)
  const onchange = (e: Event & { currentTarget: HTMLInputElement }): void =>
    setVolume(e.currentTarget.valueAsNumber)
</script>

{#snippet mute()}
  <IconButton {icon} label="Mute" on={silent(now)} toggle onclick={toggleMute} />
{/snippet}

<div class="vol" class:can-pop={pop} onwheel={wheelVolume}>
  <span class="slide">
    {@render mute()}
    <input
      type="range"
      min="0"
      max="100"
      aria-label="Volume"
      aria-valuetext={said}
      class:muted={sound.muted}
      style:width="{width}px"
      value={settings.volume}
      {oninput}
      {onchange}
    />
  </span>
  {#if pop}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="pop" {onfocusout} {onkeydown}>
      <button
        class="icobtn"
        bind:this={btn}
        aria-label="Volume {said}"
        title="Volume {said}"
        aria-expanded={open}
        onclick={toggle}><Icon name={icon} /></button
      >
      {#if open}
        <span class="panel">
          {@render mute()}
          <input
            type="range"
            min="0"
            max="100"
            aria-label="Volume"
            aria-valuetext={said}
            class:muted={sound.muted}
            bind:this={slider}
            value={settings.volume}
            {oninput}
            {onchange}
          />
          <span class="num">{settings.volume}</span>
        </span>
      {/if}
    </span>
  {/if}
</div>

<style>
  .vol {
    display: flex;
    align-items: center;
    color: var(--ink-2);
  }
  .slide {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  input {
    accent-color: var(--ink);
  }
  /* muted keeps its value, shown faded */
  input.muted {
    opacity: 0.45;
  }
  .pop {
    display: none;
    position: relative;
  }
  @container bar-end (max-width: 239px) {
    .can-pop .slide {
      display: none;
    }
    .can-pop .pop {
      display: block;
    }
  }
  .icobtn {
    width: var(--icobtn, 38px);
    height: var(--icobtn, 38px);
    display: grid;
    place-items: center;
    border-radius: 50%;
    transition: background 0.15s;
  }
  .icobtn:hover,
  .icobtn[aria-expanded='true'] {
    background: var(--active);
    color: var(--ink);
  }
  /* above the button, over the library; the button sits near the window's
     right edge, so the panel grows to the left */
  .panel {
    position: absolute;
    bottom: calc(100% + 10px);
    right: -8px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px 6px 6px;
    border-radius: 12px;
    background: var(--panel);
    backdrop-filter: blur(20px);
    border: 1px solid var(--edge);
    box-shadow: 0 12px 32px var(--shadow);
  }
  .panel input {
    width: 120px;
  }
  .num {
    min-width: 3ch;
    text-align: right;
    font-size: var(--text-xs);
    color: var(--ink-2);
    font-variant-numeric: tabular-nums;
  }
</style>
