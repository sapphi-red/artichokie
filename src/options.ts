export type ParentFunctions = Record<string, (...args: unknown[]) => Promise<unknown>>

export interface Options {
  max?: number
  parentFunctions?: ParentFunctions
}
