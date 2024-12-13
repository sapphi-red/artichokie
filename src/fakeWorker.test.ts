import { FakeWorker } from './fakeWorker'
import { test, expect, describe } from 'vitest'
import querystring from 'node:querystring'

for (const ty of ['module', 'classic'] as const) {
  describe(`type: ${ty}`, () => {
    test('should work', async () => {
      const worker = new FakeWorker(
        () => {
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
        },
        { type: ty }
      )

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
      const worker = new FakeWorker(
        ty === 'classic'
          ? () => {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const qs: typeof querystring = require('node:querystring')
              return async () => {
                return qs.stringify({ foo: 'bar' })
              }
            }
          : async () => {
              const qs: typeof querystring = await import('node:querystring')
              return async () => {
                return qs.stringify({ foo: 'bar' })
              }
            },
        { type: ty }
      )

      const result = await worker.run()

      worker.stop()
      expect(result).toBe(querystring.stringify({ foo: 'bar' }))
    })

    test('parentFunction', async () => {
      const parent = async () => 1
      const worker = new FakeWorker(
        () => async () => {
          return (await parent()) + 1
        },
        {
          type: ty,
          parentFunctions: { parent }
        }
      )

      const result = await worker.run()

      worker.stop()
      expect(result).toBe(2)
    })

    test('missing parentFunction', async () => {
      let missing!: () => Promise<number>
      const worker = new FakeWorker(
        () => async () => {
          return (await missing()) + 1
        },
        { type: ty }
      )

      await expect(() => worker.run()).rejects.toThrow(
        'missing is not defined. ' +
          'Maybe you forgot to pass the function to parentFunction?'
      )
      worker.stop()
    })
  })
}
