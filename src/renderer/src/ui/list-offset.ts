// Where a virtual list's rows start inside its scroll box. Anything above the
// rows (a page header, the table head) can change height when the window is
// resized or a line comes and goes, so this is watched, not read once.

// The rows' top in the scroll box's content, from two rects and the scroll.
export function listOffset(
  listTop: number,
  boxTop: number,
  boxBorderTop: number,
  scrollTop: number
): number {
  return listTop - boxTop - boxBorderTop + scrollTop
}

// Calls `changed` with the offset now and whenever something above the rows
// changes size or is added or taken away. Returns the function that stops it.
export function watchOffset(
  list: HTMLElement,
  box: HTMLElement,
  changed: (offset: number) => void
): () => void {
  let last = NaN
  const read = (): void => {
    const offset = listOffset(
      list.getBoundingClientRect().top,
      box.getBoundingClientRect().top,
      box.clientTop,
      box.scrollTop
    )
    if (offset !== last) changed((last = offset))
  }
  const sizes = new ResizeObserver(read)
  // Only elements before the rows, at each level up to the box: the rows
  // themselves change all the time while scrolling and never move the top.
  const watch = (): void => {
    sizes.disconnect()
    for (let el: HTMLElement | null = list; el && el !== box; el = el.parentElement)
      for (let s = el.previousElementSibling; s; s = s.previousElementSibling) sizes.observe(s)
    read()
  }
  // childList only, not subtree, so drawing rows doesn't trigger it
  const added = new MutationObserver(watch)
  for (let el = list.parentElement; el; el = el.parentElement) {
    added.observe(el, { childList: true })
    if (el === box) break
  }
  watch()
  return () => {
    sizes.disconnect()
    added.disconnect()
  }
}
