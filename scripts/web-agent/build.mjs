import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, cpSync, renameSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const output = join(root, 'dist-web-agent')
const mode = process.argv[2] || 'build'
if (!['build', 'package'].includes(mode)) throw new Error('Expected build or package')
const version = JSON.parse(readFileSync(join(root, 'package.json'))).version
if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Invalid version')
const run = (command, args) => { const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } }); if (result.error || result.status !== 0) throw new Error(`Build failed: ${command}`) }
rmSync(output, { recursive: true, force: true }); mkdirSync(output, { recursive: true })
run(process.execPath, ['scripts/build-agent.mjs'])
run(process.execPath, ['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit'])
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.web-agent.config.ts'])
renameSync(join(output, 'site/agent-web.html'), join(output, 'site/index.html'))
run('cargo', ['build', '--manifest-path', 'src-rust/Cargo.toml', '--release', '--locked', '--bin', 'ai'])
mkdirSync(join(output, 'bin')); cpSync(join(root, `src-rust/target/release/ai${process.platform === 'win32' ? '.exe' : ''}`), join(output, `bin/ai${process.platform === 'win32' ? '.exe' : ''}`))
for (const path of ['agent/dist', 'agent/third-party']) cpSync(join(root, path), join(output, path), { recursive: true })
mkdirSync(join(output, 'server'))
for (const path of ['server.mjs', 'runtime.mjs']) cpSync(join(root, 'scripts/web-agent', path), join(output, 'server', path))
cpSync(join(root, 'scripts/web-agent/lib'), join(output, 'server/lib'), { recursive: true })
cpSync(join(root, 'LICENSE'), join(output, 'LICENSE'))
cpSync(join(root, 'scripts/web-agent/runtime.env.example'), join(output, 'runtime.env.example'))
writeFileSync(join(output, 'package.json'), JSON.stringify({ private: true, type: 'module', engines: { node: '>=24' }, scripts: { start: 'node server/server.mjs' } }, null, 2) + '\n')
writeFileSync(join(output, 'build.json'), JSON.stringify({ version, platform: process.platform, arch: process.arch, modules: ['agent'] }, null, 2) + '\n')
// Fail if a supposedly Agent-only build starts including engineering modules.
const manifest = JSON.parse(readFileSync(join(output, 'site/.vite/manifest.json')))
if (Object.values(manifest).some(entry => /stencil|propulsion|digital-logic|\/cfd|\/video|\.wasm/.test(entry.src || entry.file))) throw new Error('Unexpected module in Agent web package')
if (mode === 'package') {
  const archive = join(output, `lmbox-agent-web-${version}-${process.platform}-${process.arch}.tar.gz`)
  run('tar', ['-czf', archive, '-C', output, 'site', 'bin', 'server', 'agent', 'package.json', 'build.json', 'runtime.env.example', 'LICENSE'])
  console.log(archive)
}
