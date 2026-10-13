<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import { layout } from '../stores/layout.svelte'
  import { settings } from '../stores/settings.svelte'
  import { vzLabel } from '../visualizer/names'

  // Off has its own crossed-out icon, so it doesn't rest on the on dot alone.
  const off = $derived(settings.visualizer === 'off')
  // not lit while the words cover the stage: it isn't seen then
  const hidden = $derived(layout.wordsOverStage)
</script>

<IconButton
  icon={off ? 'vizOff' : 'viz'}
  label={hidden
    ? 'Show the visualizer in place of the lyrics'
    : `${vzLabel(settings.visualizer)}. Press to change.`}
  on={!off && !hidden}
  onclick={() => layout.pressVisualizer()}
/>
