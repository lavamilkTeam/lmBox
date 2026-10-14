// Release packaging adapter. It consumes Tauri bundles, never application internals.
import assert from 'node:assert/strict'
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const formats = {
  'windows-x64': ['.exe'],
  'macos-arm64': ['.dmg'],
  'linux-x64': ['.deb', '.AppImage'],
}
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const filename = (platform, extension) => `lmBox-${version}-${platform}${extension === '.exe' ? '-setup' : ''}${extension}`
const filesIn = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name)
  return entry.isDirectory() ? filesIn(path) : entry.isFile() ? [path] : []
})
const sourceSha = process.env.GITHUB_SHA
const [command, ...args] = process.argv.slice(2)
const moduleTargets = { 'windows-x64': 'win32-x64', 'macos-arm64': 'darwin-arm64', 'linux-x64': 'linux-x64' }
const moduleIds = ['stencil', 'cfd', 'nozzle', 'video', 'agent']
const runtimeIds = ['ui-runtime', 'propulsion-runtime', 'ai-runtime']
function moduleSet(source, platform) {
  const target = moduleTargets[platform]
  assert(target, 'Unknown module release platform')
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/, 'GITHUB_SHA must identify the module build commit')
  const files = filesIn(resolve(source))
  const one = name => {
    const matches = files.filter(path => basename(path) === name)
    assert.equal(matches.length, 1, `Missing or duplicate module artifact: ${name}`)
    return matches[0]
  }
  const metadataPath = one(`modules-${target}.json`)
  const payloadPath = one(`catalog-${target}.payload.json`)
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  assert.equal(metadata.version, version, 'Module version mismatch')
  assert.equal(metadata.sourceSha, sourceSha, 'Module commit mismatch')
  assert.equal(metadata.target, target, 'Module target mismatch')
  assert.match(metadata.publicKey, /^[a-f0-9]{64}$/, 'Invalid module trust key')
  assert.equal(sha256(payloadPath), metadata.catalogSha256, 'Module catalog checksum mismatch')
  const payloadBytes = readFileSync(payloadPath)
  const payload = JSON.parse(payloadBytes)
  assert.equal(payload.schemaVersion, 1, 'Unsupported module catalog schema')
  assert.equal(payload.appVersion, version, 'Module catalog version mismatch')
  assert.equal(payload.target, target, 'Module catalog target mismatch')
  assert.deepEqual(payload.packages.map(item => item.id).sort(), ['base', ...moduleIds, ...runtimeIds].sort(), 'Incomplete module package set')
  const uiFiles = new Set()
  const assets = payload.packages.map(item => {
    const kind = item.id === 'base' ? 'base' : moduleIds.includes(item.id) ? 'module' : 'runtime'
    assert.equal(item.kind, kind, 'Invalid module package kind')
    assert.equal(item.version, version, 'Module package version mismatch')
    assert.equal(item.file, `lmbox-${item.id}-${version}-${target}.zip`, 'Invalid module ZIP filename')
    assert(item.dependencies.every(id => id === 'base' || runtimeIds.includes(id)), 'Optional modules must not depend on another optional module')
    for (const path of item.uiFiles) { assert(!uiFiles.has(path), 'Duplicate UI asset owner'); uiFiles.add(path) }
    const path = one(item.file)
    assert(statSync(path).size > 0 && statSync(path).size === item.size, 'Module ZIP size mismatch')
    assert.equal(sha256(path), item.sha256, 'Module ZIP checksum mismatch')
    return { name: item.file, sha256: item.sha256, source: path }
  })
  assert.equal(metadata.installer?.name, `lmBox-${version}-${target}-module-installer.zip`, 'Missing native module installer')
  const installer = one(metadata.installer.name)
  assert(statSync(installer).size > 0, 'Module installer must not be empty')
  assert.equal(sha256(installer), metadata.installer.sha256, 'Module installer checksum mismatch')
  assets.push({ ...metadata.installer, source: installer })
  const signedPath = files.find(path => basename(path) === `catalog-${target}.json`)
  if (signedPath) {
    const signed = JSON.parse(readFileSync(signedPath, 'utf8'))
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(metadata.publicKey, 'hex')]), format: 'der', type: 'spki' })
    assert(Buffer.from(signed.payload, 'base64').equals(payloadBytes) && verify(null, payloadBytes, key, Buffer.from(signed.signature, 'hex')), 'Invalid development catalog signature')
  }
  return { metadata, metadataPath, payloadPath, payloadBytes, assets, inputCount: assets.length + 2 + (signedPath ? 1 : 0) }
}

