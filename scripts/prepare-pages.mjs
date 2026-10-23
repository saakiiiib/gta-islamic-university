import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'dist'), target = resolve(root, 'docs');
await readFile(resolve(source, 'index.html')); // Validate the build before changing the Pages output.
// Only the exact generated docs directory inside this project may be replaced.
if (target !== resolve(root, 'docs') || dirname(target) !== root || source === target) throw new Error('Unsafe Pages output path.');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const name of await readdir(source)) await cp(resolve(source, name), resolve(target, name), { recursive: true });
await writeFile(resolve(target, '.nojekyll'), '');
console.log('GitHub Pages output prepared in docs/. Publish main → /docs.');
