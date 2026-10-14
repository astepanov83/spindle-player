<!-- "Notifications" in Settings, General (ticket 126). Off and greyed out
     where the system has no notifications. -->
<script lang="ts">
  import Switch from '../ui/Switch.svelte'
  import { settings } from '../stores/settings.svelte'

  // until main answers, taken as there: most systems have them
  let supported = $state(true)
  void window.notifyApi.supported().then(
    (yes) => (supported = yes),
    () => {}
  )
</script>

<div class="set">
  <span class="section-label">Notifications</span>
  <Switch
    label="Show a notification when the song changes"
    on={supported && settings.songNotices}
    disabled={!supported}
    onchange={(on) => (settings.songNotices = on)}
  />
  {#if !supported}
    <p class="hint">This system can't show notifications.</p>
  {:else if settings.songNotices}
    <p class="hint">
      When a new song starts or the radio's song changes while Spindle is minimized or behind
      another window, a notification shows the song with its cover. Click it to bring Spindle back.
    </p>
  {/if}
</div>

<style>
  .set {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hint {
    margin: 0;
    font-size: var(--text-s);
    line-height: 1.45;
    color: var(--ink-2);
  }
</style>
