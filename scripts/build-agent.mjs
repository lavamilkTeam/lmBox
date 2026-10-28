import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const mode = process.argv[2] ?? 'build'
if (!['build', 'bundle'].includes(mode) || process.argv.length > 3) throw new Error('Expected build or bundle')
rmSync(join(root, 'agent/dist'), { recursive: true, force: true })
const result = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'agent/tsconfig.json')], { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

if (mode === 'bundle') {
  // Bundle the build host's Node distribution; cross-platform runtime copying is unsupported.
  const distribution = process.env.LMBOX_AGENT_NODE_DIST ? resolve(process.env.LMBOX_AGENT_NODE_DIST) : (process.platform === 'win32' ? dirname(process.execPath) : dirname(dirname(process.execPath)))
  const executable = join(distribution, process.platform === 'win32' ? 'node.exe' : 'bin/node')
  const license = ['LICENSE', 'LICENSE.txt'].map(name => join(distribution, name)).find(existsSync)
  if (!license || !existsSync(executable)) throw new Error('Use an official Node distribution with its LICENSE; set LMBOX_AGENT_NODE_DIST if needed.')
  const version = spawnSync(executable, ['-p', 'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})'], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } })
  if (version.status !== 0) throw new Error('Bundled Node could not start')
  const info = JSON.parse(version.stdout)
  if (info.platform !== process.platform || info.arch !== process.arch || Number(info.version.slice(1).split('.')[0]) < 24) throw new Error('Agent packaging requires matching Node 24 or newer')
  const output = join(root, 'desktop/tauri/resources/lmbox-ai/agent')
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  const node = join(output, process.platform === 'win32' ? 'node.exe' : 'node')
  cpSync(executable, node)
  if (process.platform !== 'win32') chmodSync(node, 0o755)
  cpSync(join(root, 'agent/dist'), join(output, 'dist'), { recursive: true })
  cpSync(join(root, 'agent/third-party'), join(output, 'third-party'), { recursive: true })
  cpSync(license, join(output, 'NODE-LICENSE.txt'))
  cpSync(join(root, 'LICENSE'), join(output, 'LMBOX-LICENSE.txt'))
  writeFileSync(join(output, 'package.json'), JSON.stringify({ private: true, type: 'module' }) + '\n')
  writeFileSync(join(output, 'runtime.json'), JSON.stringify({ ...info, engine: 'conecode', sourceVersion: '2.4.8' }) + '\n')
  // Do not copy node_modules, Electron, credentials or the upstream build directory.
  console.log(`Agent runtime bundled (${info.platform}-${info.arch}, ${info.version}).`)
}
