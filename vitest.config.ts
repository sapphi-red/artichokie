import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    workspace: [
      {
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
