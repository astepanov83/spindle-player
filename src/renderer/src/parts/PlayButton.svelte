<!-- The filled circle: play and pause for songs, play and stop for radio. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte'
  import type { IconName } from '../ui/icons'

  let {
    icon,
    label,
    disabled = false,
    onclick
  }: { icon: IconName; label: string; disabled?: boolean; onclick: () => void } = $props()
</script>

<button class="playbtn" aria-label={label} {disabled} {onclick}
  ><Icon name={icon} size={26} /></button
>

<style>
  /* this component's class wins over the global button reset */
  .playbtn {
    width: var(--playbtn, 54px);
    height: var(--playbtn, 54px);
    border-radius: 50%;
    background: var(--ink);
    color: var(--bg);
    display: grid;
    place-items: center;
    transition: transform 0.15s;
    flex: none;
  }
  .playbtn :global(.ico) {
    width: var(--playico, 26px) !important;
    height: var(--playico, 26px) !important;
  }
  .playbtn:hover:not(:disabled) {
    transform: scale(1.06);
  }
  .playbtn:active:not(:disabled) {
    transform: scale(0.96);
  }
  .playbtn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
