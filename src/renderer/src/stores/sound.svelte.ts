// Volume and mute. Every volume change goes through here, so a change
// unmutes and the Mute button knows what to bring back from 0%.
import { defaultSettings } from '../../../shared/settings'
import { minRestore, muteToggle, wheelStep } from '../audio/volume'
import { volumeStep } from '../keys'
import { settings } from './settings.svelte'

export const sound = $state({ muted: false })

// the last volume the user left it at, for the Mute button at 0%; null until
// the first change, when the start volume counts
let restore: number | null = null
let wheelRest = 0

function keep(v: number): void {
  if (v >= minRestore) restore = v
}

// `settled` is false while the slider is dragged, so passing 3% on the way
// to 0% is not kept.
export function setVolume(v: number, settled = true): void {
  if (restore === null) keep(settings.volume)
  settings.volume = Math.round(Math.min(100, Math.max(0, v)))
  sound.muted = false
  if (settled) keep(settings.volume)
}

export function stepVolume(dir: 1 | -1): void {
  setVolume(volumeStep(settings.volume, dir))
}

export function toggleMute(): void {
  if (restore === null) keep(settings.volume)
  const s = muteToggle(
    { volume: settings.volume, muted: sound.muted },
    restore ?? defaultSettings().volume
  )
  settings.volume = s.volume
  sound.muted = s.muted
}

// The mouse wheel over the volume: 5% a notch.
export function wheelVolume(e: WheelEvent): void {
  e.preventDefault()
  const w = wheelStep(wheelRest, e)
  wheelRest = w.rest
  if (w.step) stepVolume(w.step)
}
