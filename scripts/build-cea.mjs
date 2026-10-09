import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// NASA CEA v3.3.4, Apache-2.0. Compile the official Fortran kernel and C ABI.
const commit = '4c5c612efa2002a94e3a5a1f33b1674d55c65340';
const sha256 = '313fee27377ff72594313132418521187ad0538ecfcead6109a1f1beeab8c2f2';
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(root, '.tools', 'cea', commit);
const source = path.join(cache, 'source');
const build = path.join(cache, 'build');
const output = path.join(root, '.tools', 'cea', 'runtime');
const cmake = process.env.CMAKE || 'cmake';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
  return result;
}

await mkdir(cache, { recursive: true });
const archive = path.join(cache, 'source.tar.gz');
let bytes;
try { bytes = await readFile(archive); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(`https://codeload.github.com/nasa/cea/tar.gz/${commit}`);
  if (!response.ok) throw new Error(`CEA download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
  throw new Error('CEA source checksum mismatch');
}
await writeFile(archive, bytes);
// Extract only the build inputs. README files remain untouched by this builder.
await mkdir(source, { recursive: true });
run('tar', ['-xzf', archive, '--strip-components=1', '--exclude=README*', '--exclude=readme*',
  '-C', source, ...['CMakeLists.txt', 'cmake', 'source', 'extern', 'data', 'LICENSE.txt', 'NOTICE.txt']
    .map((entry) => `cea-${commit}/${entry}`)]);
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
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ version: '3.3.4', commit, sha256,
  platform: process.platform, arch: process.arch, kernel: 'Fortran', interface: 'official C ABI' }, null, 2) + '\n');
console.log(`CEA backend runtime: ${path.relative(root, output)}`);
