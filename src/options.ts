export interface Options {
  max?: number
  parentFunctions?: Record<string, (...args: any[]) => Promise<any>>
}
