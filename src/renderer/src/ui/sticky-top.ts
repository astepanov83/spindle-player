// How much of a scroll box's top is covered by parts that stick there
// (a list's column heads, its held heading), so a row put at the top by a
// look switch, or picked by Tab, is not hidden under them (ticket 102).
// A list marks such parts with data-sticky-top; the box needs no other help.

export interface StickyPart {
  // where it is now and where it sticks, in px from the box's top
  top: number
  bottom: number
  sticksAt: number
}

// A part counts while it is stuck (at or above where it sticks; a held
// heading pushed up by the next one is above it). One still lower down the
// page, as a song list's heads under the page head, covers nothing yet.
export function coveredBy(parts: StickyPart[]): number {
  let covered = 0
  for (const p of parts)
    if (p.top <= p.sticksAt + 1 && p.bottom > 0) covered = Math.max(covered, p.bottom)
  return covered
}

export function coveredTop(box: HTMLElement): number {
  const marked = box.querySelectorAll<HTMLElement>('[data-sticky-top]')
  if (!marked.length) return 0
  const r = box.getBoundingClientRect()
  // a sticky top is measured from inside the box's padding
  const pad = parseFloat(getComputedStyle(box).paddingTop) || 0
  return coveredBy(
    [...marked].map((e) => {
      const b = e.getBoundingClientRect()
      return {
        top: b.top - r.top,
        bottom: b.bottom - r.top,
        sticksAt: pad + (parseFloat(getComputedStyle(e).top) || 0)
      }
    })
  )
}

// How much of the box's top a list view's sticking title row covers, read
// from an element under it (library/ViewHead.svelte); 0 under none.
export function titleCover(el: Element | undefined): number {
  return el ? parseFloat(getComputedStyle(el).getPropertyValue('--vhead-h')) || 0 : 0
}
