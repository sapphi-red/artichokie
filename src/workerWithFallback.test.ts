import { WorkerWithFallback } from './workerWithFallback'
import { test, expect } from 'vitest'

test('should work', async () => {
  const infSymbol = Symbol('inf')
  const isInf = async (n: number | Symbol) => n === infSymbol

  const worker = new WorkerWithFallback(
    () => async (n: number | Symbol) => {
      return await isInf(n) ? Infinity : 0
    },
    {
      parentFunctions: { isInf },
      shouldUseFake(n) {
        return typeof n === 'symbol'
      }
    }
  )

  const results = await Promise.all([
    worker.run(1),
    worker.run(infSymbol)
  ])

  worker.stop()
  expect(results).toStrictEqual([0, Infinity])
})

test('should error', async () => {
  const infSymbol = Symbol('inf')
  const isInf = async (n: number | Symbol) => n === infSymbol

  const worker = new WorkerWithFallback(
    () => async (n: number | Symbol) => {
      return await isInf(n) ? Infinity : 0
    },
    {
      parentFunctions: { isInf },
      shouldUseFake() { return false }
    }
  )

  await expect(() => worker.run(infSymbol)).rejects.toThrow()
  worker.stop()
})