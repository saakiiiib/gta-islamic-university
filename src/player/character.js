import { createHujurCharacter, createNiqabCharacter, animateCharacterWalk } from './campusCharacters.js';
import * as THREE from 'three';

/** An original, metre-scaled student. The root origin is at the soles. */
export function createStudent({ palette = {} } = {}) {
  const group = new THREE.Group();
  group.name = 'Student';
  const materials = {
    skin: new THREE.MeshStandardMaterial({ color: 0x9c633d, roughness: 0.82 }),
    shirt: new THREE.MeshStandardMaterial({ color: 0xe8e0c6, roughness: 0.95 }),
    navy: new THREE.MeshStandardMaterial({ color: 0x23384d, roughness: 0.9 }),
    shoes: new THREE.MeshStandardMaterial({ color: 0x242a30, roughness: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 1 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x171b1e }),
    bag: new THREE.MeshStandardMaterial({ color: 0x42624e, roughness: 1 }),
  };
  for (const [key, color] of Object.entries(palette)) materials[key]?.color.set(color);
  function box(parent, size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const body = new THREE.Group();
  group.add(body);
  box(body, [0.39, 0.51, 0.23], [0, 1.15, 0], materials.shirt);
  box(body, [0.36, 0.17, 0.23], [0, 0.82, 0], materials.navy);
  box(body, [0.11, 0.09, 0.11], [0, 1.435, 0], materials.skin);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.167, 10, 8), materials.skin);
  head.position.set(0, 1.579, -0.012);
  head.scale.set(0.91, 1, 0.94);
  head.castShadow = true;
  body.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.171, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.48), materials.hair);
  hair.position.copy(head.position);
  hair.scale.set(0.94, 1, 0.97);
  hair.castShadow = true;
  body.add(hair);
  box(body, [0.045, 0.027, 0.018], [-0.055, 1.6, -0.161], materials.eye);
  box(body, [0.045, 0.027, 0.018], [0.055, 1.6, -0.161], materials.eye);
  box(body, [0.052, 0.056, 0.05], [0, 1.565, -0.169], materials.skin);
  box(body, [0.31, 0.4, 0.17], [0, 1.15, 0.185], materials.bag);
  for (const side of [-1, 1]) box(body, [0.045, 0.42, 0.025], [side * 0.127, 1.17, -0.129], materials.bag);
  const arms = [], legs = [], knees = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.255, 1.355, 0);
    body.add(arm);
    box(arm, [0.14, 0.235, 0.19], [0, -0.102, 0], materials.shirt);
    box(arm, [0.105, 0.28, 0.11], [0, -0.34, 0], materials.skin);
    box(arm, [0.11, 0.12, 0.1], [0, -0.52, 0], materials.skin);
    arms.push(arm);
    const leg = new THREE.Group();
    leg.position.set(side * 0.105, 0.77, 0);
    body.add(leg);
    box(leg, [0.16, 0.34, 0.195], [0, -0.17, 0], materials.navy);
    const knee = new THREE.Group();
    knee.position.y = -0.34;
    leg.add(knee);
    box(knee, [0.145, 0.31, 0.17], [0, -0.155, 0], materials.navy);
    box(knee, [0.17, 0.12, 0.27], [0, -0.37, -0.04], materials.shoes);
    legs.push(leg);
    knees.push(knee);
  }
  return { group, body, arms, legs, knees, head, hair, pose: null };
}


export function createCharacterRig(type = 'hujur', options = {}) {
  if (type === 'student') {
    return createStudent(options);
  }
  const isNiqab = type === 'niqab';
  const visual = isNiqab
    ? createNiqabCharacter({ scale: 0.81, ...options })
    : createHujurCharacter({ scale: 0.81, ...options });
  visual.rotation.y = Math.PI;

  const group = new THREE.Group();
  group.name = isNiqab ? 'NiqabStudent' : 'HujurStudent';
  group.add(visual);

  const rigData = visual.userData.campusRig;
  const arms = [rigData.leftArmPivot, rigData.rightArmPivot];
  const legs = [rigData.leftLegPivot, rigData.rightLegPivot];
  const knees = [rigData.leftLegPivot, rigData.rightLegPivot];
  const body = rigData.torso;
  const head = rigData.headPivot;

  return {
    group,
    body,
    arms,
    legs,
    knees,
    head,
    hair: head,
    visual,
    characterType: type,
    pose: null,
  };
}

