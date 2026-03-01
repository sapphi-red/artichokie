export type MaybePromise<T> = T | Promise<T>

export const AsyncFunction = async function () {}.constructor as typeof Function

export const codeToDataUrl = (code: string) =>
  `data:application/javascript,${encodeURIComponent(code + '\n//# sourceURL=[worker-eval(artichokie)]')}`

export const viteSsrDynamicImport = '__vite_ssr_dynamic_import__'
export const stackBlitzImport = '𝐢𝐦𝐩𝐨𝐫𝐭'
