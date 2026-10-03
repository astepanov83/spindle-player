<!-- "Covers" in the settings sheet: the online lookup (ticket 014). Off, nothing is sent anywhere. -->
<script lang="ts">
  import { coverSources, type CoverSource } from '../../../shared/settings'
  import Spinner from '../ui/Spinner.svelte'
  import { coverLines } from '../plugins'
  import { settings } from '../stores/settings.svelte'

  const names: Record<CoverSource, string> = {
    musicbrainz: 'MusicBrainz',
    deezer: 'Deezer',
    itunes: 'iTunes'
  }
  const lines = $derived(settings.fetchCovers ? coverLines() : [])
</script>

<div class="set">
  <span class="section-label">Covers</span>
  <label class="check">
    <input type="checkbox" bind:checked={settings.fetchCovers} />
    Find missing covers online
  </label>
  {#if settings.fetchCovers}
    <p class="hint">
      Sends artist and album names, and the songs radio plays, to the services below. Artist photos
      come from Deezer; radio song covers from Deezer and iTunes.
    </p>
    <div class="sources">
      {#each coverSources as s (s)}
        <label class="check">
          <input type="checkbox" bind:checked={settings.coverSources[s]} />
          {names[s]}
        </label>
      {/each}
    </div>
    {#each lines as line, i (i)}
      <p class="hint status" aria-live="polite">
        {#if line.busy}<Spinner />{/if}
        <span>{line.text}</span>
      </p>
    {/each}
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
  .sources {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
</style>
