<script lang="ts">
  import IconButton from '../ui/IconButton.svelte'
  import { layout } from '../stores/layout.svelte'
  import { settings } from '../stores/settings.svelte'
</script>

<IconButton
  icon="viz"
  label="Change visualizer"
  on={settings.visualizer !== 'off'}
  onclick={() => layout.cycleVisualizer()}
/>
