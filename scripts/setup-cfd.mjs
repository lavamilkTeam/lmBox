import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const tools = join(root, '.tools/cfd')
const upstream = join(tools, 'source')
const commit = 'a90f60c2313ceba09c236c81f0693d93357d1614'
const repository = 'https://github.com/jaheyns/CfdOF.git'
const dockerImage = 'mmcker/cfdof-openfoam@sha256:d09be2c8119e6fccc4b9bed2674183fb113d1cca598148efd51ff2f19e60b1d5'

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024, ...options })
  if (result.error || result.status !== 0) throw new Error(`${executable}: ${result.error?.message || result.stderr?.trim() || `退出状态 ${result.status}`}`)
  return result.stdout?.trim() || ''
}

function executable(name) {
  if (!name) return undefined
  if (isAbsolute(name)) return existsSync(name) ? name : undefined
  for (const entry of (process.env.PATH || '').split(delimiter)) {
    for (const suffix of process.platform === 'win32' ? ['', '.exe'] : ['']) {
      const candidate = resolve(entry, `${name}${suffix}`)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

function pythonCandidates() {
  if (process.env.LMBOX_FREECAD_PYTHON) return [resolve(process.env.LMBOX_FREECAD_PYTHON)]
  const bases = [process.env.LMBOX_FREECAD_ROOT].filter(Boolean)
  if (process.platform === 'darwin') {
    bases.push('/Applications/FreeCAD.app/Contents/Resources')
    for (const directory of ['/Applications', join(homedir(), 'Applications')]) {
      if (existsSync(directory)) for (const item of readdirSync(directory)) if (/^FreeCAD.*\.app$/i.test(item)) bases.push(join(directory, item, 'Contents/Resources'))
    }
  } else if (process.platform === 'win32') {
    for (const directory of [process.env.ProgramFiles, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean)) {
      if (existsSync(directory)) for (const item of readdirSync(directory)) if (/^FreeCAD/i.test(item)) bases.push(join(directory, item))
    }
  } else bases.push('/usr', '/usr/local', '/opt/freecad', '/opt/FreeCAD')
  return [...new Set(bases.flatMap(base => ['bin/python3', 'bin/python', 'bin/python.exe', 'bin/python3.11', 'bin/python3.12', 'bin/python3.10'].map(relative => resolve(base, relative))))]
}

function probePython(candidate) {
  if (!existsSync(candidate)) return false
  const profile = join(tmpdir(), `lmbox-cfd-probe-${process.pid}`)
  mkdirSync(profile, { recursive: true })
  const probe = `import sys,pathlib,importlib.util\nr=pathlib.Path(sys.executable).parent.parent\nfor p in (r/'lib',r/'bin',pathlib.Path('/usr/lib/freecad/lib'),pathlib.Path('/usr/local/lib/freecad/lib')):\n if p.is_dir(): sys.path.insert(0,str(p))\nimport FreeCAD\nassert importlib.util.find_spec('FreeCADGui') is not None\nassert importlib.util.find_spec('PySide') is not None or importlib.util.find_spec('PySide2') is not None or importlib.util.find_spec('PySide6') is not None\nprint('lmbox-cfd-probe-ok')`
  try {
    return run(candidate, ['-c', probe], { timeout: 30_000, env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', FREECAD_USER_HOME: profile, XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: profile, PYTHONDONTWRITEBYTECODE: '1' } }).includes('lmbox-cfd-probe-ok')
  } catch { return false } finally { rmSync(profile, { recursive: true, force: true }) }
}

function prepareSource() {
  mkdirSync(tools, { recursive: true })
  if (!existsSync(upstream)) {
    const stage = join(tools, `source-stage-${process.pid}`)
    try {
      mkdirSync(stage)
      run('git', ['init', stage])
      run('git', ['-C', stage, 'remote', 'add', 'origin', repository])
      run('git', ['-C', stage, 'fetch', '--depth=1', 'origin', commit])
      run('git', ['-C', stage, 'checkout', '--detach', 'FETCH_HEAD'])
      renameSync(stage, upstream)
    } finally { if (existsSync(stage)) rmSync(stage, { recursive: true, force: true }) }
  }
  if (run('git', ['-C', upstream, 'rev-parse', 'HEAD']) !== commit) throw new Error('隔离 CfdOF 源目录版本不匹配；请先保留本地改动，再移走 .tools/cfd/source 后重试。')
  run('git', ['-C', upstream, 'diff', '--quiet', 'HEAD', '--'])
  if (!existsSync(join(upstream, 'LICENSE'))) throw new Error('固定源缺少许可证文件。')
  // Preserve every original source/license file; this manifest describes acquisition only.
  writeFileSync(join(tools, 'source-manifest.json'), `${JSON.stringify({ schemaVersion: 1, repository, commit, licenseFile: 'source/LICENSE', sourceUnmodified: true }, null, 2)}\n`)
}

try {
  const pythonExecutable = pythonCandidates().find(probePython)
  if (!pythonExecutable) throw new Error('未找到可用的 FreeCAD Python。请安装 FreeCAD，或设置 LMBOX_FREECAD_PYTHON / LMBOX_FREECAD_ROOT 后重试。')
  prepareSource()
  const previousPath = join(tools, 'runtime.json')
  const previous = existsSync(previousPath) ? JSON.parse(readFileSync(previousPath, 'utf8')) : {}
  const dockerExecutable = executable(process.env.LMBOX_CFD_DOCKER || previous.dockerExecutable || 'docker')
  const paraviewExecutable = executable(process.env.LMBOX_CFD_PARAVIEW || previous.paraviewExecutable || 'paraview')
  if (process.env.LMBOX_CFD_DOCKER && !dockerExecutable) throw new Error('LMBOX_CFD_DOCKER 指定的可执行文件不存在。')
  if (process.env.LMBOX_CFD_PARAVIEW && !paraviewExecutable) throw new Error('LMBOX_CFD_PARAVIEW 指定的可执行文件不存在。')
  const config = { schemaVersion: 1, sourceCommit: commit, pythonExecutable, upstreamPath: upstream,
    ...(dockerExecutable ? { dockerExecutable } : {}),
    dockerImage: process.env.LMBOX_CFD_DOCKER_IMAGE || previous.dockerImage || dockerImage,
    ...(paraviewExecutable ? { paraviewExecutable } : {}),
  }
  mkdirSync(dirname(previousPath), { recursive: true })
  writeFileSync(previousPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  console.log('CFD 运行环境已配置：.tools/cfd/runtime.json；原版源及许可证保存在 .tools/cfd/source。')
  if (!dockerExecutable) console.log('未检测到 Docker；网格和求解前需要配置可用的 OpenFOAM 运行环境。')
} catch (error) {
  console.error(`CFD 环境配置失败：${error.message}`)
  process.exitCode = 1
}
