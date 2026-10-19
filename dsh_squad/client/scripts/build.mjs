// Builds ../adapter/client.js, the browser half of the dsh-squad-adapter package, the
// way ds-bot builds its own (scripts/build-client.mjs there): one classic script that
// registers with DSH's module loader; react and react-dom come from the shell.
//
//   node scripts/build.mjs            writes ../adapter/client.js
//   node scripts/build.mjs --check    exits 1 when it differs from a fresh build
//
// esbuild is the one the dsh-bot submodule's ds-bot installed (npm ci there).
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLIENT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUTPUT = join(CLIENT, '..', 'adapter', 'client.js')
const require = createRequire(join(CLIENT, '..', '..', 'dsh-bot', 'ds-bot', 'package.json'))
const { build } = require('esbuild')

export async function bundle() {
  const result = await build({
    absWorkingDir: CLIENT,
    entryPoints: ['src/index.js'],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    external: ['react', 'react-dom'],
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
  })
  if (result.warnings.length > 0) throw new Error(result.warnings.map(warning => warning.text).join('\n'))
  return [
    '// Generated from dsh_squad/client/src by `npm run build` there. Do not edit by hand.',
    'window.__ModuleLoader__.load({',
    "  id: 'dsh-squad-adapter',",
    '  factory: (require) => {',
    'const module = { exports: {} }',
    result.outputFiles[0].text.trimEnd(),
    "return Object.defineProperty({ ...module.exports }, Symbol.toStringTag, { value: 'Module' })",
    '  },',
    '})',
    '',
  ].join('\n')
}

const next = await bundle()
if (process.argv.includes('--check')) {
  let current = null
  try { current = readFileSync(OUTPUT, 'utf8') } catch { /* missing counts as stale */ }
  if (current !== next) {
    console.error('adapter/client.js is stale: run `npm run build` in dsh_squad/client and commit it')
    process.exit(1)
  }
} else {
  writeFileSync(OUTPUT, next)
  console.log(`wrote ${OUTPUT} (${next.length} bytes)`)
}
