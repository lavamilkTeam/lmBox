import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root=fileURLToPath(new URL('../',import.meta.url))
const suffix=process.platform==='win32'?'.exe':''
const local=`${root}.tools/wasm-bindgen/bin/wasm-bindgen${suffix}`
const bindgen=existsSync(local)?local:`wasm-bindgen${suffix}`
function run(command,args) {
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit'})
  if(result.error || result.status!==0) {
    console.error('WASM build failed. Run npm run setup:wasm once, then retry.')
    process.exit(result.status || 1)
  }
}
run('cargo',['build','--manifest-path','src-tauri/Cargo.toml','--lib','--target','wasm32-unknown-unknown','--release','--locked'])
run(bindgen,['src-tauri/target/wasm32-unknown-unknown/release/lmbox.wasm','--target','web','--out-dir','src/platform/desktop/lib/generated'])
