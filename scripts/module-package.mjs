import { createReadStream } from 'node:fs'
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { cp, mkdir, readFile, readdir, writeFile, stat, access } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const target = `${process.platform}-${process.arch}`
const build = join(root, '.tools/modules')
const output = join(root, 'dist-modules', target)
const ids = ['stencil', 'cfd', 'nozzle', 'injector', 'video', 'agent']
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit', ...options })
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.status}`)
  return result.stdout?.trim()
}
async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
async function exists(path) { try { await access(path); return true } catch { return false } }
await mkdir(build, { recursive: true })
const keyFile = process.env.LMBOX_MODULE_SIGNING_KEY || join(build, 'development-signing-key.pem')
if (!await exists(keyFile)) {
  if (process.env.LMBOX_MODULE_SIGNING_KEY) throw new Error('Configured module signing key does not exist')
  const { privateKey } = generateKeyPairSync('ed25519')
  await writeFile(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  console.log('Created an ignored development signing key; configure LMBOX_MODULE_SIGNING_KEY for releases.')
}
const privateKey = createPrivateKey(await readFile(keyFile))
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Module signing requires an Ed25519 key')
const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex')
const tag = process.env.LMBOX_MODULE_RELEASE_TAG || `modules-v${version}`
let catalogUrl = process.env.LMBOX_MODULE_CATALOG || ''
if (!catalogUrl) {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' })
  const match = result.status === 0 && result.stdout.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (match) catalogUrl = `https://github.com/${match[1]}/${match[2]}/releases/download/${tag}/catalog-${target}.json`
}
await writeFile(join(build, 'config.json'), JSON.stringify({ publicKey, catalogUrl, tag, target }, null, 2) + '\n')
const mode = process.argv[2] || 'build'
if (!['prepare', 'build', 'archive'].includes(mode)) throw new Error('Expected prepare, build, or archive')
if (mode === 'prepare') {
  run('cargo', ['build', '--manifest-path', 'desktop/modules/Cargo.toml', '--release', '--locked'], {
    env: { ...process.env, LMBOX_MODULE_PUBLIC_KEY: publicKey, LMBOX_MODULE_CATALOG: catalogUrl },
  })
  process.exit(0)
}
const nativeBinary = join(root, process.platform === 'darwin'
  ? 'desktop/tauri/target/release/bundle/macos/lmBox.app/Contents/MacOS/lmbox-desktop'
  : `desktop/tauri/target/release/lmbox-desktop${process.platform === 'win32' ? '.exe' : ''}`)
