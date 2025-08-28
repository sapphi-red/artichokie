import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        define: {
          __IS_TEST__: true
        },
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts']
        }
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/**/*.test.ts']
        }
      }
    ]
  }
})
