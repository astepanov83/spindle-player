// The mouse side buttons, Alt+Left / Alt+Right and Backspace move between a
// list and the page opened from it.
import { onDestroy } from 'svelte'
import { library, type Page } from '../stores/library.svelte'

// The library view on screen says which page Back and Forward work on.
let shown: () => Page | null = () => null

// Call during setup of the view (Studio's chips, Classic's sidebar).
export function showPage(get: () => Page | null): void {
  shown = get
  onDestroy(() => {
    if (shown === get) shown = () => null
  })
}

export function goBack(): void {
  const page = shown()
  if (page) library.back(page)
}

export function goForward(): void {
  const page = shown()
  if (page) library.forward(page)
}

// Chromium numbers them 3 (Back) and 4 (Forward).
export function onSideButton(e: MouseEvent): void {
  if (e.button !== 3 && e.button !== 4) return
  // stops Chromium's own history step
  e.preventDefault()
  if (e.button === 3) goBack()
  else goForward()
}
