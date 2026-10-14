import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(new URL('./release-assets.mjs', import.meta.url))
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version
const sourceSha = 'a'.repeat(40)
const run = (...args) => spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8', env: { ...process.env, GITHUB_SHA: sourceSha },
})
const pass = result => assert.equal(result.status, 0, result.stderr)
const fail = (result, message) => {
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, message)
}
const fixture = t => {
  const path = mkdtempSync(join(tmpdir(), 'lmbox-release-test-'))
  t.after(() => rmSync(path, { recursive: true, force: true }))
  return path
}
const collectAll = path => {
  for (const [platform, extensions] of Object.entries({
    'windows-x64': ['exe'], 'macos-arm64': ['dmg'], 'linux-x64': ['deb', 'AppImage'],
  })) {
    const source = join(path, 'bundles', platform)
    mkdirSync(source, { recursive: true })
    for (const extension of extensions) writeFileSync(join(source, `installer.${extension}`), `${platform}:${extension}`)
    pass(run('collect', platform, source, join(path, 'download', platform)))
  }
}

test('standard and padded demo tags identify the same application version', () => {
  pass(run('validate-tag', `v${version}`))
  const [major, minor, patch] = version.split('.')
  pass(run('validate-tag', `demov${major}.${minor.padStart(2, '0')}.${patch}`))
  for (const tag of ['v99.99.99', 'v01.2.3', 'demov0.001.1', 'demov99.99.99', `v${version}-rc.1`, 'main', 'v1.2.3;echo bad']) {
    fail(run('validate-tag', tag), /Release tags|Tag must match/)
  }
})

test('three platform bundles produce four installers, source manifest and correct checksums', t => {
  const path = fixture(t)
  collectAll(path)
  const output = join(path, 'publish')
  pass(run('assemble', join(path, 'download'), output))
  assert.equal(readdirSync(output).length, 6)
  const lines = readFileSync(join(output, 'SHA256SUMS'), 'utf8').trim().split('\n')
  assert.equal(lines.length, 4)
  for (const line of lines) {
    const [hash, name] = line.split('  ')
    assert.equal(hash, createHash('sha256').update(readFileSync(join(output, name))).digest('hex'))
  }
  assert(JSON.parse(readFileSync(join(output, 'release-manifest.json'))).every(item => item.sourceSha === sourceSha))
})

test('missing, empty and ambiguous installers fail before collection', t => {
  const path = fixture(t)
  const output = join(path, 'out')
  fail(run('collect', 'windows-x64', path, output), /Expected exactly one/)
  writeFileSync(join(path, 'first.exe'), '')
  fail(run('collect', 'windows-x64', path, output), /must not be empty/)
  writeFileSync(join(path, 'first.exe'), 'installer')
  writeFileSync(join(path, 'second.exe'), 'installer')
  fail(run('collect', 'windows-x64', path, output), /Expected exactly one/)
})

for (const [name, mutate, error] of [
  ['missing platform', (path) => rmSync(join(path, 'linux-x64'), { recursive: true }), /Missing or duplicate linux/],
  ['changed installer', (path) => writeFileSync(join(path, 'macos-arm64', `lmBox-${version}-macos-arm64.dmg`), 'changed'), /checksum mismatch/],
  ['wrong commit', (path) => {
    const file = join(path, 'windows-x64', 'windows-x64.json')
    const data = JSON.parse(readFileSync(file))
    data.sourceSha = 'b'.repeat(40)
    writeFileSync(file, JSON.stringify(data))
  }, /commit mismatch/],
  ['extra artifact', (path) => writeFileSync(join(path, 'unexpected.exe'), 'extra'), /Unexpected release artifact/],
]) {
  test(`reject ${name} before preparing a release`, t => {
    const path = fixture(t)
    collectAll(path)
    mutate(join(path, 'download'))
    fail(run('assemble', join(path, 'download'), join(path, 'publish')), error)
  })
}

