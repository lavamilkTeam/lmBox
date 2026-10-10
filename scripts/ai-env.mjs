import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const venv = join(root, '.tools/ai/venv')
const python = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
if (process.argv[2] === 'setup') {
  const preferred = process.env.LMBOX_AI_BUILD_PYTHON || process.env.LMBOX_BUILD_PYTHON
  const candidates = preferred ? [preferred] : ['python3.12', 'python3.11', 'python3.13', 'python3', 'python']
  const executable = candidates.find(candidate => spawnSync(candidate, ['-c', 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] < (3, 14) else 1)'], { stdio: 'ignore' }).status === 0)
  if (!executable) throw new Error('AI 运行环境需要 Python 3.10–3.13；可通过 LMBOX_AI_BUILD_PYTHON 指定解释器。')
  if (!existsSync(python)) run(executable, ['-m', 'venv', venv])
  run(python, ['-m', 'pip', 'install', '-e', 'engine[ai,dev,bundle]'])
} else if (process.argv[2] === 'check') {
  if (!existsSync(python)) throw new Error('请先运行 npm run setup:ai。')
  run(python, ['-m', 'pytest', 'tests/test_ai.py'], join(root, 'engine'))
} else throw new Error('Expected setup or check')
