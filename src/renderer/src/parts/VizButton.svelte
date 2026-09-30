<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import { layout } from '../stores/layout.svelte'
  import { settings } from '../stores/settings.svelte'
  import { vzLabel } from '../visualizer/names'

  // Off has its own crossed-out icon, so it doesn't rest on the on dot alone.
  const off = $derived(settings.visualizer === 'off')
</script>

<IconButton
  icon={off ? 'vizOff' : 'viz'}
  label="{vzLabel(settings.visualizer)}. Press to change."
  on={!off}
  onclick={() => layout.cycleVisualizer()}
/>
