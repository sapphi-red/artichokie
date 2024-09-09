export type ParentFunctions = Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (...args: any[]) => Promise<any>
>

export interface Options {
  /**
   * Max number of workers that can be spawned at the same time
   */
  max?: number
  /**
   * Functions on the main thread that can be called from the worker
   *
   * The key is the function name that can be called from the worker.
   * The value is the function itself.
   *
   * All functions must be async.
   */
  parentFunctions?: ParentFunctions
}
