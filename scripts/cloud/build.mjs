import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const output = join(root, 'dist-cloud')
const site = join(output, 'site')
const mode = process.argv[2] ?? 'build'
if (!['build', 'package'].includes(mode) || process.argv.length > 3) {
  throw new Error('Expected build or package')
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`)
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid application version')
const archive = join(output, `lmbox-web-${version}.tar.gz`)
// A failed rebuild must not leave a previous archive looking like a fresh package.
rmSync(archive, { force: true })
if (process.env.npm_execpath) {
  run(process.execPath, [process.env.npm_execpath, 'run', 'build', '--', '--outDir', site])
} else if (process.platform === 'win32') {
  throw new Error('Run cloud builds through npm run cloud:build or npm run cloud:package')
} else {
  run('npm', ['run', 'build', '--', '--outDir', site])
}
mkdirSync(join(site, 'licenses'), { recursive: true })
copyFileSync(join(root, 'LICENSE'), join(site, 'licenses/LMBOX-LICENSE.txt'))

if (mode === 'package') {
  mkdirSync(output, { recursive: true })
  try {
    // Do not ship macOS extended attributes as extra AppleDouble files.
    run('tar', ['-czf', archive, '-C', site, '.'], { ...process.env, COPYFILE_DISABLE: '1' })
  } catch (error) {
    rmSync(archive, { force: true })
    throw error
  }
  console.log(`Cloud web package: ${archive}`)
} else {
  console.log(`Cloud web assets: ${site}`)
}
