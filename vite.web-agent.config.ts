import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

export default defineConfig({
  plugins: [vue(), tailwindcss(), {
    name: 'agent-web-licenses',
    generateBundle() {
      for (const [prefix, directory, names] of [
        ['shadcn-vue', 'frontend/ui/shadcn', ['LICENSE', 'NOTICE']],
        ['ai-elements-vue', 'frontend/modules/agent/lib/ui/elements', ['LICENSE', 'UPSTREAM-LICENSE', 'NOTICE']],
      ] as const) for (const name of names) this.emitFile({ type: 'asset', fileName: `licenses/${prefix}-${name}.txt`, source: readFileSync(new URL(`./${directory}/${name}`, import.meta.url), 'utf8') })
    },
  }],
  build: { manifest: true, outDir: 'dist-web-agent/site', rollupOptions: { input: 'agent-web.html' } },
})
