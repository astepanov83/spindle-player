<!-- The short notice. With a library it sits at the bottom middle of the
     library part: above Classic's bar, below Studio's search box, and away
     from every player control. Focus has no library: it sits under the tabs,
     over the cover. A plain one lets clicks through. -->
<script lang="ts">
  import { notice } from '../stores/notice.svelte'

  let el: HTMLDivElement | undefined = $state()
  // where it goes, in px from the app's box; measured each time it shows
  let place = $state({ x: 0, y: 46, bottom: false, width: 520 })
  // where focus was before it came to the button: the button goes when
  // pressed, and focus would drop to the page
  let cameFrom: HTMLElement | null = null

  function onfocusin(e: FocusEvent): void {
    notice.hold()
    const from = e.relatedTarget
    if (from instanceof HTMLElement && !el?.contains(from)) cameFrom = from
  }

  function press(): void {
    const back = el?.contains(document.activeElement) ? cameFrom : null
    cameFrom = null
    notice.press()
    if (back?.isConnected) back.focus()
  }

  function measure(): void {
    const app = el?.parentElement
    if (!app) return
    const a = app.getBoundingClientRect()
    const host = document.querySelector('[data-notice-host]')
    if (host) {
      const r = host.getBoundingClientRect()
      place = {
        x: r.left - a.left + r.width / 2,
        y: a.bottom - r.bottom + 16,
        bottom: true,
        width: r.width
      }
      return
    }
    const tabs = document.querySelector('[data-notice-under]')
    const y = tabs ? tabs.getBoundingClientRect().bottom - a.top + 8 : 46
    place = { x: a.width / 2, y, bottom: false, width: a.width }
  }

  $effect(() => {
    if (notice.text) measure()
  })

  // The button went without a press (dropped, or a newer notice): focus on
  // it would fall to the page, so it goes back too.
  $effect(() => {
    if (notice.action) return
    const back = cameFrom
    cameFrom = null
    if (back?.isConnected && document.activeElement === document.body) back.focus()
  })
</script>

<svelte:window onresize={() => notice.text && measure()} />

<div
  bind:this={el}
  class="notice"
  class:show={!!notice.text}
  class:bottom={place.bottom}
  class:acts={!!notice.action}
  style:left="{place.x}px"
  style:top={place.bottom ? null : `${place.y}px`}
  style:bottom={place.bottom ? `${place.y}px` : null}
  style:max-width="{Math.min(560, place.width - 32)}px"
  role="status"
  aria-live="polite"
  onpointerenter={() => notice.hold()}
  onpointerleave={() => notice.release()}
  {onfocusin}
  onfocusout={() => notice.release()}
>
  <span class="text">{notice.text}</span>
  {#if notice.action}
    <button class="act chip" onclick={press}>{notice.action.label}</button>
  {/if}
</div>

<style>
  .notice {
    position: absolute;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 14px;
    transform: translate(-50%, -8px);
    padding: 10px 16px;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--edge);
    box-shadow: 0 10px 30px var(--shadow);
    font-size: var(--text-m);
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.2s,
      transform 0.2s;
  }
  .notice.bottom {
    transform: translate(-50%, 8px);
  }
  .notice.show {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  /* a plain notice lets clicks through; one with a button waits under the pointer */
  .notice.show.acts {
    pointer-events: auto;
  }
  .text {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .act {
    flex: none;
    margin: -4px -8px -4px 0;
    padding: 4px 10px;
    font-weight: 600;
    color: var(--ink);
  }
</style>
