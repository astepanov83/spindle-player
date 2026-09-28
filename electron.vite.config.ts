import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        // The app window, and the hidden window that resizes covers. Both are
        // sandboxed, so each may only require electron and a few Node modules,
        // not a file of our own. If the two ever import the same module (say one
        // file of src/shared), Rollup puts it in a shared chunk that both
        // require, and the preload fails to load. After such a change, check
        // that out/preload holds only index.js and covers.js.
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
