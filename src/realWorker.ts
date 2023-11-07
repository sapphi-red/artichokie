import os from 'node:os'
import { Worker as _Worker } from 'node:worker_threads'
import type { Options, ParentFunctions } from './options'

interface NodeWorker<Ret> extends _Worker {
  currentResolve: ((value: Ret | PromiseLike<Ret>) => void) | null
  currentReject: ((err: Error) => void) | null
}

export class Worker<Args extends unknown[], Ret = unknown> {
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
    fn: () => (...args: Args) => Promise<Ret> | Ret,
    options: Options = {}
  ) {
    this._code = genWorkerCode(fn, options.parentFunctions ?? {})
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
      worker.postMessage({ type: 'run', args })
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
  private async _getAvailableWorker(): Promise<NodeWorker<Ret>> {
    // has idle one?
    if (this._idlePool.length) {
      return this._idlePool.shift()!
    }

    // can spawn more?
    if (this._pool.length < this._max) {
      const worker = new _Worker(this._code, { eval: true }) as NodeWorker<Ret>

      worker.on('message', async (args) => {
        if (args.type === 'run') {
          if ('result' in args) {
            worker.currentResolve && worker.currentResolve(args.result)
            worker.currentResolve = null
          } else {
            if (args.error instanceof ReferenceError) {
              args.error.message +=
                '. Maybe you forgot to pass the function to parentFunction?'
            }
            worker.currentReject && worker.currentReject(args.error)
            worker.currentReject = null
          }
          this._assignDoneWorker(worker)
        } else if (args.type === 'parentFunction') {
          try {
            const result = await this._parentFunctions[args.name]!(...args.args)
            worker.postMessage({ type: 'parentFunction', id: args.id, result })
          } catch (e) {
            worker.postMessage({
              type: 'parentFunction',
              id: args.id,
              error: e
            })
          }
        }
      })

      worker.on('error', (err) => {
        worker.currentReject && worker.currentReject(err)
        worker.currentReject = null
      })

      worker.on('exit', (code) => {
        const i = this._pool.indexOf(worker)
        if (i > -1) this._pool.splice(i, 1)
        if (code !== 0 && worker.currentReject) {
          worker.currentReject(
            new Error(`Worker stopped with non-0 exit code ${code}`)
          )
          worker.currentReject = null
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

function genWorkerCode(
  // eslint-disable-next-line @typescript-eslint/ban-types
  fn: () => Function,
  parentFunctions: ParentFunctions
) {
  return `
let id = 0
const parentFunctionResolvers = new Map()
const parentFunctionCall = (key) => async (...args) => {
  id++
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  parentFunctionResolvers.set(id, { resolve, reject })
  parentPort.postMessage({ type: 'parentFunction', id, name: key, args })
  return await promise
}
const doWork = (() => {
  ${Object.keys(parentFunctions)
    .map((key) => `const ${key} = parentFunctionCall(${JSON.stringify(key)});`)
    .join('\n')}
  return (${fn.toString()})()
})()
const { parentPort } = require('worker_threads')
parentPort.on('message', async (args) => {
  if (args.type === 'run') {
    try {
      const res = await doWork(...args.args)
      parentPort.postMessage({ type: 'run', result: res })
    } catch (e) {
      parentPort.postMessage({ type: 'run', error: e })
    }
  } else if (args.type === 'parentFunction') {
    const id = args.id
    if (parentFunctionResolvers.has(id)) {
      const { resolve, reject } = parentFunctionResolvers.get(id)
      parentFunctionResolvers.delete(id)
      if ('result' in args) {
        resolve(args.result)
      } else {
        reject(args.error)
      }
    }
  }
})
  `
}
