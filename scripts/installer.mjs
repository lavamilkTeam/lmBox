import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = join(root, 'desktop', 'installer')
const build = join(root, '.tools', 'installer-qt')
const output = join(root, 'dist-installer-qt')
const mode = process.argv[2] ?? 'build'
if (!['build', 'dev', 'package'].includes(mode)) throw new Error('Expected build, dev, or package')

function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})${capture ? `: ${result.stderr}` : ''}`)
  return result.stdout?.trim()
}

const qtPrefix = process.env.QTDIR || run(process.env.QMAKE || 'qmake', ['-query', 'QT_INSTALL_PREFIX'], true)
const cmake = process.env.CMAKE || 'cmake'
run(cmake, ['-S', source, '-B', build, `-DCMAKE_PREFIX_PATH=${qtPrefix}`, '-DCMAKE_BUILD_TYPE=Release'])
run(cmake, ['--build', build, '--config', 'Release', '--parallel', '4'])

if (mode === 'package') {
  run(cmake, ['--install', build, '--config', 'Release', '--prefix', output])
  console.log(`Installer package: ${output}`)
} else if (mode === 'dev') {
  const executable = process.platform === 'darwin'
    ? join(build, 'lmbox-installer.app', 'Contents', 'MacOS', 'lmbox-installer')
    : process.platform === 'win32'
      ? [join(build, 'Release', 'lmbox-installer.exe'), join(build, 'lmbox-installer.exe')].find(existsSync)
      : join(build, 'lmbox-installer')
  if (!executable) throw new Error('Built installer executable was not found')
  run(executable, process.argv.slice(3))
}
