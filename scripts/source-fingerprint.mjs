import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_DIRECTORIES = ['src/map', 'src/world', 'src/navigation', 'src/activity', 'src/vehicle', 'src/data'];

/** Include nested landmark generators and evidence records, with stable paths. */
export async function campusSourceFingerprint(root, {
  directories = DEFAULT_DIRECTORIES,
  extraFiles = ['src/config.js', 'scripts/prepare-campus.mjs', 'scripts/source-fingerprint.mjs'],
} = {}) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
    }
  }
  for (const directory of directories) await visit(directory);
  const hash = createHash('sha256');
  for (const path of [...new Set([...files, ...extraFiles])].sort()) {
    hash.update(path); hash.update(await readFile(resolve(root, path)));
  }
  return hash.digest('hex');
}
