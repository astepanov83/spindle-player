// The preload's ways to main, for the core's APIs and the plugins' alike.
import { ipcRenderer } from 'electron'
import type { InvokeChannel, PageChannels, SendChannel } from '../shared/ipc'
import { keepEarly } from './early'

// Typed from PageChannels, like main's handlers, so both sides agree.
export function invoke<K extends InvokeChannel>(
  channel: K,
  ...args: Parameters<PageChannels[K]>
): ReturnType<PageChannels[K]> {
  return ipcRenderer.invoke(channel, ...args) as ReturnType<PageChannels[K]>
}
export function send<K extends SendChannel>(
  channel: K,
  ...args: Parameters<PageChannels[K]>
): void {
  ipcRenderer.send(channel, ...args)
}

// Listens from the start; see keepEarly for what is kept until the page listens.
export function latest<T>(
  channel: string,
  merge?: (early: T, next: T) => T
): (listener: (value: T) => void) => () => void {
  return keepEarly<T>((onValue) => ipcRenderer.on(channel, (_, value: T) => onValue(value)), merge)
}
