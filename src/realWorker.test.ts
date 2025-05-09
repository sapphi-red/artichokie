import { Worker } from './realWorker'
import { test, expect, describe } from 'vitest'
import querystring from 'node:querystring'

for (const ty of ['module', 'classic'] as const) {
  describe(`type: ${ty}`, () => {
    test('should work', async () => {
      const worker = new Worker(
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

    test('max option', async () => {
      const worker = new Worker(
        () => async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return 1
        },
        { max: 1, type: ty }
      )

      const start = Date.now()
      const results = await Promise.all([worker.run(), worker.run()])
      const elapsed = Date.now() - start

      worker.stop()
      expect(results).toStrictEqual([1, 1])
      expect(elapsed).toBeGreaterThan(75)
    })

    test('require works', async () => {
      const worker = new Worker(
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

    test('parentFunction (async)', async () => {
      const parent = async () => 1
      const worker = new Worker(
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

    test('parentFunction (sync)', async () => {
      const parent = () => 1
      const worker = new Worker(
        () => async () => {
          return parent() + 1
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

    test('calling sync parentFunction while async parentFunction is pending', async () => {
      const syncF = () => 1
      const asyncF = async () => {
        await new Promise((r) => setTimeout(r, 30))
        return 2
      }
      const worker = new Worker(
        () => async () => {
          const promise = asyncF()
          const r1 = syncF()
          const r2 = await promise
          return r1 + r2
        },
        {
          type: ty,
          parentFunctions: { syncF, asyncF }
        }
      )

      const result = await worker.run()

      worker.stop()
      expect(result).toBe(3)
    })

    test('sync error in parentFunction', async () => {
      const parent = () => {
        throw new Error('sync error')
      }
      const worker = new Worker(
        () => async () => {
          parent()
        },
        {
          type: ty,
          parentFunctions: { parent }
        }
      )

      await expect(() => worker.run()).rejects.toThrow('sync error')
      worker.stop()
    })

    test('async error in parentFunction', async () => {
      const parent = async () => {
        throw new Error('async error')
      }
      const worker = new Worker(
        () => async () => {
          await parent()
        },
        {
          type: ty,
          parentFunctions: { parent }
        }
      )

      await expect(() => worker.run()).rejects.toThrow('async error')
      worker.stop()
    })

    test('missing parentFunction', async () => {
      let missing!: () => Promise<number>
      const worker = new Worker(() => async () => {
        return (await missing()) + 1
      })

      await expect(() => worker.run()).rejects.toThrow(
        'missing is not defined. ' +
          'Maybe you forgot to pass the function to parentFunction?'
      )
      worker.stop()
    })

    test('call done for rejected call', { timeout: 300 }, async () => {
      const worker = new Worker(
        () => async () => {
          throw new Error('throw')
        },
        { max: 1, type: ty }
      )

      await expect(() => worker.run()).rejects.toThrow()
      await expect(() => worker.run()).rejects.toThrow()
      worker.stop()
    })
  })
}
