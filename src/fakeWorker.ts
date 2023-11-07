import type { Options } from './options'
import { createRequire } from 'node:module'

export class FakeWorker<Args extends any[], Ret = any> {
  /** @internal */
  private _fn: (...args: Args) => Promise<Ret>

  constructor(
    fn: () => (...args: Args) => Promise<Ret> | Ret,
    options: Options = {}
  ) {
    const argsAndCode = genFakeWorkerArgsAndCode(
      fn,
      options.parentFunctions ?? {}
    )
    const require = createRequire(import.meta.url)
    this._fn = new Function(...argsAndCode)(require, options.parentFunctions)
  }

  async run(...args: Args): Promise<Ret> {
    try {
      return await this._fn(...args)
    } catch (err) {
      if (err instanceof ReferenceError) {
        err.message +=
          '. Maybe you forgot to pass the function to parentFunction?'
      }
      throw err
    }
  }

  stop(): void {
    /* no-op */
  }
}

function genFakeWorkerArgsAndCode(
  fn: Function,
  parentFunctions: Record<string, unknown>
) {
  return [
    'require',
    'parentFunctions',
    `
${Object.keys(parentFunctions)
  .map((key) => `const ${key} = parentFunctions[${JSON.stringify(key)}];`)
  .join('\n')}
return (${fn.toString()})()
  `
  ]
}
