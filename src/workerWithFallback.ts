import { Worker } from './realWorker'
import { FakeWorker } from './fakeWorker'
import type { Options } from './options'
import type { MaybePromise } from './utils'

type ExtendedOptions = Options & {
  /**
   * Whether to use a worker or to fallback to the main thread
   *
   * @default `() => false` (never fallback to the main thread)
   */
  shouldUseFake: (...args: unknown[]) => boolean
}

export class WorkerWithFallback<Args extends unknown[], Ret = unknown> {
  /** @internal */
  private _disableReal: boolean
  /** @internal */
  private _realWorker: Worker<Args, Ret>
  /** @internal */
  private _fakeWorker: FakeWorker<Args, Ret>
  /** @internal */
  private _shouldUseFake: (...args: Args) => boolean

  constructor(
    fn: () => MaybePromise<(...args: Args) => MaybePromise<Ret>>,
    options: ExtendedOptions
  ) {
    this._disableReal = options.max !== undefined && options.max <= 0
    this._realWorker = new Worker(fn, options)
    this._fakeWorker = new FakeWorker(fn, options)
    this._shouldUseFake = options.shouldUseFake
  }

  async run(...args: Args): Promise<Ret> {
    const useFake = this._disableReal || this._shouldUseFake(...args)
    return this[useFake ? '_fakeWorker' : '_realWorker'].run(...args)
  }

  stop(): void {
    this._realWorker.stop()
    this._fakeWorker.stop()
  }
}
