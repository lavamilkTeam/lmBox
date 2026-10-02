import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { previewApi } from './scripts/preview-api.ts'
export default defineConfig({ plugins: [vue(), previewApi()], server: { port: 1420, strictPort: true } })
