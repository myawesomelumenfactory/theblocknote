import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm';

function serveDataDir() {
  return {
    name: 'serve-data-dir',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/data/')) return next()
        const relative = req.url.split('?')[0].replace(/^\/+/, '')
        const file = path.resolve(relative)
        if (!file.startsWith(path.resolve('data')) || !fs.existsSync(file)) {
          return next()
        }
        res.setHeader('Content-Type', 'application/json')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    global: 'globalThis',
  },

  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    serveDataDir(),
    nodePolyfills({
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
      // Whether to polyfill specific globals.
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    })
  ],

  build: {
    target: 'esnext',
  },
})