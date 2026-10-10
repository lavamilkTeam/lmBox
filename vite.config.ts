import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { propulsionApi } from './scripts/propulsion-api.ts'
import { previewApi } from './scripts/preview-api.ts'
import { cfdApi } from './scripts/cfd-api.ts'
export default defineConfig({
  plugins: [vue(), tailwindcss(), previewApi(), propulsionApi(), cfdApi(), {
    name: 'ui-license-notices',
    generateBundle() {
      for (const name of ['LICENSE', 'NOTICE']) {
        this.emitFile({ type: 'asset', fileName: `licenses/shadcn-vue-${name}.txt`,
          source: readFileSync(new URL(`./frontend/ui/shadcn/${name}`, import.meta.url), 'utf8') })
      }
    },
  }],
  server: { port: 6522, strictPort: true,
    // Solver/build artifacts must not reload an in-progress engineering session.
    watch: { ignored: ['**/dist*/**', '**/.tools/**', '**/target/**', '**/test-results/**', '**/playwright-report/**', '**/output/**', '**/desktop/tauri/resources/**'] },
  },
})
