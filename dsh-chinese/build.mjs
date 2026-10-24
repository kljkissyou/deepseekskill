/**
 * Host + client build for dsh-chinese.
 *
 * host: plain ESM for Node (package.json#main). @deepseek-ai/dsh-* , cordis
 *   and schemastery stay external (the profile's node_modules provide them).
 * client: a single CJS bundle wrapped in the ModuleLoader factory handshake
 *   for the web server (/plugins/dsh-chinese/client.js); @deepseek-ai/dsh-*
 *   and react stay external (the app's module system provides them).
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })

const dshExternal = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*', '@deepseek-ai/schemastery']
const clientExternal = [...dshExternal, 'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler']

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  jsx: 'automatic',
  external: clientExternal,
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-chinese', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})
