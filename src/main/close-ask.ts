// What closing the window does (ticket 049). See work/specs/window.md, "Closing".
import type { CloseAction } from '../shared/settings'

export type CloseStep = 'ask' | 'minimize' | 'quit' | 'close'

// closing: the app quits, or the close was already decided. pageUp: the page
// is loaded and can show the question.
export function closeStep(
  setting: CloseAction,
  at: { closing: boolean; pageUp: boolean }
): CloseStep {
  if (at.closing) return 'close'
  if (setting !== 'ask') return setting
  // a page still loading or crashed can't ask, and the window must still close
  return at.pageUp ? 'ask' : 'close'
}

// The page's answer; anything else is dropped.
export function parseCloseAnswer(v: unknown): 'minimize' | 'quit' | undefined {
  return v === 'minimize' || v === 'quit' ? v : undefined
}
