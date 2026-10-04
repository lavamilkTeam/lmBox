import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
const python=join(root,'engine/.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python')
function run(command,args,cwd=root) {
  const result=spawnSync(command,args,{cwd,stdio:'inherit'})
  if(result.error)console.error(result.error.message)
  if(result.status!==0)process.exit(result.status??1)
}
if(process.argv[2]==='setup') {
  run(process.env.LMBOX_BUILD_PYTHON || (process.platform==='win32'?'python':'python3'),['-m','venv','engine/.venv'])
  run(python,['-m','pip','install','-e','engine[dev,bundle]'])
} else if(process.argv[2]==='check') {
  for(const args of [['-m','ruff','check','src','tests'],['-m','pytest']])run(python,args,join(root,'engine'))
  run(join(root,'engine/.venv',process.platform==='win32'?'Scripts/lint-imports.exe':'bin/lint-imports'),[],join(root,'engine'))
} else throw new Error('Expected setup or check')
