import { defineConfig } from 'vitest/config'

// Plain TS logic only. Components are checked by running the app.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts']
  }
})
