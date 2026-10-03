// What the preload gives this plugin's page half (main/plugins/mfp/preload.ts).
import type { MfpApi } from '../../../../shared/plugins/mfp/ipc'

declare global {
  interface Window {
    mfpApi: MfpApi
  }
}
