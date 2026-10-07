<!-- An on/off switch: plugins, Fix artist names, the cover lookup. A button
     with role="switch"; like any button here, Space plays and pauses (keys.ts)
     and Enter or a click flips it. With `label` the text sits on its left;
     without, `name` (or `labelledby`) names it for screen readers. -->
<script lang="ts">
  let {
    on,
    onchange,
    label,
    name,
    labelledby,
    describedby,
    disabled = false
  }: {
    on: boolean
    onchange: (on: boolean) => void
    label?: string
    name?: string
    labelledby?: string
    describedby?: string
    disabled?: boolean
  } = $props()
</script>

<button
  class="switch"
  class:labelled={!!label}
  role="switch"
  aria-checked={on}
  aria-label={label ? undefined : name}
  aria-labelledby={labelledby}
  aria-describedby={describedby}
  {disabled}
  onclick={() => onchange(!on)}
>
  {#if label}<span class="text">{label}</span>{/if}
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
</button>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 2px;
    border-radius: 99px;
    color: var(--ink);
    font-size: var(--text-s);
    text-align: left;
  }
  .switch.labelled {
    display: flex;
    width: 100%;
    justify-content: space-between;
    padding: 2px 2px 2px 0;
    border-radius: 8px;
  }
  .text {
    min-width: 0;
  }
  .track {
    flex: none;
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--ink) 20%, transparent);
    transition: background 0.15s;
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ink);
    transition:
      transform 0.15s,
      background 0.15s;
  }
  [aria-checked='true'] .track {
    background: var(--c2);
  }
  [aria-checked='true'] .knob {
    transform: translateX(16px);
    background: var(--on-cover);
  }
  .switch:hover:not(:disabled) .track {
    filter: brightness(1.15);
  }
  .switch:disabled {
    opacity: 0.45;
    cursor: default;
  }
  @media (prefers-reduced-motion: reduce) {
    .track,
    .knob {
      transition: none;
    }
  }
</style>
