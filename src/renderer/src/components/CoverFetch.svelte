<!-- "Covers" in Settings, General: the online lookup (ticket 014). Off, nothing is sent anywhere. -->
<script lang="ts">
  import { coverSources, type CoverSource } from '../../../shared/settings'
  import Spinner from '../ui/Spinner.svelte'
  import Switch from '../ui/Switch.svelte'
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
  <Switch
    label="Find missing covers online"
    on={settings.fetchCovers}
    onchange={(on) => (settings.fetchCovers = on)}
  />
  {#if settings.fetchCovers}
    <p class="hint">
      Sends artist and album names, and the songs radio plays, to the services below. Artist photos
      come from Deezer; radio song covers from Deezer and iTunes.
    </p>
    <ul class="sources" aria-label="Cover services">
      {#each coverSources as s (s)}
        <li>
          <Switch
            label={names[s]}
            on={settings.coverSources[s]}
            onchange={(on) => (settings.coverSources[s] = on)}
          />
        </li>
      {/each}
    </ul>
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
  .sources {
    list-style: none;
    margin: 0;
    padding: 3px 10px;
    border-radius: 10px;
    background: var(--well);
  }
  li {
    padding: 4px 0;
  }
  li + li {
    box-shadow: 0 -1px 0 var(--edge);
  }
</style>
