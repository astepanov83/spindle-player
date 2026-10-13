<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import { layout } from '../stores/layout.svelte'
  import { settings } from '../stores/settings.svelte'
  import { vzLabel } from '../visualizer/names'

  // Off has its own crossed-out icon, so it doesn't rest on the on dot alone.
  const off = $derived(settings.visualizer === 'off')
  // not lit while the queue or the words cover the stage: it isn't seen then
  const queued = $derived(layout.hides('stage'))
  const hidden = $derived(queued || layout.wordsOverStage)
</script>

<!-- none where nothing draws the visualizer (a narrow Classic) -->
{#if layout.hasStage}
  <IconButton
    icon={off ? 'vizOff' : 'viz'}
    label={queued
      ? 'Show the visualizer'
      : hidden
        ? 'Show the visualizer in place of the lyrics'
        : `${vzLabel(settings.visualizer)}. Press to change.`}
    on={!off && !hidden}
    onclick={() => layout.pressVisualizer()}
  />
{/if}
