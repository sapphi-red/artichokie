export type ParentFunctions = Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (...args: any[]) => Promise<any>
>

export interface Options {
  max?: number
  parentFunctions?: ParentFunctions
}
