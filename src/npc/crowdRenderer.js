import * as THREE from 'three';
import { createStudent, animateStudent } from '../player/character.js';

const SHIRTS = [0xeab85e, 0x498f99, 0xb45e63, 0xe0dbc7, 0x638e69, 0x6986b8, 0xc18a55, 0x826b9c];
const SKINS = [0x9c633d, 0xb97b50, 0x835337, 0xc08c63];

/** Animated rigs are drawn as three instanced primitive batches. */
export class CrowdRenderer {
  constructor(agents) {
    this.agents = agents; this.time = 0; this.group = new THREE.Group(); this.group.name = 'campus-pedestrians';
    this.view = null; this.frustum = new THREE.Frustum(); this.projection = new THREE.Matrix4(); this.sphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
    this.renderedAgents = agents.length;
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
    this.slots = { box: [], head: [], hair: [] }; this.batches = {};
    agents.forEach((agent, index) => {
      const rig = createStudent({ palette: { shirt: SHIRTS[index % SHIRTS.length], skin: SKINS[index % SKINS.length], navy: index % 3 ? 0x304050 : 0x59504b, bag: index % 2 ? 0x6f5845 : 0x425e57 } });
      rig.group.scale.setScalar(.95 + (index % 4) * .025); agent.rig = rig;
      rig.group.traverse(mesh => {
        if (!mesh.isMesh) return;
        const p = mesh.geometry.parameters, type = mesh.geometry.type === 'BoxGeometry' ? 'box' : p.thetaLength < 3 ? 'hair' : 'head';
        const scale = type === 'box' ? [p.width, p.height, p.depth] : [p.radius, p.radius, p.radius];
        this.slots[type].push({ agent, mesh, color: mesh.material.color, scale: new THREE.Matrix4().makeScale(...scale), matrix: new THREE.Matrix4() });
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
  setView(view) { this.view = view; }
  update(dt) {
    this.time += Math.max(0, Math.min(dt, .1));
    const camera = this.view?.camera, viewer = this.view?.position;
    if (camera) { camera.updateMatrixWorld(); this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.projection); }
    this.renderedAgents = 0;
    for (const agent of this.agents) {
      const rig = agent.rig;
      const distance = viewer ? Math.hypot(agent.position.x - viewer.x, agent.position.z - viewer.z) : 0;
      this.sphere.center.copy(agent.position); this.sphere.center.y += .9;
      rig.renderActive = distance < 280 && (!camera || this.frustum.intersectsSphere(this.sphere));
      if (!rig.renderActive) continue;
      this.renderedAgents++;
      rig.animationElapsed = (rig.animationElapsed ?? 0) + Math.max(0, dt);
      const interval = distance < 80 ? 0 : distance < 160 ? .05 : .12;
      const animate = !dt || !rig.pose || rig.animationElapsed + 1e-6 >= interval;
      rig.group.position.copy(agent.position);
      const turnTowardVan = agent.lookYaw != null && (agent.reactionState === 'startled' || agent.yielding);
      const facing = turnTowardVan ? agent.lookYaw : agent.activityLookYaw ?? agent.yaw;
      const current = rig.renderYaw ?? agent.yaw;
      rig.renderYaw = current + Math.atan2(Math.sin(facing - current), Math.cos(facing - current))
        * (dt > 0 ? 1 - Math.exp(-7 * Math.min(dt, .1)) : 1);
      rig.group.rotation.y = rig.renderYaw;
      if (!animate) { rig.group.updateMatrixWorld(true); continue; }
      const animationDt = Math.min(.1, rig.animationElapsed); rig.animationElapsed = 0;
      const visualSpeed = Math.max(agent.speed, agent.avoidSpeed ?? 0);
      animateStudent(rig, { speed: visualSpeed, grounded: true, turnRate: agent.turnRate ?? 0, motionState: visualSpeed > .08 ? 'walk' : 'idle' }, this.time + agent.id * .47, animationDt);
      const state = agent.reactionState;
      const target = state === 'fallen' ? 1 : state === 'recover' ? Math.min(1, agent.reactionTime / Math.max(.01, agent.reactionDuration)) : 0;
      rig.reactionBlend = THREE.MathUtils.lerp(rig.reactionBlend ?? 0, target, dt > 0 ? 1 - Math.exp(-12 * Math.min(dt, .1)) : 1);
      const fallen = rig.reactionBlend;
      const startle = state === 'startled' ? Math.min(1, agent.reactionTime / .3) * (agent.reactionStrength ?? 1) : 0;
      const stumble = state === 'stumble' ? Math.sin((1 - agent.reactionTime / Math.max(.01, agent.reactionDuration)) * Math.PI) * (agent.reactionStrength ?? 1) : 0;
      rig.body.position.y += fallen * .23 - stumble * .045;
      rig.body.rotation.x += stumble * .36;
      rig.body.rotation.z += fallen * 1.28 + stumble * .18;
      rig.arms[0].rotation.x -= startle * .8 + stumble * .55;
      rig.arms[1].rotation.x -= startle * .9 + stumble * .35;
      rig.arms[0].rotation.z = -.045 - startle * .55 - fallen * .6;
      rig.arms[1].rotation.z = .045 + startle * .55 + fallen * .4;
      rig.legs[0].rotation.x += stumble * .4 - fallen * .35;
      rig.legs[1].rotation.x -= stumble * .35 - fallen * .25;
      rig.knees[0].rotation.x += fallen * .6;
      rig.knees[1].rotation.x += fallen * .5;
      if (agent.behavior === 'conversation' && !agent.reactionTime && !agent.yielding) {
        const gesture = Math.sin(this.time * 2.3 + agent.id) * .14;
        rig.arms[agent.id % 2].rotation.x -= .45 + gesture;
        rig.arms[agent.id % 2].rotation.z += (agent.id % 2 ? 1 : -1) * .14;
      }
      const look = agent.lookYaw == null ? 0 : Math.atan2(Math.sin(agent.lookYaw - rig.renderYaw), Math.cos(agent.lookYaw - rig.renderYaw));
      rig.lookAngle = THREE.MathUtils.lerp(rig.lookAngle ?? 0, THREE.MathUtils.clamp(look, -.7, .7), dt > 0 ? 1 - Math.exp(-8 * Math.min(dt, .1)) : 1);
      rig.head.rotation.y = rig.hair.rotation.y = rig.lookAngle;
      rig.group.updateMatrixWorld(true);
    }
    for (const [type, slots] of Object.entries(this.slots)) {
      const batch = this.batches[type];
      let index = 0;
      for (const slot of slots) {
        if (!slot.agent.rig.renderActive) continue;
        slot.matrix.multiplyMatrices(slot.mesh.matrixWorld, slot.scale);
        batch.setMatrixAt(index, slot.matrix); batch.setColorAt(index++, slot.color);
      }
      batch.count = index; batch.visible = index > 0;
      batch.instanceMatrix.needsUpdate = true; if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      if (index) batch.computeBoundingSphere();
    }
  }
  dispose() {
    const geometries = new Set(), materials = new Set([this.material]);
    for (const a of this.agents) a.rig.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    Object.values(this.batches).forEach(batch => geometries.add(batch.geometry));
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.group.clear();
  }
}
