import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { propulsionApi } from './scripts/propulsion-api.ts'
import { previewApi } from './scripts/preview-api.ts'
import { cfdApi } from './scripts/cfd-api.ts'
import { aiApi } from './scripts/ai-api.ts'
export default defineConfig({
  plugins: [vue(), tailwindcss(), previewApi(), propulsionApi(), cfdApi(), aiApi(), {
    name: 'ui-license-notices',
    generateBundle() {
      for (const name of ['LICENSE', 'NOTICE']) {
        this.emitFile({ type: 'asset', fileName: `licenses/shadcn-vue-${name}.txt`,
          source: readFileSync(new URL(`./frontend/ui/shadcn/${name}`, import.meta.url), 'utf8') })
      }
      for (const name of ['LICENSE', 'UPSTREAM-LICENSE', 'NOTICE']) {
        this.emitFile({ type: 'asset', fileName: `licenses/ai-elements-vue-${name}.txt`,
          source: readFileSync(new URL(`./frontend/modules/agent/lib/ui/elements/${name}`, import.meta.url), 'utf8') })
      }
      for (const name of ['LICENSE', 'NOTICE']) {
        this.emitFile({ type: 'asset', fileName: `licenses/account-provider-icons-${name}.txt`,
          source: readFileSync(new URL(`./frontend/ui/account-dialog/lib/assets/${name}`, import.meta.url), 'utf8') })
      }
    },
  }],
  build: { manifest: true },
  server: { port: 6522, strictPort: true,
    // Solver/build artifacts must not reload an in-progress engineering session.
    watch: { ignored: ['**/dist*/**', '**/.tools/**', '**/target/**', '**/test-results/**', '**/playwright-report/**', '**/output/**', '**/desktop/tauri/resources/**'] },
  },
})
