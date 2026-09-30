<!-- "Close Spindle?" before the window closes, while the setting is Ask
     (ticket 049). Main asks; see MainWindow.askClose. -->
<script lang="ts">
  import { flushSync } from 'svelte'
  import { settings } from '../stores/settings.svelte'

  let el: HTMLDialogElement | undefined = $state()
  let minimizeBtn: HTMLButtonElement | undefined = $state()
  let remember = $state(false)

  $effect(() =>
    window.win.onAskClose(() => {
      // told at once, so main doesn't take the page for stuck and close anyway
      window.win.closeShown()
      if (!el || el.open) return
      remember = false
      el.showModal()
      minimizeBtn?.focus()
    })
  )

  function answer(action: 'minimize' | 'quit'): void {
    if (remember) {
      settings.closeAction = action
      // saved before the answer goes, which may quit the app
      flushSync()
    }
    el?.close()
    window.win.closeAnswer(action)
  }

  // a click on the dim area around the box is Cancel
  function onclick(e: MouseEvent): void {
    if (e.target === el) el?.close()
  }
</script>

<!-- Keys stay in the box: Space presses a button here, and Escape (the
     dialog's own cancel) must not also close Settings behind it. -->
<dialog
  bind:this={el}
  aria-labelledby="close-ask-title"
  {onclick}
  onkeydown={(e) => e.stopPropagation()}
>
  <div class="box">
    <h3 id="close-ask-title">Close Spindle?</h3>
    <p class="hint">Minimize keeps the music playing.</p>
    <label class="check">
      <input type="checkbox" bind:checked={remember} />
      Remember my choice
    </label>
    {#if remember}<p class="hint">You can change this in Settings.</p>{/if}
    <div class="acts">
      <button class="pill" bind:this={minimizeBtn} onclick={() => answer('minimize')}>
        Minimize
      </button>
      <button class="pill ghost" onclick={() => answer('quit')}>Quit</button>
      <button class="pill ghost" onclick={() => el?.close()}>Cancel</button>
    </div>
  </div>
</dialog>

<style>
  dialog {
    padding: 0;
    border: none;
    border-radius: 14px;
    color: var(--ink);
    background: var(--panel);
    box-shadow:
      0 20px 50px var(--shadow),
      0 0 0 1px var(--edge);
    width: min(340px, calc(100% - 24px));
  }
  dialog[open] {
    animation: fadeup 0.2s;
  }
  dialog::backdrop {
    background: var(--glass);
  }
  @keyframes fadeup {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @keyframes fadein {
    from {
      opacity: 0;
    }
  }
  /* a fade, not a movement */
  @media (prefers-reduced-motion: reduce) {
    dialog[open] {
      animation-name: fadein;
    }
  }
  .box {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 18px 16px;
  }
  h3 {
    margin: 0;
    font-size: var(--title-s);
  }
  .hint {
    margin: 0;
    font-size: var(--text-s);
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
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
</style>
