import { expect, test, vi } from 'vitest'
import { Worker } from './realWorker'

for (const type of ['module', 'classic'] as const) {
  test(`${type}: a delayed wake-up for the first call must not release the second`, async () => {
    // Make the first response ready before the worker waits, but delay its notify
    // until the same worker has started waiting for the second response.
    vi.stubEnv('ARTICHOKIE_TEST_BEFORE_WAIT_MS', '20')
    vi.stubEnv('ARTICHOKIE_TEST_BEFORE_NOTIFY_MS', '100')

    const lookup = async (file: string) => file
    const worker = new Worker(() => () => Promise.all([lookup('first'), lookup('second')]), {
      max: 1,
      type,
      parentFunctions: { lookup },
    })

    try {
      await expect(worker.run()).resolves.toStrictEqual(['first', 'second'])
    } finally {
      worker.stop()
      vi.unstubAllEnvs()
    }
  })
}
