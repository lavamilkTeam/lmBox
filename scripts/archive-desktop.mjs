import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
mkdirSync(new URL('../.tools/',import.meta.url),{recursive:true})
// tar preserves executable bits and the Python runtime's relative symlinks.
const binary=process.platform==='win32'?'lmbox-desktop.exe':'lmbox-desktop'
const result=spawnSync('tar',['-czf',`.tools/desktop-${process.platform}.tar.gz`,'-C','desktop/tauri/target/release',binary,'geometry'],{cwd:root,stdio:'inherit'})
if(result.error)console.error(result.error.message)
process.exit(result.status??1)
