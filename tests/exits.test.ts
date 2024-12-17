import { describe, test } from 'vitest'
import { execFile as execFileRaw } from 'node:child_process'
import util from 'node:util'
import path from 'node:path'
import url from 'node:url'
const execFile = util.promisify(execFileRaw)

const _dirname = path.dirname(url.fileURLToPath(import.meta.url))
const fixtures = path.resolve(_dirname, 'fixtures')

describe.concurrent('exits', () => {
  const files = ['basic.js', 'basic-esm.js']
  for (const file of files) {
    test(file, { timeout: 100 }, async () => {
      await execFile(process.execPath, [path.join(fixtures, file)])
    })
  }
})
