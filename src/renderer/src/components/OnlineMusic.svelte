<!-- "Plugins" in the settings sheet: a switch per plugin. Off, MFP never asks the site. -->
<script lang="ts">
  import { plugins, switchablePlugins } from '../../../shared/plugins'
  import { mfpLine } from '../library/scan-text'
  import Spinner from '../ui/Spinner.svelte'
  import { library } from '../stores/library.svelte'
  import { settings } from '../stores/settings.svelte'

  const shown = plugins.filter((p) => switchablePlugins.includes(p.id))
  const m = $derived(settings.plugins.mfp ? library.status.mfp : undefined)
  const line = $derived(mfpLine(m, Date.now()))
</script>

<div class="set">
  <span class="section-label">Plugins</span>
  {#each shown as p (p.id)}
    <label class="check">
      <input type="checkbox" bind:checked={settings.plugins[p.id]} />
      {p.name}
    </label>
    {#if settings.plugins[p.id]}
      {#if p.id === 'mfp'}
        <p class="hint">
          Mixes from musicforprogramming.net, in the MFP tab. Song times inside a mix are guessed:
          the site gives none.
        </p>
        {#if line}
          <p class="hint status" aria-live="polite">
            {#if m?.running}<Spinner />{/if}
            <span>{line}</span>
          </p>
        {/if}
      {:else}
        <p class="hint">{p.about}</p>
      {/if}
    {/if}
  {/each}
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
  .status {
    display: flex;
    gap: 7px;
    align-items: baseline;
  }
  /* sit on the first line's middle, not its baseline */
  .status :global(.spinner) {
    align-self: flex-start;
    margin-top: 4px;
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
