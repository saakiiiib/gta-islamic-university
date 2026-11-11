import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { campusSourceFingerprint } from '../scripts/source-fingerprint.mjs';

test('preparation fingerprint changes with nested landmark code, evidence and generator changes', async () => {
  const parent=resolve(tmpdir()), root=await mkdtemp(resolve(parent,'campus-fingerprint-'));
  try {
    await mkdir(resolve(root,'src/world/landmarks'),{recursive:true});
    await mkdir(resolve(root,'src/data'),{recursive:true});
    await writeFile(resolve(root,'src/world/landmarks/mosque.js'),'export const shape=1;');
    await writeFile(resolve(root,'src/data/landmarks.js'),'export const height=null;');
    await writeFile(resolve(root,'generator.mjs'),'generator1');
    await mkdir(resolve(root,'scripts'),{recursive:true});
    await writeFile(resolve(root,'scripts/prepare-campus.mjs'),'generator1');
    await writeFile(resolve(root,'scripts/source-fingerprint.mjs'),'hash1');
    await writeFile(resolve(root,'src/config.js'),'origin1');
    const options={directories:['src/world','src/data'],extraFiles:['generator.mjs']};
    const first=await campusSourceFingerprint(root,options);
    assert.equal(await campusSourceFingerprint(root,{...options,directories:options.directories.toReversed()}),first);
    await writeFile(resolve(root,'src/world/landmarks/mosque.js'),'export const shape=2;');
    const nested=await campusSourceFingerprint(root,options); assert.notEqual(nested,first);
    await writeFile(resolve(root,'src/data/landmarks.js'),'export const height=12;');
    const data=await campusSourceFingerprint(root,options); assert.notEqual(data,nested);
    await writeFile(resolve(root,'generator.mjs'),'generator2');
    assert.notEqual(await campusSourceFingerprint(root,options),data);
    const defaultBefore=await campusSourceFingerprint(root,{directories:options.directories});
    await writeFile(resolve(root,'src/config.js'),'origin2');
    assert.notEqual(await campusSourceFingerprint(root,{directories:options.directories}),defaultBefore, 'map origin/bounds configuration must invalidate preparation');
  } finally {
    // Only remove the exact temporary directory created by this test.
    assert.equal(dirname(root),parent); assert.ok(basename(root).startsWith('campus-fingerprint-'));
    await rm(root,{recursive:true,force:true});
  }
});
