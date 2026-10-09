import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const task = mkdtempSync(join(tmpdir(), 'lmbox-worker-'))
try {
  // Run a relocated distribution without Python, the repository, or a dev server on PATH.
  cpSync(resolve(root, process.argv[2] || 'desktop/tauri/resources/lmbox-geometry'), join(task, 'worker'), { recursive: true, verbatimSymlinks: true })
  const request = JSON.parse(readFileSync(join(root, 'contracts/fixtures/v1/preview.json'), 'utf8'))
  request.exportFormat = 'stl'
  writeFileSync(join(task, 'input.json'), JSON.stringify(request))
  const { protocolVersion, projectId, jobId, inputRevision } = request
  const envelope = { protocolVersion, projectId, jobId, inputRevision }
  const result = spawnSync(join(task, 'worker', process.platform === 'win32' ? 'lmbox-geometry.exe' : 'lmbox-geometry'), [], {
    cwd: task, input: JSON.stringify(envelope) + '\n', encoding: 'utf8', timeout: 60000,
    env: { ...process.env, PYTHONPATH: '', PYTHONHOME: '', PATH: '' },
  })
  assert.equal(result.status, 0, result.stderr || String(result.error))
  const response = JSON.parse(result.stdout)
  assert.equal(response.error, undefined, response.error)
  for (const key of Object.keys(envelope)) assert.equal(response[key], envelope[key])
  assert.equal(response.artifact, 'mesh.json')
  const mesh = JSON.parse(readFileSync(join(task, 'mesh.json'), 'utf8'))
  assert.equal(mesh.summary.holeCount, 2)
  assert(mesh.positions.length > 0 && mesh.indices.length > 0 && mesh.summary.volume > 0)
  assert.equal(mesh.export.format, 'stl')
  assert(mesh.export.content.startsWith('solid'))
  console.log('Relocated desktop worker generated a validated two-hole model and STL.')
} finally { rmSync(task, { recursive: true, force: true }) }
