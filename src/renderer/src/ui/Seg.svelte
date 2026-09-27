<!-- Segmented buttons: one of a few choices. -->
<script lang="ts" generics="T extends string">
  let {
    options,
    value,
    onchange
  }: { options: { value: T; label: string }[]; value: T; onchange: (v: T) => void } = $props()
</script>

<div class="seg">
  {#each options as o (o.value)}
    <button aria-pressed={o.value === value} onclick={() => onchange(o.value)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    gap: 3px;
    background: var(--well);
    padding: 3px;
    border-radius: 10px;
  }
  button {
    flex: 1;
    font: 500 13px var(--ui);
    color: var(--ink-2);
    padding: 7px 8px;
    border-radius: 8px;
  }
  button[aria-pressed='true'] {
    background: var(--raised);
    color: var(--ink);
  }
</style>
