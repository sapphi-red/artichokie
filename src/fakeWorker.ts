import type { Options } from "./options"
import { createRequire } from 'node:module'

export class FakeWorker<Args extends any[], Ret = any> {
  private fn: (...args: Args) => Promise<Ret>

  constructor(
    fn: () => (...args: Args) => Promise<Ret> | Ret,
    options: Options = {}
  ) {
    const argsAndCode = genFakeWorkerArgsAndCode(
      fn,
      options.parentFunctions ?? {}
    )
    const require = createRequire(import.meta.url)
    this.fn = new Function(...argsAndCode)(require, options.parentFunctions)
  }

  async run(...args: Args): Promise<Ret> {
    return this.fn(...args)
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
