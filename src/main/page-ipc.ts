// Handlers for the page's messages. Each one only answers the app window's own
// page: the hidden cover window decodes untrusted pictures, so it is the likeliest
// page to be taken over, and it must not reach playlists, folders or settings.
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { InvokeChannel, PageChannels, SendChannel } from '../shared/ipc'

// What the page sends can't be trusted, so every argument arrives as unknown.
type Unknowns<T extends unknown[]> = { [I in keyof T]: unknown }
type Args<K extends keyof PageChannels> = Unknowns<Parameters<PageChannels[K]>>
type Reply<K extends keyof PageChannels> = Awaited<ReturnType<PageChannels[K]>>

interface Frame {
  processId: number
  routingId: number
}
interface Sender {
  sender: unknown
  senderFrame: Frame | null
}
interface Page {
  isDestroyed(): boolean
  mainFrame: Frame
}

// True for a message from the page's main frame, not from a frame inside it or another window.
export function isFromPage(e: Sender, page: Page | undefined): boolean {
  if (!page || page.isDestroyed() || e.sender !== page) return false
  const f = e.senderFrame
  const main = page.mainFrame
  return !!f && f.processId === main.processId && f.routingId === main.routingId
}

export function pageIpc(page: () => WebContents | undefined): {
  handle<K extends InvokeChannel>(
    channel: K,
    fn: (e: IpcMainInvokeEvent, ...args: Args<K>) => Reply<K> | Promise<Reply<K>>
  ): void
  on<K extends SendChannel>(channel: K, fn: (e: IpcMainEvent, ...args: Args<K>) => void): void
} {
  const refuse = (channel: string): void =>
    console.error(`Refused ${channel}: not from the app window's page`)
  return {
    handle(channel, fn) {
      ipcMain.handle(channel, (e, ...args) => {
        if (!isFromPage(e, page())) {
          refuse(channel)
          throw new Error('Not allowed')
        }
        return fn(e, ...(args as Args<typeof channel>))
      })
    },
    on(channel, fn) {
      ipcMain.on(channel, (e, ...args) => {
        if (!isFromPage(e, page())) return refuse(channel)
        fn(e, ...(args as Args<typeof channel>))
      })
    }
  }
}
