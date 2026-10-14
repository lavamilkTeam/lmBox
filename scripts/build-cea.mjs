import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// NASA CEA v3.3.4, Apache-2.0. Compile the official Fortran kernel and C ABI.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'src-fortran', 'modules', 'propulsion', 'cea');
const upstream = JSON.parse(await readFile(path.join(source, 'upstream.json'), 'utf8'));
const build = path.join(root, '.tools', 'cea', 'modules-build');
const output = path.join(root, '.tools', 'cea', 'runtime');
const cmake = process.env.CMAKE || 'cmake';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
  return result;
}

// Fingerprint the actual checked-in sources, including any local modifications.
// Builds use this tree directly and never fetch or overwrite source files.
async function sourceFingerprint(directory, digest = createHash('sha256')) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await sourceFingerprint(filename, digest);
    else if (entry.isFile()) {
      const bytes = await readFile(filename);
      digest.update(path.relative(source, filename).split(path.sep).join('/') + '\0');
      digest.update(String(bytes.length) + '\0');
      digest.update(bytes);
    } else throw new Error(`Unsupported source entry: ${filename}`);
  }
  return digest;
}
const sourceSha256 = (await sourceFingerprint(source)).digest('hex');
const configure = ['-S', source, '-B', build, '-G', 'Ninja',
  // Only explicit database paths are used at runtime; keep this unused fallback
  // short to avoid the upstream generated Fortran line-length limit.
  '-DCMAKE_INSTALL_PREFIX=/cea',
  '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
  '-DCEA_BUILD_TESTING=OFF', '-DCEA_ENABLE_BIND_C=ON', '-DCEA_ENABLE_BIND_CXX=OFF',
  '-DCEA_ENABLE_BIND_PYTHON=OFF', '-DCEA_ENABLE_BIND_MATLAB=OFF', '-DCEA_ENABLE_BIND_EXCEL=OFF'];
if (process.env.NINJA) configure.push(`-DCMAKE_MAKE_PROGRAM=${process.env.NINJA}`);
run(cmake, configure);
run(cmake, ['--build', build, '--parallel', '4']);

const library = process.platform === 'win32' ? 'libcea_bindc.dll'
  : process.platform === 'darwin' ? 'libcea_bindc.dylib' : 'libcea_bindc.so';
const librarySource = path.join(build, 'source', 'bind', 'c', library);
// This is a backend development runtime; Fortran runtime libraries are supplied
// by the host compiler installation. Desktop redistribution is a separate boundary.
await mkdir(output, { recursive: true });
for (const [from, to] of [[librarySource, library], [path.join(build, 'thermo.lib'), 'thermo.lib'],
  [path.join(build, 'trans.lib'), 'trans.lib'], [path.join(source, 'LICENSE.txt'), 'CEA-LICENSE.txt'],
  [path.join(source, 'NOTICE.txt'), 'CEA-NOTICE.txt']]) {
  await copyFile(from, path.join(output, to));
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ version: upstream.version,
  upstreamCommit: upstream.commit, sourceDirectory: 'src-fortran/modules/propulsion/cea', sourceSha256,
  platform: process.platform, arch: process.arch, kernel: 'Fortran', interface: 'official C ABI' }, null, 2) + '\n');
console.log(`CEA backend runtime: ${path.relative(root, output)}`);