const moduleTargets = ['win32-x64', 'darwin-arm64', 'linux-x64']
const moduleIds = ['stencil', 'cfd', 'nozzle', 'video', 'agent']
const runtimeIds = ['ui-runtime', 'propulsion-runtime', 'ai-runtime']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function modulesFixture(path, publicKey) {
  const platforms = ['windows-x64', 'macos-arm64', 'linux-x64']
  for (const [index, target] of moduleTargets.entries()) {
    const folder = join(path, 'module-input', target)
    mkdirSync(folder, { recursive: true })
    const packages = ['base', ...moduleIds, ...runtimeIds].map(id => {
      const file = `lmbox-${id}-${version}-${target}.zip`
      const bytes = Buffer.from(`archive fixture ${id} ${target}`)
      writeFileSync(join(folder, file), bytes)
      return { id, kind: id === 'base' ? 'base' : moduleIds.includes(id) ? 'module' : 'runtime', version, file, sha256: hash(bytes), size: bytes.length, unpackedSize: bytes.length, dependencies: id === 'base' ? [] : ['base'], uiFiles: [`assets/${id}.js`] }
    })
    const payload = JSON.stringify({ schemaVersion: 1, appVersion: version, target, packages })
    writeFileSync(join(folder, `catalog-${target}.payload.json`), payload)
    const installer = { name: `lmBox-${version}-${target}-module-installer.zip`, sha256: hash('native installer fixture') }
    writeFileSync(join(folder, installer.name), 'native installer fixture')
    writeFileSync(join(folder, `modules-${target}.json`), JSON.stringify({ version, sourceSha, target, publicKey, catalogSha256: hash(payload), installer }))
    pass(run('collect-modules', platforms[index], folder, join(path, 'module-download', target)))
  }
}

