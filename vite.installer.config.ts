import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

export default defineConfig({
  plugins: [vue(), tailwindcss(), {
    name: 'installer-asset-notices',
    generateBundle() {
      for (const name of ['FONT-LICENSE.txt', 'NOTICE.txt']) {
        this.emitFile({
          type: 'asset',
          fileName: `licenses/${name}`,
          source: readFileSync(new URL(`./frontend/ui/installer-welcome/lib/assets/${name}`, import.meta.url), 'utf8'),
        })
      }
      for (const name of ['LICENSE', 'NOTICE']) {
        this.emitFile({ type: 'asset', fileName: `licenses/shadcn-vue-${name}.txt`,
          source: readFileSync(new URL(`./frontend/ui/shadcn/${name}`, import.meta.url), 'utf8') })
      }
    },
  }],
  cacheDir: 'node_modules/.vite-installer',
  server: { host: '127.0.0.1', port: 6523, strictPort: true },
  preview: { host: '127.0.0.1', port: 6523, strictPort: true },
  build: {
    outDir: 'dist-installer',
    rolldownOptions: { input: 'installer.html' },
  },
})
