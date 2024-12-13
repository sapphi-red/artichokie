import os from 'node:os'
import {
  Worker as _Worker,
  type WorkerOptions as _WorkerOptions,
  MessageChannel,
  type MessagePort,
  type receiveMessageOnPort
} from 'node:worker_threads'
import type { Options, ParentFunctions } from './options'
import { codeToDataUrl, viteSsrDynamicImport, type MaybePromise } from './utils'

interface NodeWorker<Ret> extends _Worker {
  currentResolve: ((value: Ret | PromiseLike<Ret>) => void) | null
  currentReject: ((err: Error) => void) | null
}

export class Worker<Args extends unknown[], Ret = unknown> {
  /** @internal */
  private _isModule: boolean
  /** @internal */
  private _code: string
  /** @internal */
  private _parentFunctions: ParentFunctions
  /** @internal */
  private _max: number
  /** @internal */
  private _pool: NodeWorker<Ret>[]
  /** @internal */
  private _idlePool: NodeWorker<Ret>[]
  /** @internal */
  private _queue: [(worker: NodeWorker<Ret>) => void, (err: Error) => void][]

  constructor(
    fn: () => MaybePromise<(...args: Args) => MaybePromise<Ret>>,
    options: Options = {}
  ) {
    this._isModule = options.type === 'module'
    this._code = genWorkerCode(
      fn,
      this._isModule,
      options.parentFunctions ?? {}
    )
    this._parentFunctions = options.parentFunctions ?? {}
    const defaultMax = Math.max(
      1,
      // os.availableParallelism is available from Node.js 18.14.0
      (os.availableParallelism?.() ?? os.cpus().length) - 1
    )
    this._max = options.max || defaultMax
    this._pool = []
    this._idlePool = []
    this._queue = []
  }

  async run(...args: Args): Promise<Ret> {
    const worker = await this._getAvailableWorker()
    return new Promise<Ret>((resolve, reject) => {
      worker.currentResolve = resolve
      worker.currentReject = reject
      worker.postMessage({ args })
    })
  }

  stop(): void {
    this._pool.forEach((w) => w.unref())
    this._queue.forEach(([, reject]) =>
      reject(
        new Error('Main worker pool stopped before a worker was available.')
      )
    )
    this._pool = []
    this._idlePool = []
    this._queue = []
  }

  /** @internal */
  private _createWorker(
    parentFunctionSyncMessagePort: MessagePort,
    parentFunctionAsyncMessagePort: MessagePort,
    lockState: Int32Array<SharedArrayBuffer>
  ): NodeWorker<Ret> {
    const options: _WorkerOptions = {
      workerData: [
        parentFunctionSyncMessagePort,
        parentFunctionAsyncMessagePort,
        lockState
      ],
      transferList: [
        parentFunctionSyncMessagePort,
        parentFunctionAsyncMessagePort
      ]
    }
    if (this._isModule) {
      return new _Worker(
        new URL(codeToDataUrl(this._code)),
        options
      ) as NodeWorker<Ret>
    }
    return new _Worker(this._code, {
      ...options,
      eval: true
    }) as NodeWorker<Ret>
  }

  /** @internal */
  private async _getAvailableWorker(): Promise<NodeWorker<Ret>> {
    // has idle one?
    if (this._idlePool.length) {
      return this._idlePool.shift()!
    }

    // can spawn more?
    if (this._pool.length < this._max) {
      const parentFunctionResponder = createParentFunctionResponder(
        this._parentFunctions
      )
      const worker = this._createWorker(
        parentFunctionResponder.workerPorts.sync,
        parentFunctionResponder.workerPorts.async,
        parentFunctionResponder.lockState
      )

      worker.on('message', async (args) => {
        if ('result' in args) {
          worker.currentResolve?.(args.result)
          worker.currentResolve = null
        } else {
          if (args.error instanceof ReferenceError) {
            args.error.message +=
              '. Maybe you forgot to pass the function to parentFunction?'
          }
          worker.currentReject?.(args.error)
          worker.currentReject = null
        }
        this._assignDoneWorker(worker)
      })

      worker.on('error', (err) => {
        worker.currentReject?.(err)
        worker.currentReject = null
        parentFunctionResponder.close()
      })

      worker.on('exit', (code) => {
        const i = this._pool.indexOf(worker)
        if (i > -1) this._pool.splice(i, 1)
        if (code !== 0 && worker.currentReject) {
          worker.currentReject(
            new Error(`Worker stopped with non-0 exit code ${code}`)
          )
          worker.currentReject = null
          parentFunctionResponder.close()
        }
      })

      this._pool.push(worker)
      return worker
    }

    // no one is available, we have to wait
    let resolve: (worker: NodeWorker<Ret>) => void
    let reject: (err: Error) => unknown
    const onWorkerAvailablePromise = new Promise<NodeWorker<Ret>>((r, rj) => {
      resolve = r
      reject = rj
    })
    this._queue.push([resolve!, reject!])
    return onWorkerAvailablePromise
  }

