// The mouse side buttons, Alt+Left / Alt+Right and Backspace go Back and
// Forward through the library's history, in any chip or section (ticket 051).
import { onDestroy } from 'svelte'
import { library } from '../stores/library.svelte'

// Only while a library view is on screen: Focus has none to go back in.
let shown = 0

// Call during setup of the view (Studio's chips, Classic's sidebar).
export function libraryOnScreen(): void {
  shown++
  onDestroy(() => shown--)
}

export function goBack(): void {
  if (shown) library.back()
}

export function goForward(): void {
  if (shown) library.forward()
}

// Chromium numbers them 3 (Back) and 4 (Forward).
export function onSideButton(e: MouseEvent): void {
  if (e.button !== 3 && e.button !== 4) return
  // stops Chromium's own history step
  e.preventDefault()
  if (e.button === 3) goBack()
  else goForward()
}