if (command === 'validate-tag') {
  const [tag] = args
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    'Application version must use MAJOR.MINOR.PATCH')
  const [major, minor, patch] = version.split('.')
  const demoTag = `demov${major}.${minor.padStart(2, '0')}.${patch}`
  assert(tag === `v${version}` || tag === demoTag,
    `Tag must match package.json: v${version} or ${demoTag}`)
  const tauri = JSON.parse(readFileSync(join(root, 'desktop/tauri/tauri.conf.json'), 'utf8'))
  assert.equal(tauri.version, version, 'Tauri version must match package.json')
  for (const manifest of ['src-rust/Cargo.toml', 'desktop/tauri/Cargo.toml']) {
    const cargo = readFileSync(join(root, manifest), 'utf8')
    const packageSection = cargo.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1]
    assert.equal(packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1], version,
      `${manifest} package version must match package.json`)
  }
} else if (command === 'collect') {
  const [platform, source, destination] = args
  assert(Object.hasOwn(formats, platform), 'Unknown release platform')
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/, 'GITHUB_SHA must identify the build commit')
  const files = filesIn(resolve(source))
  const assets = formats[platform].map(extension => {
    const candidates = files.filter(path => path.endsWith(extension))
    assert.equal(candidates.length, 1, `Expected exactly one ${extension} installer`)
    const path = candidates[0]
    assert(statSync(path).size > 0, 'Installer must not be empty')
    return { source: path, name: filename(platform, extension), sha256: sha256(path) }
  })
  mkdirSync(destination, { recursive: true })
  for (const asset of assets) cpSync(asset.source, join(destination, asset.name))
  writeFileSync(join(destination, `${platform}.json`), JSON.stringify({
    version, sourceSha, platform, assets: assets.map(({ name, sha256 }) => ({ name, sha256 })),
  }, null, 2) + '\n')
} else if (command === 'collect-modules') {
  const [platform, source, destination] = args
  const set = moduleSet(source, platform)
  assert.equal(filesIn(resolve(source)).length, set.inputCount, 'Unexpected module release artifact')
  mkdirSync(destination, { recursive: true })
  for (const asset of [...set.assets, { name: basename(set.metadataPath), source: set.metadataPath }, { name: basename(set.payloadPath), source: set.payloadPath }]) cpSync(asset.source, join(destination, asset.name))
} else if (command === 'assemble-modules') {
  const [source, destination] = args
  const privateKey = createPrivateKey(readFileSync(process.env.LMBOX_MODULE_SIGNING_KEY))
  assert.equal(privateKey.asymmetricKeyType, 'ed25519', 'Module signing requires an Ed25519 key')
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex')
  assert.equal(publicKey, process.env.LMBOX_MODULE_PUBLIC_KEY, 'Release signing key does not match the pinned installer trust key')
  const sets = Object.keys(moduleTargets).map(platform => moduleSet(source, platform))
  assert.equal(filesIn(resolve(source)).length, sets.reduce((sum, set) => sum + set.inputCount, 0), 'Unexpected module release artifact')
  for (const set of sets) assert.equal(set.metadata.publicKey, publicKey, 'Module installer trust key mismatch')
  const checksums = readFileSync(join(destination, 'SHA256SUMS'), 'utf8')
  const manifests = JSON.parse(readFileSync(join(destination, 'release-manifest.json'), 'utf8'))
  const assets = []
  for (const set of sets) {
    for (const asset of set.assets) cpSync(asset.source, join(destination, asset.name))
    const name = `catalog-${set.metadata.target}.json`
    const signed = JSON.stringify({ payload: set.payloadBytes.toString('base64'), signature: sign(null, set.payloadBytes, privateKey).toString('hex') }) + '\n'
    writeFileSync(join(destination, name), signed)
    assets.push(...set.assets, { name, sha256: sha256(join(destination, name)) })
    manifests.push({ ...set.metadata, assets: [...set.assets.map(({ name, sha256 }) => ({ name, sha256 })), { name, sha256: sha256(join(destination, name)) }] })
  }
  writeFileSync(join(destination, 'SHA256SUMS'), checksums + assets.map(asset => `${asset.sha256}  ${asset.name}\n`).join(''))
  writeFileSync(join(destination, 'release-manifest.json'), JSON.stringify(manifests, null, 2) + '\n')
} else if (command === 'assemble') {
  const [source, destination] = args
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/, 'GITHUB_SHA must identify the release commit')
  const files = filesIn(resolve(source))
  const assets = []
  const manifests = []
  for (const [platform, extensions] of Object.entries(formats)) {
    const matches = files.filter(path => basename(path) === `${platform}.json`)
    assert.equal(matches.length, 1, `Missing or duplicate ${platform} manifest`)
    const manifest = JSON.parse(readFileSync(matches[0], 'utf8'))
    assert.equal(manifest.version, version, 'Installer version mismatch')
    assert.equal(manifest.sourceSha, sourceSha, 'Installer commit mismatch')
    assert.equal(manifest.platform, platform, 'Installer platform mismatch')
    assert.deepEqual(manifest.assets.map(asset => asset.name).sort(),
      extensions.map(extension => filename(platform, extension)).sort(), 'Incomplete installer set')
    for (const asset of manifest.assets) {
      const candidates = files.filter(path => basename(path) === asset.name)
      assert.equal(candidates.length, 1, `Missing or duplicate installer: ${asset.name}`)
      assert(statSync(candidates[0]).size > 0, 'Installer must not be empty')
      assert.equal(sha256(candidates[0]), asset.sha256, 'Installer checksum mismatch')
      assets.push({ ...asset, source: candidates[0] })
    }
    manifests.push(manifest)
  }
  assert.equal(files.length, assets.length + manifests.length, 'Unexpected release artifact')
  mkdirSync(destination, { recursive: true })
  for (const asset of assets) cpSync(asset.source, join(destination, asset.name))
  writeFileSync(join(destination, 'SHA256SUMS'), assets.map(asset => `${asset.sha256}  ${asset.name}\n`).join(''))
  writeFileSync(join(destination, 'release-manifest.json'), JSON.stringify(manifests, null, 2) + '\n')
} else {
  throw new Error('Usage: release-assets.mjs validate-tag TAG | collect PLATFORM SOURCE DESTINATION | assemble SOURCE DESTINATION')
}
