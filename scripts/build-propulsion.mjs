import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'src-fortran/modules/propulsion/design');
const build = path.join(root, '.tools/propulsion/modules-build');
const output = path.join(root, '.tools/propulsion/runtime');
const cmake = process.env.CMAKE || 'cmake';
function run(args) {
  const result = spawnSync(cmake, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`CMake exited with ${result.status}`);
}
async function fingerprint(directory, digest = createHash('sha256')) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : 1);
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await fingerprint(filename, digest);
    else if (entry.isFile()) {
      const bytes = await readFile(filename);
      digest.update(path.relative(source, filename).split(path.sep).join('/') + '\0');
      digest.update(String(bytes.length) + '\0');
      digest.update(bytes);
    } else throw new Error(`Unsupported source entry: ${filename}`);
  }
  return digest;
}
const configure = ['-S', source, '-B', build, '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_TESTING=ON'];
if (process.env.NINJA) configure.push(`-DCMAKE_MAKE_PROGRAM=${process.env.NINJA}`);
run(configure);
run(['--build', build, '--parallel', '4']);
run(['--build', build, '--target', 'test']);
const library = process.platform === 'win32' ? 'liblmbox_propulsion.dll'
  : process.platform === 'darwin' ? 'liblmbox_propulsion.dylib' : 'liblmbox_propulsion.so';
await mkdir(output, { recursive: true });
await copyFile(path.join(build, library), path.join(output, library));
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({
  abiVersion: 1, sourceDirectory: 'src-fortran/modules/propulsion/design',
  sourceSha256: (await fingerprint(source)).digest('hex'), platform: process.platform, arch: process.arch,
  kernel: 'Fortran', interface: 'C ABI',
}, null, 2) + '\n');
console.log(`Propulsion runtime: ${path.relative(root, output)}`);
