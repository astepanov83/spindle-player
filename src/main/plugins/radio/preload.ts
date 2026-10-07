// Radio's part of the preload: `window.radioApi`. Runs in the page's
// sandboxed preload, so it may only use ipcRenderer.
import { ipcRenderer } from 'electron'
import {
  RadioChannel,
  type RadioApi,
  type RadioCover,
  type RadioLogo,
  type RadioTitle
} from '../../../shared/plugins/radio/ipc'
import { invoke, send } from '../../../preload/ipc'

export function radioPreload(): RadioApi {
  return {
    stations: () => invoke(RadioChannel.stations),
    save: (station) => invoke(RadioChannel.save, station),
    remove: (id) => invoke(RadioChannel.remove, id),
    restore: (id) => invoke(RadioChannel.restore, id),
    move: (id, to) => invoke(RadioChannel.move, id, to),
    choose: (id, url) => invoke(RadioChannel.choose, id, url),
    history: (id) => invoke(RadioChannel.history, id),
    play: (station) => invoke(RadioChannel.play, station),
    lastAnswer: (id) => invoke(RadioChannel.lastAnswer, id),
    stop: () => send(RadioChannel.stop),
    search: (q) => invoke(RadioChannel.search, q),
    onTitle: (listener) => {
      const handler = (_: Electron.IpcRendererEvent, title: RadioTitle): void => listener(title)
      ipcRenderer.on(RadioChannel.title, handler)
      return () => ipcRenderer.off(RadioChannel.title, handler)
    },
    onLogo: (listener) => {
      const handler = (_: Electron.IpcRendererEvent, logo: RadioLogo): void => listener(logo)
      ipcRenderer.on(RadioChannel.logo, handler)
      return () => ipcRenderer.off(RadioChannel.logo, handler)
    },
    onCover: (listener) => {
      const handler = (_: Electron.IpcRendererEvent, cover: RadioCover): void => listener(cover)
      ipcRenderer.on(RadioChannel.cover, handler)
      return () => ipcRenderer.off(RadioChannel.cover, handler)
    }
  }
}
