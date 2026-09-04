import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { viteSingleFile } from 'vite-plugin-singlefile'
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
})