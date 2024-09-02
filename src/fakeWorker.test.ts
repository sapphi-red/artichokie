import { FakeWorker } from './fakeWorker'
import { test, expect } from 'vitest'
import type querystring from 'node:querystring'

test('should work', async () => {
  const worker = new FakeWorker(() => {
    return async ({ n }) => {
      return new Promise((r) => {
        setTimeout(
          () => {
            r(n + 1)
          },
          Math.floor(Math.random() * 100)
        )
      })
    }
  })

  const results = await Promise.all([
    worker.run({ n: 1 }),
    worker.run({ n: 2 }),
    worker.run({ n: 3 }),
    worker.run({ n: 4 }),
    worker.run({ n: 5 }),
    worker.run({ n: 6 }),
    worker.run({ n: 7 }),
    worker.run({ n: 8 }),
    worker.run({ n: 9 })
  ])

  worker.stop()
  expect(results).toStrictEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
})

test('require works', async () => {
  const worker = new FakeWorker(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const qs: typeof querystring = require('node:querystring')
    return async () => {
      return qs.stringify({ foo: 'bar' })
    }
  })

  const result = await worker.run()

  worker.stop()
  expect(result).toMatchInlineSnapshot('"foo=bar"')
})

test('parentFunction', async () => {
  const parent = async () => 1
  const worker = new FakeWorker(
    () => async () => {
      return (await parent()) + 1
    },
    {
      parentFunctions: { parent }
    }
  )

  const result = await worker.run()

  worker.stop()
  expect(result).toBe(2)
})

test('missing parentFunction', async () => {
  let missing: () => Promise<number>
  const worker = new FakeWorker(() => async () => {
    return (await missing()) + 1
  })

  await expect(() => worker.run()).rejects.toThrow(
    'missing is not defined. ' +
      'Maybe you forgot to pass the function to parentFunction?'
  )
  worker.stop()
})
