import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  target: 'node18',
  dts: true,
  format: 'esm',
  define: {
    __IS_TEST__: 'false'
  }
})
