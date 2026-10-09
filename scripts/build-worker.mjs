import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const python = join(root, 'engine/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
// A directory bundle runs one process, so Rust cancellation can reap the actual worker.
const result = spawnSync(python, ['-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
  '--name', 'lmbox-geometry', '--distpath', 'desktop/tauri/resources',
  '--workpath', '.tools/pyinstaller/build', '--specpath', '.tools/pyinstaller',
  '--paths', 'engine/src', '--collect-all', 'manifold3d', '--collect-all', 'mapbox_earcut',
  '--add-data', `${join(root, 'contracts/schemas')}${process.platform === 'win32' ? ';' : ':'}contracts/schemas`,
  'engine/src/lmbox_geometry/__main__.py'], { cwd: root, stdio: 'inherit' })
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
