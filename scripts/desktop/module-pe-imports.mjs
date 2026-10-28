// Process adapter used by module-package.mjs. Keep the full objdump report out
// of spawnSync's capture buffer: PE export and unwind tables can exceed 1 MiB.
import { spawn } from 'node:child_process'

const library = process.argv[2]
if (!library || process.argv.length !== 3) throw new Error('Expected one PE library path')
const command = process.env.OBJDUMP || 'objdump'
const child = spawn(command, ['-p', library], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
  env: { ...process.env, LC_ALL: 'C' },
})
const imports = new Set()
let pending = ''
let stderr = ''
let importBytes = 0
let failure
function line(value) {
  const match = /^\s*DLL Name:\s*(\S+)\s*$/.exec(value)
  if (!match || imports.has(match[1])) return
  importBytes += Buffer.byteLength(match[1])
  if (importBytes > 64 * 1024) throw new Error('PE import names exceed 64 KiB')
  imports.add(match[1])
}
function abort(error) {
  failure ||= error
  child.kill()
}
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', chunk => {
  if (failure) return
  try {
    pending += chunk
    let end
    while ((end = pending.indexOf('\n')) !== -1) {
      if (end > 64 * 1024) throw new Error('objdump output line exceeds 64 KiB')
      line(pending.slice(0, end))
      pending = pending.slice(end + 1)
    }
    if (pending.length > 64 * 1024) throw new Error('objdump output line exceeds 64 KiB')
  } catch (error) {
    abort(error)
  }
})
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192) })
child.stdout.on('error', abort)
child.stderr.on('error', abort)
child.on('error', error => { failure ||= error })
const result = await new Promise(resolve => child.once('close', (status, signal) => resolve({ status, signal })))
if (failure || result.status !== 0) {
  throw new Error(`${command} failed for ${library}: ${failure?.message || stderr.trim() || `exit ${result.status}, signal ${result.signal}`}`)
}
line(pending)
console.log(JSON.stringify([...imports]))
