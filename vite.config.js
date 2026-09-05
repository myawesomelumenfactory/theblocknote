import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { viteSingleFile } from 'vite-plugin-singlefile'
import wasm from 'vite-plugin-wasm';
import { blockstreamEnterpriseProxy } from './plugins/blockstreamEnterpriseProxy.js'
import { immutablesAppend } from './plugins/immutablesAppend.js'
import { livePresence } from './plugins/livePresence.js'

function serveDataDir() {
  return {
    name: 'serve-data-dir',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith('/data/')) return next()
          const accept = req.headers.accept || ''
          if (accept.includes('javascript') || req.url.includes('?import')) {
            return next()
          }
          const relative = req.url.split('?')[0].replace(/^\/+/, '')
          const file = path.resolve(relative)
          if (!file.startsWith(path.resolve('data')) || !fs.existsSync(file)) {
            return next()
          }
          res.setHeader('Content-Type', 'application/json')
          fs.createReadStream(file).pipe(res)
        })
      }
    },
  }
}

function immutablesModule() {
  const virtualId = 'virtual:immutables'
  const resolvedId = `\0${virtualId}`
  const sourceFile = path.resolve('data/immutables.json')

  return {
    name: 'immutables-module',
    resolveId(id) {
      if (id === virtualId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      const json = fs.existsSync(sourceFile) ? fs.readFileSync(sourceFile, 'utf8') : '[]'
      return `export default ${json}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    define: {
      global: 'globalThis',
    },

    plugins: [
      react(),
      tailwindcss(),
      wasm(),
      immutablesModule(),
      immutablesAppend(),
      livePresence(),
      serveDataDir(),
      blockstreamEnterpriseProxy(env),
      nodePolyfills({
        protocolImports: true,
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
      {
        name: 'strip-crossorigin',
        transformIndexHtml(html) {
          return html.replace(/\s+crossorigin(?:="[^"]*")?/g, '')
        },
      },
      viteSingleFile({ removeViteModuleLoader: true }),
    ],

    build: {
      target: 'esnext',
      assetsInlineLimit: 2_000_000,
      modulePreload: false,
    },
    // Relative URLs so the static build works on IPFS gateways (/ipfs/<cid>/...)
    base: './',
    server: {
      watch: {
        ignored: ['**/data/**', '**/public/data/**'],
      },
    },
  }
})