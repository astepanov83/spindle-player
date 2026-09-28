<!-- "Covers" in the settings sheet: the online lookup (ticket 014). Off, nothing is sent anywhere. -->
<script lang="ts">
  import { coverSources, type CoverSource } from '../../../shared/settings'
  import { fetchLine } from '../library/scan-text'
  import Spinner from '../ui/Spinner.svelte'
  import { library } from '../stores/library.svelte'
  import { settings } from '../stores/settings.svelte'

  const names: Record<CoverSource, string> = {
    musicbrainz: 'MusicBrainz',
    deezer: 'Deezer',
    itunes: 'iTunes'
  }
  const line = $derived(settings.fetchCovers ? fetchLine(library.status.fetch) : undefined)
  const running = $derived(!!library.status.fetch?.running)
</script>

<div class="set">
  <span class="label">Covers</span>
  <label class="check">
    <input type="checkbox" bind:checked={settings.fetchCovers} />
    Find missing covers online
  </label>
  {#if settings.fetchCovers}
    <p class="hint">Sends artist and album names to the services below.</p>
    <div class="sources">
      {#each coverSources as s (s)}
        <label class="check">
          <input type="checkbox" bind:checked={settings.coverSources[s]} />
          {names[s]}
        </label>
      {/each}
    </div>
    {#if line}
      <p class="hint status" aria-live="polite">
        {#if running}<Spinner />{/if}
        <span>{line}</span>
      </p>
    {/if}
  {/if}
</div>

<style>
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
    font-size: 13.5px;
    cursor: pointer;
  }
  .check input {
    margin: 0;
    accent-color: var(--c2);
  }
  .sources {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
</style>
