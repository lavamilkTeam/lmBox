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

test('only stable version tags matching application manifests are accepted', () => {
  pass(run('validate-tag', `v${version}`))
  for (const tag of ['v99.99.99', 'v01.2.3', `v${version}-rc.1`, 'main', 'v1.2.3;echo bad']) {
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
