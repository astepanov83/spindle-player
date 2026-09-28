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
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.test.ts'],
          exclude: ['src/renderer/**/*.svelte.test.ts', '**/node_modules/**']
        }
      },
      {
        // Tests that watch $derived and $effect run: modules are built for the
        // page, as in the app, so effects run and flushSync works.
        extends: true,
        resolve: { conditions: ['browser'] },
        test: {
          name: 'renderer-effects',
          include: ['src/renderer/**/*.svelte.test.ts'],
          environment: './src/renderer/client-env.ts'
        }
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
