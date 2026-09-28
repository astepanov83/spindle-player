// A Node test environment that builds modules as the page gets them, so
// runes compile for the browser and effects run (see vitest.config.ts).
import type { Environment } from 'vitest/environments'

export default {
  name: 'svelte-client',
  viteEnvironment: 'client',
  setup: () => ({ teardown: () => {} })
} satisfies Environment
