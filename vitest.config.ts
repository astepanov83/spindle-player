import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// Plain TS logic, plus stores (.svelte.ts) with fakes for the browser parts.
// Components are checked by running the app.
export default defineConfig({
  plugins: [svelte()],
  test: {
    projects: [
      {
        extends: true,
        // the browser build of Svelte, so $state and $derived in stores react as in the app
        resolve: { conditions: ['browser'] },
        test: { name: 'renderer', include: ['src/renderer/**/*.test.ts'] }
      },
      {
        // main, preload and shared code run in Node (shared also in the page, but it has no DOM)
        extends: true,
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/renderer/**', '**/node_modules/**']
        }
      }
    ]
  }
})
