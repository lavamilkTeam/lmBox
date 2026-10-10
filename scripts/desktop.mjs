// Resolve both project roots explicitly so Tauri stays outside the Rust core.
import cli from '@tauri-apps/cli'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
process.env.TAURI_FRONTEND_PATH = root
process.env.TAURI_APP_PATH = fileURLToPath(new URL('../desktop/tauri/', import.meta.url))
process.chdir(root)

try {
  await cli.run(process.argv.slice(2), 'node scripts/desktop.mjs')
} catch (error) {
  cli.logError(error.message)
  process.exitCode = 1
}
