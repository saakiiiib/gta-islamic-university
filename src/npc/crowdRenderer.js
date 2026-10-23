import * as THREE from 'three';
import { createStudent, animateStudent } from '../player/character.js';

const SHIRTS = [0xeab85e, 0x498f99, 0xb45e63, 0xe0dbc7, 0x638e69, 0x6986b8, 0xc18a55, 0x826b9c];
const SKINS = [0x9c633d, 0xb97b50, 0x835337, 0xc08c63];

/** Twelve animated rigs are drawn as three instanced primitive batches. */
export class CrowdRenderer {
  constructor(agents) {
    this.agents = agents; this.time = 0; this.group = new THREE.Group(); this.group.name = 'campus-pedestrians';
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
    this.slots = { box: [], head: [], hair: [] }; this.batches = {};
    agents.forEach((agent, index) => {
      const rig = createStudent({ palette: { shirt: SHIRTS[index % SHIRTS.length], skin: SKINS[index % SKINS.length], navy: index % 3 ? 0x304050 : 0x59504b, bag: index % 2 ? 0x6f5845 : 0x425e57 } });
      rig.group.scale.setScalar(.95 + (index % 4) * .025); agent.rig = rig;
      rig.group.traverse(mesh => {
        if (!mesh.isMesh) return;
        const p = mesh.geometry.parameters, type = mesh.geometry.type === 'BoxGeometry' ? 'box' : p.thetaLength < 3 ? 'hair' : 'head';
        const scale = type === 'box' ? [p.width, p.height, p.depth] : [p.radius, p.radius, p.radius];
        this.slots[type].push({ mesh, scale: new THREE.Matrix4().makeScale(...scale), matrix: new THREE.Matrix4() });
      });
    });
    const geometries = { box: new THREE.BoxGeometry(1, 1, 1), head: new THREE.SphereGeometry(1, 8, 6), hair: new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI * .48) };
    for (const type of Object.keys(this.slots)) {
      const batch = new THREE.InstancedMesh(geometries[type], this.material, this.slots[type].length);
      batch.name = `pedestrian-${type}-instances`; batch.castShadow = batch.receiveShadow = true;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.slots[type].forEach((slot, i) => batch.setColorAt(i, slot.mesh.material.color));
      this.batches[type] = batch; this.group.add(batch);
    }
    this.update(0);
  }
  update(dt) {
    this.time += Math.max(0, Math.min(dt, .1));
    for (const agent of this.agents) {
      const rig = agent.rig;
      rig.group.position.copy(agent.position); rig.group.rotation.y = agent.yaw;
      animateStudent(rig, { speed: agent.speed, grounded: true, turnRate: agent.turnRate ?? 0, motionState: agent.speed > .08 ? 'walk' : 'idle' }, this.time + agent.id * .47, dt);
      rig.group.updateMatrixWorld(true);
    }
    for (const [type, slots] of Object.entries(this.slots)) {
      const batch = this.batches[type];
      slots.forEach((slot, i) => { slot.matrix.multiplyMatrices(slot.mesh.matrixWorld, slot.scale); batch.setMatrixAt(i, slot.matrix); });
      batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere();
    }
  }
  dispose() {
    const geometries = new Set(), materials = new Set([this.material]);
    for (const a of this.agents) a.rig.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    Object.values(this.batches).forEach(batch => geometries.add(batch.geometry));
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.group.clear();
  }
}