if (mode === 'build') {
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'])
  const shell = join(root, '.tools/module-shell'); await mkdir(shell, { recursive: true })
  await writeFile(join(shell, 'index.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"></head><body>请使用模块安装器安装基础程序。</body></html>')
  if (process.platform === 'darwin') await import('node:fs/promises').then(fs => fs.rm(join(root, 'desktop/tauri/target/release/bundle/macos/lmBox.app'), { recursive: true, force: true }))
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'desktop:build', '--', '--features', 'modular', '--config', 'desktop/tauri/tauri.modules.conf.json',
    ...(process.platform === 'darwin' ? ['--bundles', 'app'] : ['--no-bundle'])])
  await writeFile(join(build, 'native-build.json'), JSON.stringify({ version, target, modular: true, sha256: await digest(nativeBinary) }) + '\n')
}
const nativeBuild = JSON.parse(await readFile(join(build, 'native-build.json'), 'utf8'))
if (nativeBuild.version !== version || nativeBuild.target !== target || nativeBuild.modular !== true || nativeBuild.sha256 !== await digest(nativeBinary)) {
  throw new Error('The native module host changed; run npm run modules:package before archiving')
}
const manifest = JSON.parse(await readFile(join(root, 'dist/.vite/manifest.json'), 'utf8'))
const closures = new Map()
function closure(key, seen = new Set()) {
  if (seen.has(key)) return []
  seen.add(key)
  const entry = manifest[key]
  if (!entry) throw new Error(`Missing Vite manifest entry: ${key}`)
  const imports = [...entry.imports || [], ...entry.dynamicImports || []].filter(id => !ids.some(module => id === `frontend/app/module-entries/${module}.ts`))
  return [entry.file, ...entry.css || [], ...entry.assets || [], ...imports.flatMap(id => closure(id, seen))]
}
closures.set('base', new Set(['index.html', ...closure('index.html')]))
for (const id of ids) closures.set(id, new Set(closure(`frontend/app/module-entries/${id}.ts`)))
const files = new Map([...ids, 'base', 'ui-runtime', 'propulsion-runtime', 'ai-runtime'].map(id => [id, new Set()]))
const dependencies = new Map([...files.keys()].map(id => [id, new Set(id === 'base' ? [] : ['base'])]))
const all = new Set([...closures.values()].flatMap(set => [...set]))
// Worker-only WASM assets are emitted by Vite outside its main chunk graph.
for (const filename of await readdir(join(root, 'dist/assets'))) {
  if (filename.endsWith('.wasm')) { all.add(`assets/${filename}`); closures.get('stencil').add(`assets/${filename}`) }
}
for (const file of all) {
  const owners = [...closures].filter(([, set]) => set.has(file)).map(([id]) => id)
  const owner = owners.includes('base') ? 'base' : owners.length === 1 ? owners[0] : 'ui-runtime'
  files.get(owner).add(file)
  for (const consumer of owners) if (consumer !== owner && owner !== 'base') dependencies.get(consumer).add(owner)
}
dependencies.get('nozzle').add('propulsion-runtime'); dependencies.get('injector').add('propulsion-runtime')
dependencies.get('video').add('ai-runtime'); dependencies.get('agent').add('ai-runtime')
await mkdir(output, { recursive: true })
const stage = await import('node:fs/promises').then(fs => fs.mkdtemp(join(build, 'package-')))
async function copy(from, to) {
  if (!await exists(from)) throw new Error(`Required package input missing: ${from.replace(root, '.')}`)
  await mkdir(dirname(to), { recursive: true })
  await cp(from, to, { recursive: true, verbatimSymlinks: true, filter: name => !/(^|[/\\])(\.git|__pycache__)([/\\]|$)/.test(name) && !name.endsWith('.pyc') })
}
async function libraries(directory) {
  if (process.platform !== 'darwin') {
    // Release staging on Linux/Windows must provide a complete relocatable runtime.
    if (!process.env.LMBOX_PROPULSION_BUNDLE) throw new Error('Set LMBOX_PROPULSION_BUNDLE to a relocatable solver bundle including compiler runtime libraries')
    return
  }
  const licenseRoots = new Set()
  const pending = (await readdir(directory)).filter(name => name.endsWith('.dylib')).map(name => join(directory, name))
  const done = new Set()
  const origins = new Map(pending.map(file => [file, file]))
  while (pending.length) {
    const library = pending.shift(); if (done.has(library)) continue; done.add(library)
    const dependencies = run('otool', ['-L', library], { capture: true }).split('\n').slice(1).map(line => line.trim().split(' (')[0])
    const id = run('otool', ['-D', library], { capture: true }).split('\n')[1]
    run('install_name_tool', ['-id', `@loader_path/${basename(library)}`, library])
    for (const dependency of dependencies) {
      if (dependency === id || dependency.startsWith('/usr/lib/') || dependency.startsWith('/System/') || dependency.startsWith('@loader_path/')) continue
      const resolved = dependency.startsWith('@rpath/') ? join(dirname(origins.get(library)), basename(dependency)) : dependency
      if (!resolved.startsWith('/') || !await exists(resolved)) throw new Error(`Unresolved runtime library: ${dependency}`)
      let parent = dirname(resolved)
      while (parent !== dirname(parent)) {
        if (await exists(join(parent, 'COPYING.RUNTIME'))) { licenseRoots.add(parent); break }
        parent = dirname(parent)
      }
      const local = join(directory, basename(dependency))
      if (!await exists(local)) { await copy(resolved, local); origins.set(local, resolved); pending.push(local) }
      run('install_name_tool', ['-change', dependency, `@loader_path/${basename(dependency)}`, library])
    }
  }
  if (!licenseRoots.size) throw new Error('Missing compiler runtime license notices')
  for (const parent of licenseRoots) for (const name of ['COPYING', 'COPYING.LIB', 'COPYING.RUNTIME']) {
    await copy(join(parent, name), join(dirname(dirname(dirname(directory))), 'licenses/gcc', name))
  }
  for (const library of done) run('codesign', ['--force', '--sign', '-', library])
}
try {
  for (const id of files.keys()) {
    await mkdir(join(stage, id), { recursive: true })
    for (const file of files.get(id)) await copy(join(root, 'dist', file), join(stage, id, 'ui', file))
    await copy(join(root, 'LICENSE'), join(stage, id, 'licenses/LMBOX-LICENSE.txt'))
    await copy(join(root, 'dist/licenses'), join(stage, id, 'licenses/ui'))
  }
  const native = join(stage, 'base/native')
  if (process.platform === 'darwin') await copy(join(root, 'desktop/tauri/target/release/bundle/macos/lmBox.app'), join(native, 'lmBox.app'))
  else await copy(join(root, `desktop/tauri/target/release/lmbox-desktop${process.platform === 'win32' ? '.exe' : ''}`), join(native, `lmbox-desktop${process.platform === 'win32' ? '.exe' : ''}`))
  await copy(join(root, 'desktop/tauri/resources/lmbox-geometry'), join(stage, 'stencil/geometry'))
  await copy(join(root, 'desktop/tauri/resources/lmbox-ai'), join(stage, 'ai-runtime/ai'))
  const solvers = join(stage, 'propulsion-runtime/solvers')
  if (process.env.LMBOX_PROPULSION_BUNDLE) await copy(resolve(process.env.LMBOX_PROPULSION_BUNDLE), solvers)
  else {
    await copy(join(root, '.tools/propulsion/runtime'), join(solvers, 'propulsion/runtime'))
    await copy(join(root, '.tools/cea/runtime'), join(solvers, 'cea/runtime'))
  }
  for (const part of ['propulsion', 'cea']) await libraries(join(solvers, part, 'runtime'))
  // Ship the original CFD controller/adapter, never machine-specific runtime.json.
  await copy(join(root, '.tools/cfd/source'), join(stage, 'cfd/upstream'))
  await copy(join(root, 'engine/src/lmbox_geometry/modules/cfd'), join(stage, 'cfd/engine/src/lmbox_geometry/modules/cfd'))
  await copy(join(root, 'engine/src/lmbox_geometry/cfd_worker.py'), join(stage, 'cfd/engine/src/lmbox_geometry/cfd_worker.py'))
  await copy(join(root, 'engine/src/lmbox_geometry/__init__.py'), join(stage, 'cfd/engine/src/lmbox_geometry/__init__.py'))
  await copy(join(root, 'contracts/schemas'), join(stage, 'cfd/contracts/schemas'))
  const python = process.env.LMBOX_PACKAGE_PYTHON || join(root, 'engine/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const packages = []
  for (const id of files.keys()) {
    const kind = id === 'base' ? 'base' : ids.includes(id) ? 'module' : 'runtime'
    const folder = join(stage, id)
    await writeFile(join(folder, 'package.json'), JSON.stringify({ schemaVersion: 1, id, version, target, kind, dependencies: [...dependencies.get(id)] }) + '\n')
    const file = `lmbox-${id}-${version}-${target}.zip`
    const { unpackedSize } = JSON.parse(run(python, ['scripts/module-archive.py', folder, join(output, file)], { capture: true }))
    const zipPath = join(output, file)
    packages.push({ id, version, kind, file, sha256: await digest(zipPath), size: (await stat(zipPath)).size, unpackedSize,
      dependencies: [...dependencies.get(id)].sort(), uiFiles: [...files.get(id)].sort() })
  }
  const payload = Buffer.from(JSON.stringify({ schemaVersion: 1, appVersion: version, target, packages }))
  await writeFile(join(output, `catalog-${target}.json`), JSON.stringify({ payload: payload.toString('base64'), signature: sign(null, payload, privateKey).toString('hex') }) + '\n')
  await writeFile(join(output, 'public-key.txt'), publicKey + '\n')
  console.log(`Created ${packages.length} ZIPs and a signed catalog in dist-modules/${target}`)
} finally { await import('node:fs/promises').then(fs => fs.rm(stage, { recursive: true, force: true })) }