  /** @internal */
  private _assignDoneWorker(worker: NodeWorker<Ret>) {
    // someone's waiting already?
    if (this._queue.length) {
      const [resolve] = this._queue.shift()!
      resolve(worker)
      return
    }
    // take a rest.
    this._idlePool.push(worker)
  }
}

function createParentFunctionResponder(parentFunctions: ParentFunctions) {
  const lockState = new Int32Array(new SharedArrayBuffer(4))
  const unlock = () => {
    Atomics.store(lockState, 0, 0)
    Atomics.notify(lockState, 0)
  }

  const parentFunctionSyncMessageChannel = new MessageChannel()
  const parentFunctionAsyncMessageChannel = new MessageChannel()
  const parentFunctionSyncMessagePort = parentFunctionSyncMessageChannel.port1
  const parentFunctionAsyncMessagePort = parentFunctionAsyncMessageChannel.port1

  const syncResponse = (data: unknown) => {
    parentFunctionSyncMessagePort.postMessage(data)
    unlock()
  }

  parentFunctionSyncMessagePort.on('message', async (args) => {
    let syncResult: unknown
    try {
      syncResult = parentFunctions[args.name]!(...args.args)
    } catch (error) {
      syncResponse({ id: args.id, error })
      return
    }

    // if the result is not thenable (async)
    if (
      !(
        typeof syncResult === 'object' &&
        syncResult !== null &&
        'then' in syncResult &&
        typeof syncResult.then === 'function'
      )
    ) {
      syncResponse({
        id: args.id,
        result: syncResult
      })
      return
    }

    syncResponse({
      id: args.id,
      isAsync: true
    })

    try {
      const result = await syncResult
      parentFunctionAsyncMessagePort.postMessage({ id: args.id, result })
    } catch (error) {
      parentFunctionAsyncMessagePort.postMessage({ id: args.id, error })
    }
  })

  return {
    close: () => {
      parentFunctionSyncMessagePort.close()
      parentFunctionAsyncMessagePort.close()
    },
    lockState,
    workerPorts: {
      sync: parentFunctionSyncMessageChannel.port2,
      async: parentFunctionAsyncMessageChannel.port2
    }
  }
}

function genWorkerCode(
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  fn: () => MaybePromise<Function>,
  isModule: boolean,
  parentFunctions: ParentFunctions
) {
  const createLock = (lockState: Int32Array<SharedArrayBuffer>) => {
    return {
      lock: () => {
        Atomics.store(lockState, 0, 1)
      },
      waitUnlock: () => {
        const status = Atomics.wait(lockState, 0, 1, 10 * 1000)
        if (status === 'timed-out') {
          throw new Error(status)
        }
      }
    }
  }

  const createParentFunctionRequester = (
    syncPort: MessagePort,
    asyncPort: MessagePort,
    receive: typeof receiveMessageOnPort,
    lock: ReturnType<typeof createLock>
  ) => {
    let id = 0
    const resolvers = new Map()
    const call =
      (key: string) =>
      (...args: unknown[]) => {
        id++

        lock.lock()
        syncPort.postMessage({ id, name: key, args })
        lock.waitUnlock()
        const resArgs = receive(syncPort)!.message

        if (resArgs.isAsync) {
          let resolve, reject
          const promise = new Promise((res, rej) => {
            resolve = res
            reject = rej
          })
          resolvers.set(id, { resolve, reject })
          return promise
        }

        if ('error' in resArgs) {
          throw resArgs.error
        } else {
          return resArgs.result
        }
      }

    asyncPort.on('message', (args) => {
      const id = args.id
      if (resolvers.has(id)) {
        const { resolve, reject } = resolvers.get(id)
        resolvers.delete(id)
        if ('result' in args) {
          resolve(args.result)
        } else {
          reject(args.error)
        }
      }
    })

    return { call }
  }

  const fnString = fn
    .toString()
    // replace `__vite_ssr_dynamic_import__` for vitest compatibility
    .replaceAll(viteSsrDynamicImport, 'import')

  return `
${isModule ? "import { parentPort, receiveMessageOnPort, workerData } from 'worker_threads'" : "const { parentPort, receiveMessageOnPort, workerData } = require('worker_threads')"}
const [parentFunctionSyncMessagePort, parentFunctionAsyncMessagePort, lockState] = workerData
const createLock = ${createLock.toString()}
const parentFunctionRequester = (${createParentFunctionRequester.toString()})(
  parentFunctionSyncMessagePort,
  parentFunctionAsyncMessagePort,
  receiveMessageOnPort,
  createLock(lockState)
)

const doWorkPromise = (async () => {
  ${Object.keys(parentFunctions)
    .map(
      (key) =>
        `const ${key} = parentFunctionRequester.call(${JSON.stringify(key)});`
    )
    .join('\n')}
  return await (${fnString})()
})()
let doWork

parentPort.on('message', async (args) => {
  doWork ||= await doWorkPromise

  try {
    const res = await doWork(...args.args)
    parentPort.postMessage({ result: res })
  } catch (e) {
    parentPort.postMessage({ error: e })
  }
})
  `
}
