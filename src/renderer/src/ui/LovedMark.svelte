<!-- The small heart after a loved song's title in a row (ticket 117). Only a
     mark: the row is a button, so Love and Unlove are in its menu. -->
<script lang="ts">
  import Icon from './Icon.svelte'
</script>

<span class="loved" role="img" aria-label="Loved" title="Loved"
  ><Icon name="heartOn" size={14} /></span
>

<style>
  .loved {
    flex: none;
    color: var(--c2);
  }
</style>
