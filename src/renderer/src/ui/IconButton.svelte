<script lang="ts">
  import Icon from './Icon.svelte'
  import type { IconName } from './icons'

  let {
    icon,
    label,
    on = false,
    act,
    onclick
  }: {
    icon: IconName
    label: string
    on?: boolean
    // names a slot button, so focus can be handed to it
    act?: string
    onclick: () => void
  } = $props()
</script>

<button class="icobtn" class:on aria-label={label} data-act={act} {onclick}
  ><Icon name={icon} /></button
>

<style>
  .icobtn {
    position: relative;
    width: var(--icobtn, 38px);
    height: var(--icobtn, 38px);
    display: grid;
    place-items: center;
    border-radius: 50%;
    opacity: 0.8;
    transition:
      opacity 0.15s,
      background 0.15s;
  }
  .icobtn:hover {
    opacity: 1;
    background: var(--active);
  }
  .icobtn.on {
    opacity: 1;
    color: var(--ink);
  }
  .icobtn.on::after {
    content: '';
    position: absolute;
    bottom: 1px;
    left: 50%;
    margin-left: -2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
  }
</style>
