// Focus fades its tabs, controls and title bar while nobody uses it (ticket
// 113). The faded parts carry `data-fades`; App.svelte sets `.idle`.
export const idleMs = 3000

// What the stores say. Hidden only while all of it allows.
export interface IdleState {
  // the setting is on and the layout hides (Focus)
  on: boolean
  playing: boolean
  // a menu, Settings, the drawer or the Queue tab
  open: boolean
}

export const mayHide = (s: IdleState): boolean => s.on && s.playing && !s.open

// The part of an element this needs, so tests can fake it.
interface Spot {
  closest(selector: string): unknown
  matches(selector: string): boolean
}

// What the page says when the time is up: the pointer resting on the
// controls, keyboard focus in them, or a dialog (the close question) keep
// them. Focus put there by a click is not keyboard use, so it doesn't count.
export function pageKeeps(p: {
  pointerAt: Spot | null
  focused: Spot | null
  windowFocused: boolean
  dialogOpen: boolean
}): boolean {
  if (p.dialogOpen) return true
  if (p.pointerAt?.closest('[data-fades]')) return true
  const f = p.focused
  return !!f && p.windowFocused && !!f.closest('[data-fades]') && f.matches(':focus-visible')
}

export class IdleTimer {
  #hidden = false
  #allowed = false
  #timer: ReturnType<typeof setTimeout> | undefined
  readonly #onChange: (hidden: boolean) => void
  readonly #pageKeeps: () => boolean

  constructor(onChange: (hidden: boolean) => void, pageKeeps: () => boolean = () => false) {
    this.#onChange = onChange
    this.#pageKeeps = pageKeeps
  }

  get hidden(): boolean {
    return this.#hidden
  }

  // From the stores (mayHide). Allowed again, the 3 s start over.
  allow(on: boolean): void {
    if (on === this.#allowed) return
    this.#allowed = on
    if (on) this.#arm()
    else {
      this.#cancel()
      this.#set(false)
    }
  }

  // A mouse move, a key, a touch: shown at once, and the 3 s start over.
  poke(): void {
    this.#set(false)
    this.#arm()
  }

  // The page's reason to keep them may be gone with no move (the pointer
  // left the window, the window lost focus): wait again if not waiting.
  retry(): void {
    if (!this.#hidden && this.#timer === undefined) this.#arm()
  }

  stop(): void {
    this.#cancel()
  }

  #arm(): void {
    this.#cancel()
    if (this.#allowed) this.#timer = setTimeout(() => this.#fire(), idleMs)
  }

  #cancel(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  #fire(): void {
    this.#timer = undefined
    if (this.#allowed && !this.#pageKeeps()) this.#set(true)
  }

  #set(hidden: boolean): void {
    if (hidden === this.#hidden) return
    this.#hidden = hidden
    this.#onChange(hidden)
  }
}
