# artichokie

[![npm version](https://badge.fury.io/js/artichokie.svg)](https://badge.fury.io/js/artichokie) ![CI](https://github.com/sapphi-red/artichokie/workflows/CI/badge.svg) [![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)

> Okie dokie artichokie

Mutual callable worker thread pool with fallback. Based on [okie](https://github.com/yyx990803/okie).

## Features

- worker pool
- calling functions in the main thread from the worker
- falling back to run the code in the main thread

## Examples

```js
const parent = async () => 1
const syncParent = () => 2
const worker = new Worker(
  () => async () => {
    return (await parent()) + syncParent() + 1
  },
  {
    parentFunctions: { parent, syncParent }
  }
)

const result = await worker.run()
console.log(result) // 4

worker.stop()
```

```js
const infSymbol = Symbol('inf')
const isInf = async (n: number | symbol) => n === infSymbol

const worker = new WorkerWithFallback(
  () => async (n: number | symbol) => {
    return await isInf(n) ? Infinity : 0
  },
  {
    parentFunctions: { isInf },
    shouldUseFake(n) {
      // symbol cannot be passed to a worker
      // fallback to run the code in main thread in that case
      return typeof n === 'symbol'
    }
  }
)

const results = await Promise.all([
  worker.run(1),
  worker.run(infSymbol)
])

console.log(results) // [0, Infinity]

worker.stop()
```
