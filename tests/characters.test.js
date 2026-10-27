import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHujurCharacter, createNiqabCharacter, animateCharacterWalk, moveCampusNPCTo } from '../src/player/campusCharacters.js';
import { createCharacterRig } from '../src/player/character.js';
import { PlayerController } from '../src/player/controller.js';

test('createHujurCharacter constructs authentic 3D model with robe, patterned keffiyeh and beard', () => {
  const hujur = createHujurCharacter();
  assert.ok(hujur.isGroup);
  assert.equal(hujur.name, 'Campus Story - Hujur');
  assert.ok(hujur.userData.campusRig);
  assert.equal(hujur.userData.campusRig.kind, 'hujur');

  // Verify joint pivots exist
  assert.ok(hujur.userData.campusRig.leftArmPivot);
  assert.ok(hujur.userData.campusRig.rightArmPivot);
  assert.ok(hujur.userData.campusRig.leftLegPivot);
  assert.ok(hujur.userData.campusRig.rightLegPivot);
  assert.ok(hujur.userData.campusRig.headPivot);
  assert.ok(hujur.userData.campusRig.torso);

  // Test walking animation
  const initialArmRot = hujur.userData.campusRig.leftArmPivot.rotation.x;
  animateCharacterWalk(hujur, 0.05, 2.5);
  assert.notEqual(hujur.userData.campusRig.leftArmPivot.rotation.x, initialArmRot);
  assert.ok(hujur.userData.walkTime > 0);
});

test('createNiqabCharacter constructs authentic modest female student model with veil and robe', () => {
  const niqab = createNiqabCharacter();
  assert.ok(niqab.isGroup);
  assert.equal(niqab.name, 'Campus Story - Niqab Student');
  assert.ok(niqab.userData.campusRig);
  assert.equal(niqab.userData.campusRig.kind, 'niqab');

  // Test walk animation and NPC navigation helper
  animateCharacterWalk(niqab, 0.03, 1.5);
  const target = { x: 10, z: 20 };
  const speed = moveCampusNPCTo(niqab, target, 0.05, 1.2);
  assert.equal(speed, 1.2);
});

test('createCharacterRig creates unified rig for hujur, niqab and student', () => {
  for (const type of ['hujur', 'niqab', 'student']) {
    const rig = createCharacterRig(type);
    assert.ok(rig.group.isGroup);
    assert.ok(rig.arms.length === 2);
    assert.ok(rig.legs.length === 2);
    assert.ok(rig.head);
  }
});

test('PlayerController dynamically switches between character types', () => {
  const group = new THREE.Group();
  const player = new PlayerController({ collisionGroup: group, characterType: 'student' });

  assert.equal(player.characterType, 'student');
  player.animate(0.05);

  // Switch to Hujur
  player.setCharacterType('hujur');
  assert.equal(player.characterType, 'hujur');
  assert.equal(player.group.name, 'HujurStudent');
  player.animate(0.05);
  assert.ok(player.group.children.length > 0);

  // Switch to Niqab
  player.setCharacterType('niqab');
  assert.equal(player.characterType, 'niqab');
  assert.equal(player.group.name, 'NiqabStudent');
  player.animate(0.05);

  player.dispose();
});
