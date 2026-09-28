import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// Plain TS logic, plus stores (.svelte.ts) with fakes for the browser parts.
// Components are checked by running the app.
export default defineConfig({
  plugins: [svelte()],
  // the browser build of Svelte, so $state and $derived in stores react as in the app
  resolve: { conditions: ['browser'] },
  test: {
    include: ['src/**/*.test.ts']
  }
})
