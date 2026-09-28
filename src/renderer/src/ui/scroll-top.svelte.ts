// A new view in a library area starts at the top. Call during component setup:
// `view` reads whatever picks the view (section, open album...).
export function scrollTopOnChange(box: () => HTMLElement | undefined, view: () => unknown): void {
  $effect(() => {
    void view()
    const el = box()
    if (el) el.scrollTop = 0
  })
}