test('complete module release signs each platform catalog with the installer trust key', async t => {
  const { createPublicKey, generateKeyPairSync, verify } = await import('node:crypto')
  const path = fixture(t)
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const key = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex')
  const privateFile = join(path, 'key.pem')
  writeFileSync(privateFile, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  collectAll(path)
  modulesFixture(path, key)
  const output = join(path, 'publish')
  pass(run('assemble', join(path, 'download'), output))
  const result = spawnSync(process.execPath, [script, 'assemble-modules', join(path, 'module-download'), output], { encoding: 'utf8', env: { ...process.env, GITHUB_SHA: sourceSha, LMBOX_MODULE_SIGNING_KEY: privateFile, LMBOX_MODULE_PUBLIC_KEY: key } })
  pass(result)
  assert.equal(readdirSync(output).length, 39)
  for (const target of moduleTargets) {
    const signed = JSON.parse(readFileSync(join(output, `catalog-${target}.json`)))
    assert(verify(null, Buffer.from(signed.payload, 'base64'), createPublicKey(privateKey), Buffer.from(signed.signature, 'hex')))
    const catalog = JSON.parse(Buffer.from(signed.payload, 'base64'))
    assert.deepEqual(catalog.packages.filter(item => item.kind === 'module').map(item => item.id), moduleIds)
    assert(!catalog.packages.some(item => item.id === 'injector'))
  }
  assert.equal(readFileSync(join(output, 'SHA256SUMS'), 'utf8').trim().split('\n').length, 37)
})

for (const [name, mutate, error] of [
  ['missing optional ZIP', (folder) => rmSync(join(folder, `lmbox-cfd-${version}-linux-x64.zip`)), /Missing or duplicate module artifact/],
  ['modified ZIP', (folder) => writeFileSync(join(folder, `lmbox-video-${version}-linux-x64.zip`), 'modified'), /Module ZIP size mismatch|Module ZIP checksum mismatch/],
  ['missing native installer', (folder) => rmSync(join(folder, `lmBox-${version}-linux-x64-module-installer.zip`)), /Missing or duplicate module artifact/],
  ['extra unpublished module', (folder) => writeFileSync(join(folder, 'injector.zip'), 'unavailable'), /Unexpected module release artifact/],
  ['modified payload', (folder) => writeFileSync(join(folder, 'catalog-linux-x64.payload.json'), '{}'), /Module catalog checksum mismatch/],
]) {
  test(`module collection rejects ${name}`, t => {
    const path = fixture(t)
    modulesFixture(path, 'ab'.repeat(32))
    const source = join(path, 'module-input', 'linux-x64')
    mutate(source)
    fail(run('collect-modules', 'linux-x64', source, join(path, 'recollect')), error)
  })
}

test('UI partition keeps each optional entry and its private assets out of base/shared packages', t => {
  const path = fixture(t)
  mkdirSync(join(path, 'assets'))
  writeFileSync(join(path, 'assets/parser.wasm'), 'wasm fixture')
  const entries = Object.fromEntries([...moduleIds, 'injector'].map(id => [`frontend/app/module-entries/${id}.ts`, { file: `assets/${id}.js`, imports: ['_vue.js', ...(id === 'agent' || id === 'video' ? ['_shared-ai.js'] : [])], css: [`assets/${id}.css`] }]))
  const manifest = { 'index.html': { file: 'assets/main.js', imports: ['_vue.js'], dynamicImports: Object.keys(entries) }, '_vue.js': { file: 'assets/vue.js' }, '_shared-ai.js': { file: 'assets/shared-ai.js' }, ...entries }
  const file = join(path, 'manifest.json')
  writeFileSync(file, JSON.stringify(manifest))
  const packageScript = fileURLToPath(new URL('./module-package.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [packageScript, 'plan-ui', file, path], { encoding: 'utf8' })
  pass(result)
  const packages = JSON.parse(result.stdout)
  for (const id of moduleIds) {
    assert(packages.find(item => item.id === id).uiFiles.includes(`assets/${id}.js`))
    assert(!packages.find(item => item.id === 'base').uiFiles.includes(`assets/${id}.js`))
    assert(!packages.find(item => item.id === 'ui-runtime').uiFiles.includes(`assets/${id}.js`))
  }
  assert(!packages.some(item => item.uiFiles.includes('assets/injector.js')))
  assert(packages.find(item => item.id === 'stencil').uiFiles.includes('assets/parser.wasm'))
  assert.deepEqual(packages.find(item => item.id === 'ui-runtime').uiFiles, ['assets/shared-ai.js'])
})

test('release signing rejects a key different from the installer trust anchor', async t => {
  const { generateKeyPairSync } = await import('node:crypto')
  const path = fixture(t)
  const { privateKey } = generateKeyPairSync('ed25519')
  const privateFile = join(path, 'key.pem')
  writeFileSync(privateFile, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  const result = spawnSync(process.execPath, [script, 'assemble-modules', join(path, 'missing'), join(path, 'out')], {
    encoding: 'utf8', env: { ...process.env, GITHUB_SHA: sourceSha, LMBOX_MODULE_SIGNING_KEY: privateFile, LMBOX_MODULE_PUBLIC_KEY: 'cd'.repeat(32) },
  })
  fail(result, /does not match the pinned installer trust key/)
})

test('archive adapter preserves executable modes and internal links, rejecting escaping links', async t => {
  const { chmodSync, symlinkSync } = await import('node:fs')
  const path = fixture(t)
  const source = join(path, 'payload')
  mkdirSync(source)
  writeFileSync(join(source, 'worker'), 'executable fixture')
  chmodSync(join(source, 'worker'), 0o755)
  symlinkSync('worker', join(source, 'worker-link'))
  const python = process.platform === 'win32' ? 'python' : 'python3'
  const adapter = fileURLToPath(new URL('./module-archive.py', import.meta.url))
  const archive = join(path, 'module.zip')
  pass(spawnSync(python, [adapter, source, archive], { encoding: 'utf8' }))
  const checked = spawnSync(python, ['-c', 'import stat,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.getinfo("worker").external_attr >> 16 & 0o777 == 0o755; assert stat.S_ISLNK(z.getinfo("worker-link").external_attr >> 16); assert z.read("worker-link") == b"worker"', archive], { encoding: 'utf8' })
  pass(checked)
  writeFileSync(join(path, 'outside'), 'external file')
  symlinkSync('../outside', join(source, 'escape'))
  fail(spawnSync(python, [adapter, source, archive], { encoding: 'utf8' }), /Unsafe package link/)
})
