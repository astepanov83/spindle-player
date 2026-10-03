// What the preload gives this plugin's page half (main/plugins/files/preload.ts).
import type { LibraryApi } from '../../../../shared/plugins/files/ipc'

declare global {
  interface Window {
    libraryApi: LibraryApi
  }
}
