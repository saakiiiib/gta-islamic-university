import * as THREE from 'three';

/** An original, metre-scaled student. The root origin is at the soles. */
export function createStudent() {
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
  return { group, body, arms, legs, knees };
}

export function animateStudent(rig, state, time) {
  const moving = state.speed > 0.08;
  const running = state.speed > 4.5;
  const cycle = time * (running ? 13 : 8.5);
  const stride = Math.min(state.speed / 3.8, 1) * (running ? 0.8 : 0.52);
  const swing = Math.sin(cycle) * stride;
  rig.body.position.y = state.grounded ? (moving ? Math.abs(Math.sin(cycle)) * (running ? 0.045 : 0.023) : Math.sin(time * 2) * 0.006) : 0;
  rig.body.rotation.x = running && state.grounded ? -0.09 : 0;
  rig.arms[0].rotation.x = state.grounded ? -swing * 0.85 : -0.55;
  rig.arms[1].rotation.x = state.grounded ? swing * 0.85 : -0.55;
  rig.legs[0].rotation.x = state.grounded ? swing : -0.25;
  rig.legs[1].rotation.x = state.grounded ? -swing : 0.2;
  rig.knees[0].rotation.x = state.grounded ? Math.max(0, -Math.sin(cycle)) * stride * 0.7 : 0.45;
  rig.knees[1].rotation.x = state.grounded ? Math.max(0, Math.sin(cycle)) * stride * 0.7 : 0.3;
}
