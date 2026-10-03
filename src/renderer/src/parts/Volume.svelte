<!-- The volume slider. With `pop`, a narrow player bar (the bar-end container in
     Controls) shows a button instead, which opens the
     slider above it. Up / Down set the volume from anywhere either way. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import { settings } from '../stores/settings.svelte'

  let { width = 90, pop = false }: { width?: number; pop?: boolean } = $props()

  let open = $state(false)
  let btn: HTMLButtonElement | undefined = $state()
  let slider: HTMLInputElement | undefined = $state()

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
</script>

<div class="vol" class:can-pop={pop}>
  <span class="slide">
    <Icon name="vol" />
    <input
      type="range"
      min="0"
      max="100"
      aria-label="Volume"
      style:width="{width}px"
      bind:value={settings.volume}
    />
  </span>
  {#if pop}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="pop" {onfocusout} {onkeydown}>
      <button
        class="icobtn"
        bind:this={btn}
        aria-label="Volume {settings.volume}%"
        title="Volume {settings.volume}%"
        aria-expanded={open}
        onclick={toggle}><Icon name="vol" /></button
      >
      {#if open}
        <span class="panel">
          <input
            type="range"
            min="0"
            max="100"
            aria-label="Volume"
            bind:this={slider}
            bind:value={settings.volume}
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
    gap: 8px;
  }
  input {
    accent-color: var(--ink);
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
    gap: 10px;
    padding: 10px 14px;
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
