<!-- "Pictures with no cover" in Settings, General (ticket 103): the styles as a
     radio group, each with a small picture of an album drawn in it. -->
<script lang="ts">
  import type { PictureArt } from '../../../shared/library'
  import { encodeCurve } from '../../../shared/loudness-text'
  import { fallbackPalettes } from '../../../shared/palette'
  import type { NoCover } from '../../../shared/settings'
  import Cover from '../ui/Cover.svelte'
  import { radioStep } from '../keys'
  import { soundLines } from '../plugins'
  import { settings } from '../stores/settings.svelte'

  const shown: { value: NoCover; label: string }[] = [
    { value: 'rings', label: 'Track rings' },
    { value: 'type', label: 'Title' },
    { value: 'sound', label: 'Sound' },
    { value: 'genre', label: 'Genre' },
    { value: 'record', label: 'Plain record' }
  ]
  const hints: Partial<Record<NoCover, string>> = {
    rings: 'A record with one ring per song, as wide as the song is long, in colors of its own.',
    sound:
      'A ring of bars, one arc per song. The bars show how loud the song is, so the pictures fill in over time as the songs are read.',
    type: 'The title and artist, set on a color of their own.',
    genre: 'A drawing for the genre tag, in colors of its own. Albums of one genre look alike.',
    record: 'The same grey record for every album.'
  }
  const sample: PictureArt = {
    seed: 'settings-sample',
    palette: fallbackPalettes('settings-sample'),
    lengths: [312, 428, 265, 503, 377],
    title: 'Blue Hours',
    artist: 'Marina Vale',
    genre: 'Jazz',
    // a made-up curve for each song, so the picker shows bars
    loudness: [0.5, 0.8, 0.35, 0.9, 0.6].map((base, i) =>
      encodeCurve(Array.from({ length: 32 }, (_, k) => base * (0.8 + 0.2 * Math.sin(k / 4 + i))))
    )
  }
  const reading = $derived(settings.noCover === 'sound' ? soundLines() : [])

  const picked = $derived(
    Math.max(
      0,
      shown.findIndex((o) => o.value === settings.noCover)
    )
  )

  function onkeydown(e: KeyboardEvent & { currentTarget: HTMLElement }, i: number): void {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const to = radioStep(e.key, i, shown.length)
    if (to === null) return
    e.preventDefault()
    ;(e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus()
    settings.noCover = shown[to].value
  }
</script>

<div class="set">
  <span class="section-label" id="no-cover-label">Pictures with no cover</span>
  <div class="picks" role="radiogroup" aria-labelledby="no-cover-label">
    {#each shown as o, i (o.value)}
      <button
        class="pick"
        role="radio"
        aria-checked={o.value === settings.noCover}
        tabindex={i === picked ? 0 : -1}
        onclick={() => (settings.noCover = o.value)}
        onkeydown={(e) => onkeydown(e, i)}
      >
        <span class="pic"><Cover src={undefined} art={sample} style={o.value} lazy={false} /></span>
        <span class="name">{o.label}</span>
      </button>
    {/each}
  </div>
  {#if hints[settings.noCover]}<p class="hint">{hints[settings.noCover]}</p>{/if}
  {#each reading as line (line)}<p class="hint">{line}</p>{/each}
</div>

<style>
  .set {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .pick {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 6px 6px 8px;
    border-radius: 10px;
    font: 500 var(--text-s) var(--ui);
    color: var(--ink-2);
    transition:
      background 0.15s,
      color 0.15s;
  }
  .pick:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .pic {
    width: 72px;
    height: 72px;
    border-radius: 6px;
    overflow: hidden;
    outline: 2px solid transparent;
    outline-offset: 2px;
  }
  .pick[aria-checked='true'] {
    color: var(--ink);
  }
  .pick[aria-checked='true'] .pic {
    outline-color: var(--ink);
  }
  .hint {
    margin: 0;
    font-size: var(--text-s);
    line-height: 1.45;
    color: var(--ink-2);
  }
</style>
