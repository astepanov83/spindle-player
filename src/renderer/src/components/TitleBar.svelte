<script lang="ts">
  let {
    title,
    settingsOpen = false,
    onSettings
  }: { title: string; settingsOpen?: boolean; onSettings: () => void } = $props()

  let maximized = $state(false)

  $effect(() => {
    window.win.isMaximized().then((m) => (maximized = m))
    return window.win.onMaximized((m) => (maximized = m))
  })
</script>

<!-- Double-click to maximize comes from the drag area itself, no handler needed. -->
<header class="titlebar">
  <span class="title">{title}</span>
  <div class="right">
    <button class="tbbtn" class:on={settingsOpen} aria-label="Settings" onclick={onSettings}>
      <svg class="ico" viewBox="0 0 24 24"
        ><path
          d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
        /></svg
      >
    </button>
    <div class="winbtns">
      <button aria-label="Minimize" onclick={() => window.win.minimize()}>
        <svg viewBox="0 0 10 10"><path d="M1 5h8" /></svg>
      </button>
      <button
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onclick={() => window.win.toggleMaximize()}
      >
        {#if maximized}
          <svg viewBox="0 0 10 10"
            ><rect x="1" y="3" width="6" height="6" /><path d="M3 3V1h6v6H7" /></svg
          >
        {:else}
          <svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" /></svg>
        {/if}
      </button>
      <button class="close" aria-label="Close" onclick={() => window.win.close()}>
        <svg viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" /></svg>
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
    font-size: 12px;
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
  button:hover,
  .tbbtn.on {
    background: var(--active);
    color: var(--ink);
  }
  .tbbtn {
    width: 30px;
  }
  .ico {
    width: 16px;
    height: 16px;
    fill: currentColor;
    display: block;
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
  .winbtns svg {
    width: 11px;
    height: 11px;
    stroke: currentColor;
    stroke-width: 1.4;
    fill: none;
  }
</style>
