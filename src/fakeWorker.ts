import type { Options, ParentFunctions } from './options'
import { createRequire } from 'node:module'
import { AsyncFunction, viteSsrDynamicImport, type MaybePromise } from './utils'

const importRe = /\bimport\s*\(/
const internalImportName = '__artichokie_local_import__'

export class FakeWorker<Args extends readonly unknown[], Ret = unknown> {
  /** @internal */
  private _fn: Promise<(...args: Args) => Promise<Ret>>

  constructor(
    fn: () => MaybePromise<(...args: Args) => MaybePromise<Ret>>,
    options: Options = {}
  ) {
    const declareRequire = options.type !== 'module'
    const argsAndCode = genFakeWorkerArgsAndCode(
      fn,
      declareRequire,
      options.parentFunctions ?? {}
    )
    const localImport = (specifier: string) => import(specifier)
    const args = [
      ...(declareRequire ? [createRequire(import.meta.url)] : []),
      localImport,
      options.parentFunctions
    ]
    this._fn = new AsyncFunction(...argsAndCode)(...args)
  }

  async run(...args: Args): Promise<Ret> {
    try {
      return await (
        await this._fn
      )(...args)
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  fn: () => MaybePromise<Function>,
  declareRequire: boolean,
  parentFunctions: ParentFunctions
) {
  const fnString = fn
    .toString()
    // replace `import` with `__artichokie_local_import__`
    // to make the resolve base directory consistent with `require`
    .replace(importRe, `${internalImportName}(`)
    // also replace `__vite_ssr_dynamic_import__` for vitest compatibility
    .replaceAll(viteSsrDynamicImport, internalImportName)

  return [
    ...(declareRequire ? ['require'] : []),
    internalImportName,
    'parentFunctions',
    `
${Object.keys(parentFunctions)
  .map((key) => `const ${key} = parentFunctions[${JSON.stringify(key)}];`)
  .join('\n')}
return await (${fnString})()
  `
  ]
}
