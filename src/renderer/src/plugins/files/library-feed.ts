// Takes the libraries main sends while scans run: patches on the library the
// page shows (ticket 022). A patch that doesn't fit it (one was missed, or
// the library process started again) makes the page ask for the whole
// library once; what comes while it waits is put on top after it.
import {
  patchStep,
  type LibraryMessage,
  type LibraryVersion
} from '../../../../shared/plugins/files/library-patch'

export interface FeedDeps {
  // the version of the library shown
  have(): LibraryVersion | undefined
  // shows it; throws when a patch doesn't fit
  apply(m: LibraryMessage): void
  // the whole library from main
  fetch(): Promise<LibraryMessage>
  // an ask failed; the page keeps what it shows
  fail(error: unknown): void
}

export class LibraryFeed {
  // messages that came while the whole library was asked for
  #waiting: LibraryMessage[] | undefined

  constructor(readonly deps: FeedDeps) {}

  take(m: LibraryMessage): void {
    if (this.#waiting) {
      this.#waiting.push(m)
      return
    }
    const step = patchStep(this.deps.have(), m)
    if (step === 'skip') return
    if (step === 'apply')
      try {
        this.deps.apply(m)
        return
      } catch (e) {
        console.error('A library patch did not fit; asking for the whole library', e)
      }
    void this.#fetch()
  }

  async #fetch(): Promise<void> {
    this.#waiting = []
    let whole: LibraryMessage | undefined
    try {
      whole = await this.deps.fetch()
    } catch (e) {
      this.deps.fail(e)
    }
    const waiting = this.#waiting
    this.#waiting = undefined
    // a failed ask leaves the rest to come: a patch that doesn't fit asks again
    if (!whole) return
    try {
      this.deps.apply(whole)
    } catch (e) {
      this.deps.fail(e)
      return
    }
    for (const m of waiting) this.take(m)
  }
}
