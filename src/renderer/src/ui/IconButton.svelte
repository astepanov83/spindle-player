<script lang="ts">
  import Icon from './Icon.svelte'
  import type { IconName } from './icons'

  let {
    icon,
    label,
    on = false,
    act,
    disabled = false,
    onclick
  }: {
    icon: IconName
    label: string
    on?: boolean
    // names a slot button, so focus can be handed to it
    act?: string
    disabled?: boolean
    onclick: () => void
  } = $props()
</script>

<!-- the title shows the name on hover; the icon alone doesn't say it -->
<button class="icobtn" class:on aria-label={label} title={label} data-act={act} {disabled} {onclick}
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
      background 0.15s,
      transform 0.1s;
  }
  .icobtn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .icobtn:hover:not(:disabled) {
    opacity: 1;
    background: var(--active);
  }
  .icobtn:active:not(:disabled) {
    transform: scale(0.92);
  }
  /* On (Shuffle, Repeat, an open queue) in the album accent, fitted to 3:1 on
     every area it sits on (specs/themes.md), plus the dot for those who can't
     tell the color. */
  .icobtn.on {
    opacity: 1;
    color: var(--c2);
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
