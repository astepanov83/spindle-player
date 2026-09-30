<script lang="ts">
  let { title, text }: { title: string; text: string } = $props()
</script>

<div class="empty"><b>{title}</b>{text}</div>

<style>
  .empty {
    color: var(--ink-3);
    font-size: var(--text-m);
    line-height: 1.6;
    padding: 30px 0;
    max-width: 44ch;
  }
  b {
    color: var(--ink);
    display: block;
    font-size: var(--title-s);
    margin-bottom: 4px;
  }
</style>
