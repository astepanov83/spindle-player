// The AudioWorklet that runs join.ts on the audio thread. Loaded by the
// engine with audioWorklet.addModule; Vite builds it as a file of its own.
import { Joiner, type JoinIn } from './join'

// what the worklet's global scope has; the DOM types don't know it
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void

registerProcessor(
  'spindle-join',
  class extends AudioWorkletProcessor {
    readonly joiner = new Joiner()

    constructor() {
      super()
      this.port.onmessage = (e: MessageEvent<JoinIn>) => this.joiner.message(e.data)
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const done = this.joiner.process(inputs, outputs[0])
      if (done) this.port.postMessage(done)
      return true
    }
  }
)
