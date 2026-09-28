// A short line at the bottom of the window that goes away by itself.
class NoticeStore {
  text = $state('')
  #timer: ReturnType<typeof setTimeout> | undefined

  show(text: string, ms = 4000): void {
    this.text = text
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => (this.text = ''), ms)
  }
}

export const notice = new NoticeStore()
