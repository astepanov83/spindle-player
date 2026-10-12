// The sound output picked in Settings (ticket 112). The device list follows
// devicechange. A saved device that is not there (unplugged) plays on the
// default, says so once, stays saved, and is used again when it comes back.
import { engine } from '../audio/engine'
import { notFoundText, outputDevices, type OutputDevice } from '../audio/output'
import { notice } from './notice.svelte'

type Media = Pick<MediaDevices, 'enumerateDevices' | 'addEventListener'>

// Chromium on Linux hears of a PipeWire or Bluetooth output coming or going
// only when the page lists the devices (found in the app check), so the
// list is asked for again this often while it matters. One ask takes a few
// ms of the audio process.
const pollMs = 3000

class OutputStore {
  // the devices there are, without the system default; null until listed
  devices: OutputDevice[] | null = $state.raw(null)
  // the saved device is not there, or failed: playing on the default
  missing = $state(false)
  // the saved device's id
  #want = ''
  // A device that failed while still listed: not tried again until it
  // leaves the list and comes back, or is picked again.
  #failed = ''
  // the notice was shown for this time it went missing
  #said = false
  // a newer list asked for: an older answer is dropped
  #asked = 0
  #media: Media | undefined
  // Settings' choices on screen
  #watchers = 0
  #timer: ReturnType<typeof setInterval> | undefined
  // Settings is open: its choice says so already, no notice
  #quiet = (): boolean => false

  start(quiet: () => boolean, media: Media | undefined = navigator.mediaDevices): void {
    this.#quiet = quiet
    engine.on({ outputFailed: (id) => this.#fail(id) })
    // no device list (not in a secure page): everything plays on the default
    if (!media) return
    this.#media = media
    media.addEventListener('devicechange', () => void this.#list())
    void this.#list()
    this.#poll()
  }

  // Settings shows the choices: the list stays fresh until the returned
  // function is called.
  watch(): () => void {
    this.#watchers++
    void this.#list()
    this.#poll()
    return () => {
      this.#watchers--
      this.#poll()
    }
  }

  // Asks again every few seconds while a device other than the default is
  // saved (to hear it go and come back) or Settings shows the choices.
  #poll(): void {
    const on = !!this.#media && (!!this.#want || this.#watchers > 0)
    if (on && this.#timer === undefined) this.#timer = setInterval(() => void this.#list(), pollMs)
    else if (!on && this.#timer !== undefined) {
      clearInterval(this.#timer)
      this.#timer = undefined
    }
  }

  // The saved setting, at start and on each change.
  use(id: string): void {
    if (id === this.#want) return
    this.#want = id
    this.#failed = ''
    this.#said = false
    this.#apply()
    this.#poll()
  }

  async #list(): Promise<void> {
    if (!this.#media) return
    const n = ++this.#asked
    let all: MediaDeviceInfo[]
    try {
      all = await this.#media.enumerateDevices()
    } catch (e) {
      console.error('Could not list the sound outputs', e)
      return
    }
    if (n !== this.#asked) return
    this.devices = outputDevices(all)
    if (!this.devices.some((d) => d.id === this.#failed)) this.#failed = ''
    this.#apply()
  }

  #fail(id: string): void {
    if (id !== this.#want) return
    this.#failed = id
    this.#apply()
  }

  #apply(): void {
    // Until the list comes (a few ms after start, before any song plays),
    // the saved device is used as it is: if it is gone, the engine says so.
    const id = this.#want
    const there =
      !id || (id !== this.#failed && (!this.devices || this.devices.some((d) => d.id === id)))
    this.missing = !there
    if (there) this.#said = false
    else if (!this.#said) {
      this.#said = true
      if (!this.#quiet()) notice.show(notFoundText)
    }
    engine.setOutput(there ? id : '')
  }
}

export const output = new OutputStore()
