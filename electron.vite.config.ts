import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        // the app window, and the hidden window that resizes covers
        input: {
          index: resolve('src/preload/index.ts'),
          covers: resolve('src/preload/covers.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [svelte()]
  }
})
