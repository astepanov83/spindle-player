<!-- The short notice under the title bar, where no template has player controls. It never takes clicks. -->
<script lang="ts">
  import { notice } from '../stores/notice.svelte'
</script>

<div class="notice" class:show={!!notice.text} role="status" aria-live="polite">
  {notice.text}
</div>

<style>
  .notice {
    position: absolute;
    left: 50%;
    top: 46px;
    z-index: 30;
    max-width: min(520px, calc(100% - 32px));
    transform: translate(-50%, -8px);
    padding: 10px 16px;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--edge);
    box-shadow: 0 10px 30px var(--shadow);
    font-size: 13.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.2s,
      transform 0.2s;
  }
  .notice.show {
    opacity: 1;
    transform: translate(-50%, 0);
  }
</style>
