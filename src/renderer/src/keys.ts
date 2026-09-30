// Space plays and pauses from anywhere except a text field, so a button that
// kept focus after a click is never pressed by it.
type Target = Pick<HTMLElement, 'tagName' | 'isContentEditable'> & { type?: string }
type Key = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'>

const textInputs = ['text', 'search', 'number', 'email', 'url', 'password', 'tel', '']

// A slider or checkbox is not a text field: Space there still plays.
export function isTyping(t: Target): boolean {
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true
  return t.tagName === 'INPUT' && textInputs.includes((t.type ?? '').toLowerCase())
}

// 'block' stops the browser from pressing the focused button, 'toggle' also plays or pauses.
// A held key repeats, so only the first press toggles. An open menu keeps its own keys.
export function spaceAction(e: Key, t: Target, menuOpen: boolean): 'none' | 'block' | 'toggle' {
  if (e.code !== 'Space' || menuOpen || isTyping(t)) return 'none'
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return 'block'
  return 'toggle'
}
