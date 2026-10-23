import * as THREE from 'three';
import { createStudent } from '../player/character.js';

const SHIRTS = [0xe5d7ac, 0x4b858b, 0xa95f55, 0x709364, 0xd6a85a, 0x687caa, 0x886c9b, 0xc2c5aa];
const SKINS = [0x9c633d, 0xb97b50, 0x835337, 0xc08c63];
const DRIVER_ROOT = new THREE.Vector3(0, .67, -.43);
// The student's hip is .77 m above the rig origin. Both thighs and shoes stay on the deck.
const PASSENGER_ROOT = new THREE.Vector3(0, .065, .9);

export function passengerWorldPosition(van, target = new THREE.Vector3()) {
  // Physics can advance between rendered frames; keep the seat transform current.
  if (van.position) van.group.position.copy(van.position);
  if (Number.isFinite(van.yaw)) van.group.rotation.set(0, van.yaw, 0);
  const body = van.model?.body ?? van.group; body.updateWorldMatrix(true, false);
  return body.localToWorld(target.copy(PASSENGER_ROOT));
}

/** Pose the existing student rig as a seated occupant, without changing its geometry. */
export function poseSeatedStudent(rig, { driver = false, steering = 0 } = {}) {
  rig.pose = null;
  const lean = driver ? -.55 : .075;
  // Rotate around the hip at local Y=.77, so the saddle/deck remains under it.
  rig.body.position.set(0, .77 * (1 - Math.cos(lean)), -.77 * Math.sin(lean));
  rig.body.rotation.set(lean, driver ? THREE.MathUtils.clamp(steering * .1, -.05, .05) : 0, 0);
  for (let side = 0; side < 2; side++) {
    const arm = rig.arms[side], leg = rig.legs[side], knee = rig.knees[side];
    arm.rotation.set(driver ? 1.38 + (side ? -steering : steering) * .08 : .16, 0, driver ? (side ? .22 : -.22) : (side ? .08 : -.08));
    leg.rotation.set(driver ? 1.15 : 1.47, 0, side ? .035 : -.035);
    knee.rotation.set(driver ? -1.16 : -.05, 0, 0);
  }
}

/** Eight permanent visible drivers share only three draw calls. */
export class VanOccupants {
  constructor(vans, player, { render = true } = {}) {
    this.vans = Array.from(vans);
    this.player = player;
    this.group = new THREE.Group();
    this.group.name = 'van-occupants';
    this.drivers = [];
    this.batches = {};
    this.slots = { box: [], head: [], hair: [] };
    this.wasDriving = false;
    this.render = render;

    if (render) {
      this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
      for (let index = 0; index < this.vans.length; index++) {
        const rig = createStudent({ palette: {
          shirt: SHIRTS[index % SHIRTS.length], skin: SKINS[index % SKINS.length],
          navy: index % 3 ? 0x304050 : 0x59504b, bag: index % 2 ? 0x6f5845 : 0x425e57,
        } });
        rig.group.position.copy(DRIVER_ROOT);
        this.drivers.push(rig);
        rig.group.traverse(mesh => {
          if (!mesh.isMesh) return;
          const p = mesh.geometry.parameters;
          const type = mesh.geometry.type === 'BoxGeometry' ? 'box' : p.thetaLength < 3 ? 'hair' : 'head';
          const size = type === 'box' ? [p.width, p.height, p.depth] : [p.radius, p.radius, p.radius];
          this.slots[type].push({ driver: index, mesh, scale: new THREE.Matrix4().makeScale(...size), matrix: new THREE.Matrix4() });
        });
      }
      const geometries = {
        box: new THREE.BoxGeometry(1, 1, 1),
        head: new THREE.SphereGeometry(1, 8, 6),
        hair: new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI * .48),
      };
      for (const type of Object.keys(this.slots)) {
        const batch = new THREE.InstancedMesh(geometries[type], this.material, this.slots[type].length);
        batch.name = `van-driver-${type}-instances`;
        batch.castShadow = batch.receiveShadow = true;
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.slots[type].forEach((slot, i) => batch.setColorAt(i, slot.mesh.material.color));
        this.batches[type] = batch;
        this.group.add(batch);
      }
      // The rigs are only transform hierarchies; their individual meshes never reach the GPU.
      const unusedGeometries = new Set(), unusedMaterials = new Set();
      for (const rig of this.drivers) rig.group.traverse(o => {
        if (o.geometry) unusedGeometries.add(o.geometry);
        if (o.material) unusedMaterials.add(o.material);
      });
      unusedGeometries.forEach(g => g.dispose());
      unusedMaterials.forEach(m => m.dispose());
    }
    this.update(0, { driving: false });
  }

  update(dt, session) {
    if (this.render) {
      for (let index = 0; index < this.drivers.length; index++) {
        const van = this.vans[index], rig = this.drivers[index];
        poseSeatedStudent(rig, { driver: true, steering: van.steering ?? 0 });
        rig.group.updateMatrixWorld(true);
        (van.model?.body ?? van.group).updateWorldMatrix(true, false);
      }
      for (const [type, slots] of Object.entries(this.slots)) {
        const batch = this.batches[type];
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          const body = this.vans[slot.driver].model?.body ?? this.vans[slot.driver].group;
          slot.matrix.multiplyMatrices(body.matrixWorld, slot.mesh.matrixWorld).multiply(slot.scale);
          batch.setMatrixAt(i, slot.matrix);
        }
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingSphere();
      }
    }

    if (session?.driving && session.van) {
      const body = session.van.model?.body ?? session.van.group;
      body.updateWorldMatrix(true, false);
      passengerWorldPosition(session.van, this.player.group.position);
      body.getWorldQuaternion(this.player.group.quaternion);
      this.player.group.visible = true;
      poseSeatedStudent(this.player.rig);
      this.wasDriving = true;
    } else if (this.wasDriving && !this.player.dismount) {
      // On-foot animation owns the rig again after the first dismounted frame.
      this.player.rig.pose = null;
      this.player.rig.body.position.set(0, 0, 0);
      this.player.rig.body.rotation.set(0, 0, 0);
      for (const limb of [...this.player.rig.arms, ...this.player.rig.legs, ...this.player.rig.knees]) limb.rotation.set(0, 0, 0);
      this.wasDriving = false;
    } else if (!session?.driving) {
      this.wasDriving = false;
    }
  }

  dispose() {
    for (const batch of Object.values(this.batches)) batch.geometry.dispose();
    this.material?.dispose();
    this.group.clear();
  }
}
