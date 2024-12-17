import { Worker } from 'artichokie'

const s = (n) => '' + n

const w = new Worker(async () => () => s(), { parentFunctions: { s } })

await w.run()

w.stop()
