import type { WinApi } from '../shared/ipc'

declare global {
  interface Window {
    win: WinApi
  }
}
