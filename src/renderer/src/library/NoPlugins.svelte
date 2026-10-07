<!-- The library with every plugin off: no tabs, one page. -->
<script lang="ts">
  import Empty from './Empty.svelte'
  import { plugins } from '../../../shared/plugins'
  import { layout } from '../stores/layout.svelte'
</script>

<Empty
  title="Turn on a plugin in Settings"
  text="Music files, Radio and Music For Programming each add their tabs here. Each has its own section in Settings, with its switch."
/>
<!-- the first plugin's section; the others are next to it in the list -->
<button class="chip" onclick={() => layout.openSettings(plugins[0].id)}>Open Settings</button>
