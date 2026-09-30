// A short line that goes away by itself, with at most one button (Undo, Open Settings).
export interface NoticeAction {
  label: string
  run: () => void
}

// A button needs time to be reached, so a notice with one stays longer.
const plainMs = 4000
const actionMs = 8000

class NoticeStore {
  text = $state('')
  action: NoticeAction | undefined = $state.raw()
  #timer: ReturnType<typeof setTimeout> | undefined
  #held = false

  show(text: string, action?: NoticeAction): void {
    this.text = text
    this.action = action
    this.#wait()
  }

  hide(): void {
    clearTimeout(this.#timer)
    // the box stops taking the pointer, so its pointerleave may never come
    this.#held = false
    this.text = ''
    this.action = undefined
  }

  // The button was pressed: it runs once, and the notice goes.
  press(): void {
    const a = this.action
    this.hide()
    a?.run()
  }

  // The pointer is on the notice: it stays until the pointer leaves.
  hold(): void {
    this.#held = true
    clearTimeout(this.#timer)
  }

  release(): void {
    this.#held = false
    if (this.text) this.#wait()
  }

  #wait(): void {
    clearTimeout(this.#timer)
    if (this.#held) return
    this.#timer = setTimeout(() => this.hide(), this.action ? actionMs : plainMs)
  }
}

export const notice = new NoticeStore()