export function animateStudent(rig, state, time, dt = .01667) {
  if (rig.visual) {
    animateCharacterWalk(rig.visual, Math.max(0, Math.min(dt, .1)), state.speed);
  }
  const moving = state.speed > 0.08;
  const running = state.speed > 4.5;
  const delta = Math.max(0, Math.min(dt, .1));
  rig.phase = (rig.phase ?? 0) + delta * (running ? 13 : 8.5) * Math.min(1.2, state.speed / (running ? 6 : 3));
  const cycle = rig.phase;
  const stride = Math.min(state.speed / 3.8, 1) * (running ? 0.8 : 0.52);
  const swing = Math.sin(cycle) * stride;
  const landing = Math.sin(Math.max(0, Math.min(1, state.landingBlend ?? 0)) * Math.PI) * .065;
  const target = {
    bob: state.grounded ? (moving ? Math.abs(Math.sin(cycle)) * (running ? .042 : .021) : Math.sin(time * 2) * .006) - landing : 0,
    bodyZ: 0,
    lean: state.grounded && running ? -.105 : !state.grounded ? -.035 : 0,
    roll: THREE.MathUtils.clamp((state.turnRate ?? 0) * state.speed * .007, -.13, .13),
    a0: state.grounded ? -swing * .85 : -.55, a1: state.grounded ? swing * .85 : -.55,
    az0: -.045, az1: .045,
    l0: state.grounded ? swing : -.28, l1: state.grounded ? -swing : .23,
    k0: state.grounded ? Math.max(0, -Math.sin(cycle)) * stride * .85 + landing * 4 : .5,
    k1: state.grounded ? Math.max(0, Math.sin(cycle)) * stride * .85 + landing * 4 : .35,
  };
  if (state.motionState === 'jumpOff') {
    const t = state.motionTime ?? 0;
    Object.assign(target, { bob: 0, bodyZ: 0, lean: -.28, roll: Math.sin(t * 13) * .09,
      a0: -1.12 + Math.sin(t * 17) * .25, a1: -.82 - Math.sin(t * 17) * .28,
      az0: -.32, az1: .32, l0: -.54, l1: .48, k0: .9, k1: .72 });
  } else if (state.motionState === 'stumble') {
    const t = state.motionTime ?? 0;
    Object.assign(target, { bob: -.14 * Math.exp(-t * 4), lean: -.48 * Math.exp(-t * 3),
      roll: Math.sin(t * 16) * .17 * Math.exp(-t * 4), a0: -.9, a1: .7,
      az0: -.27, az1: .28, l0: .6, l1: -.58, k0: .8, k1: .65 });
  } else if (state.motionState === 'fallen') {
    Object.assign(target, { bob: -.3, lean: -.95, roll: .22, a0: -1.2, a1: -.8,
      az0: -.45, az1: .45, l0: 1.0, l1: .55, k0: 1.2, k1: 1.15 });
  } else if (state.motionState === 'recover') {
    const weight = Math.max(0, 1 - (state.motionTime ?? 0) / .6);
    Object.assign(target, { bob: -.22 * weight, lean: -.7 * weight, roll: .15 * weight,
      a0: -.5 * weight, a1: .65 * weight, l0: .65 * weight, l1: -.4 * weight,
      k0: 1.0 * weight, k1: .85 * weight });
  }
  if (!rig.pose) { rig.pose = { ...target }; rig.phase = 0; }
  else for (const key of Object.keys(target)) rig.pose[key] = THREE.MathUtils.lerp(
    Number.isFinite(rig.pose[key]) ? rig.pose[key] : target[key], target[key],
    1 - Math.exp(-(state.motionState === 'jumpOff' ? 9 : 16) * delta));
  const pose = rig.pose;
  rig.body.position.y = pose.bob; rig.body.position.z = pose.bodyZ; rig.body.rotation.x = pose.lean; rig.body.rotation.z = pose.roll;
  rig.arms[0].rotation.x = pose.a0; rig.arms[1].rotation.x = pose.a1;
  rig.arms[0].rotation.z = pose.az0; rig.arms[1].rotation.z = pose.az1;
  rig.legs[0].rotation.x = pose.l0; rig.legs[1].rotation.x = pose.l1;
  rig.knees[0].rotation.x = pose.k0; rig.knees[1].rotation.x = pose.k1;
}
