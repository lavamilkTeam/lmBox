// Release packaging adapter. It consumes Tauri bundles, never application internals.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

if (command === 'validate-tag') {
  const [tag] = args
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    'Application version must use MAJOR.MINOR.PATCH')
  const [major, minor, patch] = version.split('.')
  const demoTag = `demov${major}.${minor.padStart(2, '0')}.${patch}`
  assert(tag === `v${version}` || tag === demoTag,
    `Tag must match package.json: v${version} or ${demoTag}`)
  const tauri = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
  assert.equal(tauri.version, version, 'Tauri version must match package.json')
  const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8')
  const packageSection = cargo.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1]
  assert.equal(packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1], version,
    'Cargo package version must match package.json')
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
