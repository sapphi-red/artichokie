export type MaybePromise<T> = T | Promise<T>

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const AsyncFunction = async function () {}.constructor as typeof Function

export const codeToDataUrl = (code: string) =>
  `data:application/javascript,${encodeURIComponent(code + '\n//# sourceURL=[worker-eval(artichokie)]')}`

export const viteSsrDynamicImport = '__vite_ssr_dynamic_import__'
