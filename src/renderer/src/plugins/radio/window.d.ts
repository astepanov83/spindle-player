// What the preload gives this plugin's page half (main/plugins/radio/preload.ts).
import type { RadioApi } from '../../../../shared/plugins/radio/ipc'

declare global {
  interface Window {
    radioApi: RadioApi
  }
}
