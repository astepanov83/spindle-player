// The mouse side buttons move between a list and the page opened from it.
import { library, type Page } from '../stores/library.svelte'

// Chromium numbers them 3 (Back) and 4 (Forward). `page` is null where
// the view has no such page.
export function onSideButton(e: MouseEvent, page: Page | null): void {
  if (e.button !== 3 && e.button !== 4) return
  // stops Chromium's own history step
  e.preventDefault()
  if (!page) return
  if (e.button === 3) library.back(page)
  else library.forward(page)
}
