import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const python = join(root, '.tools/ai/venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const result = spawnSync(python, ['-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
  '--name', 'lmbox-ai', '--distpath', 'desktop/tauri/resources',
  '--workpath', '.tools/pyinstaller-ai/build', '--specpath', '.tools/pyinstaller-ai',
  '--paths', 'engine/src', '--collect-all', 'langgraph', '--collect-all', 'langchain_core',
  '--add-data', `${join(root, 'contracts/schemas')}${process.platform === 'win32' ? ';' : ':'}contracts/schemas`,
  'engine/src/lmbox_geometry/ai_worker.py'], { cwd: root, stdio: 'inherit', env: { ...process.env, PYINSTALLER_CONFIG_DIR: join(root, '.tools/pyinstaller-ai/cache') } })
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
