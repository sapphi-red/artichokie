import { Worker } from './realWorker'
import { FakeWorker } from './fakeWorker'
import type { Options } from './options'

export class WorkerWithFallback<Args extends unknown[], Ret = unknown> {
  /** @internal */
  private _realWorker: Worker<Args, Ret>
  /** @internal */
  private _fakeWorker: FakeWorker<Args, Ret>
  /** @internal */
  private _shouldUseFake: (...args: Args) => boolean

  constructor(
    fn: () => (...args: Args) => Promise<Ret> | Ret,
    options: Options & { shouldUseFake: (...args: Args) => boolean }
  ) {
    this._realWorker = new Worker(fn, options)
    this._fakeWorker = new FakeWorker(fn, options)
    this._shouldUseFake = options.shouldUseFake
  }

  async run(...args: Args): Promise<Ret> {
    const useFake = this._shouldUseFake(...args)
    return this[useFake ? '_fakeWorker' : '_realWorker'].run(...args)
  }

  stop(): void {
    this._realWorker.stop()
    this._fakeWorker.stop()
  }
}
