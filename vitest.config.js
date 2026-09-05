import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'scripts/**/*.test.mjs'],
  },
  define: {
    'import.meta.env.BASE_URL': JSON.stringify('/'),
  },
})
