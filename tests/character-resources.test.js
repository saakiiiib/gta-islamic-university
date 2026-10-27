import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacterRig, disposeCharacterRig } from '../src/player/character.js';
import { PlayerController } from '../src/player/controller.js';
import { VanOccupants } from '../src/vehicle/occupants.js';

function meshes(rig) {
  const result = [];
  rig.group.traverse(object => { if (object.isMesh) result.push(object); });
  return result;
}

test('selected campus character is constructed directly and selecting it again keeps its rig', () => {
  for (const type of ['hujur', 'niqab']) {
    const player = new PlayerController({ characterType: type });
    assert.equal(player.characterType, type);
    assert.equal(player.rig.visual.userData.campusRig.kind, type);
    assert.equal(player.group.name, type === 'niqab' ? 'NiqabStudent' : 'HujurStudent');
    const original = player.rig;
    let disposed = 0;
    meshes(original).forEach(mesh => mesh.geometry.addEventListener('dispose', () => disposed++));
    assert.equal(player.setCharacterType(type), false);
    assert.equal(player.rig, original);
    assert.equal(disposed, 0);
    player.dispose();
  }
  const legacy = new PlayerController({});
  assert.equal(legacy.characterType, 'student', 'existing constructors keep their default');
  legacy.dispose();
});

test('switching retains the rendered transform, animation pose and independent physics state', () => {
  const player = new PlayerController({ characterType: 'hujur' });
  const scene = new THREE.Group();
  scene.add(player.group);
  player.position.set(90, 2, 70);
  player.velocity.set(3, 1, -5);
  player.group.position.set(4, .72, -8);
  player.group.rotation.set(.11, 1.7, -.09);
  player.group.visible = false;
  player.rig.phase = 2.4;
  player.rig.pose = { bob: -.03, lean: .14, a0: -.8 };
  player.rig.body.position.set(0, -.03, .1);
  player.rig.body.rotation.set(.14, 0, -.08);
  player.rig.arms[0].rotation.x = -.8;
  const old = player.rig, transform = player.group.matrix.clone();
  player.group.updateMatrix();
  transform.copy(player.group.matrix);
  const pose = { ...old.pose }, physics = player.position.clone(), velocity = player.velocity.clone();
  const geometry = meshes(old).find(mesh => mesh.geometry.type === 'LatheGeometry').geometry;
  let released = 0;
  geometry.addEventListener('dispose', () => released++);
  assert.equal(player.setCharacterType('niqab'), true);
  player.group.updateMatrix();
  assert.ok(player.group.matrix.equals(transform));
  assert.equal(player.group.visible, false);
  assert.deepEqual(player.rig.pose, pose);
  assert.notEqual(player.rig.pose, old.pose);
  assert.equal(player.rig.phase, 2.4);
  assert.equal(player.rig.arms[0].rotation.x, -.8);
  assert.ok(player.position.equals(physics));
  assert.ok(player.velocity.equals(velocity));
  assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0], player.group);
  assert.equal(old.group.parent, null);
  assert.equal(released, 1);
  player.dispose();
});

test('shared campus buffers and materials survive another character being released', () => {
  const options = { robeColor: '#5b7a69', scarfColor: '#58a17b' };
  const first = createCharacterRig('hujur', options), second = createCharacterRig('hujur', options);
  const firstMeshes = meshes(first), secondMeshes = meshes(second);
  const material = firstMeshes.find(mesh => mesh.geometry.type === 'LatheGeometry').material;
  assert.equal(material, secondMeshes.find(mesh => mesh.geometry.type === 'LatheGeometry').material);
  const sphere = firstMeshes.find(mesh => mesh.geometry.type === 'SphereGeometry' && mesh.geometry.parameters.radius === 1).geometry;
  assert.ok(secondMeshes.some(mesh => mesh.geometry === sphere));
  let materialDisposals = 0, sphereDisposals = 0;
  material.addEventListener('dispose', () => materialDisposals++);
  sphere.addEventListener('dispose', () => sphereDisposals++);
  disposeCharacterRig(first);
  assert.equal(materialDisposals, 0);
  assert.equal(sphereDisposals, 0);
  disposeCharacterRig(second);
  assert.equal(materialDisposals, 1);
  assert.equal(sphereDisposals, 1);
  disposeCharacterRig(second);
  assert.equal(materialDisposals, 1, 'release is idempotent');
});

test('repeated switches release each old owned robe and retain a visible seated passenger', () => {
  const player = new PlayerController({ characterType: 'hujur' });
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const van = { group, model: { body }, position: new THREE.Vector3(11, 0, 14), yaw: .7 };
  const occupants = new VanOccupants([van], player, { render: false });
  for (const type of ['niqab', 'hujur', 'niqab', 'hujur', 'niqab']) {
    const geometry = meshes(player.rig).find(mesh => mesh.geometry.type === 'LatheGeometry').geometry;
    let disposed = 0;
    geometry.addEventListener('dispose', () => disposed++);
    player.setCharacterType(type);
    assert.equal(disposed, 1);
    occupants.update(1 / 60, { driving: true, van });
    assert.equal(player.group.visible, true);
    const local = body.worldToLocal(player.group.position.clone());
    assert.ok(local.distanceTo(new THREE.Vector3(0, .065, .9)) < 1e-8);
    for (const mesh of meshes(player.rig)) assert.ok(mesh.geometry.getAttribute('position').count > 0);
  }
  occupants.dispose();
  player.dispose();
});

test('character release leaves the shared scarf texture available for subsequent characters', t => {
  const originalDocument = globalThis.document;
  const context = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  globalThis.document = { createElement() { return { getContext() { return context; } }; } };
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
  const options = { scarfColor: '#9c6dba', robeColor: '#e9ddcd' };
  const first = createCharacterRig('hujur', options);
  const texture = meshes(first).map(mesh => mesh.material.map).find(Boolean);
  assert.ok(texture?.isCanvasTexture);
  let disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  disposeCharacterRig(first);
  const second = createCharacterRig('hujur', options);
  assert.ok(meshes(second).some(mesh => mesh.material.map === texture));
  disposeCharacterRig(second);
  assert.equal(disposed, 0);
});
