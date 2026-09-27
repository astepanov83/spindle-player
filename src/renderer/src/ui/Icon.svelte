<script lang="ts">
  import { icons, type IconName } from './icons'

  let { name, size = 20 }: { name: IconName; size?: number } = $props()
</script>

<svg
  class="ico"
  viewBox="0 0 24 24"
  style:width="{size}px"
  style:height="{size}px"
  aria-hidden="true"><path d={icons[name]} /></svg
>

<style>
  .ico {
    fill: currentColor;
    display: block;
    flex: none;
  }
</style>
