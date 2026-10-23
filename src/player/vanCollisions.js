import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { CollisionWorld } from './collision.js';

// The same two simple volumes used by ElectricVan.createParkedCollider().
// Keep one local-space octree and move the capsule into each van's frame.
const proxy = new Group();
const material = new MeshBasicMaterial();
for (const [size, center] of [
  [[1.58, .88, 1.74], [0, .44, .92]],
  [[.46, 1.22, 1.5], [0, .61, -.72]],
]) {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.position.set(...center);
  proxy.add(mesh);
}
const localWorld = new CollisionWorld(proxy);
for (const mesh of proxy.children) mesh.geometry.dispose();
material.dispose();

function toLocal(point, van, cosine, sine) {
  const x = point.x - van.position.x, z = point.z - van.position.z;
  return new Vector3(cosine * x - sine * z, point.y - van.position.y, sine * x + cosine * z);
}
function toWorld(point, van, cosine, sine) {
  return new Vector3(van.position.x + cosine * point.x + sine * point.z,
    van.position.y + point.y, van.position.z - sine * point.x + cosine * point.z);
}

/** Resolve against a live van, including its current heading and forward motion. */
export function resolveVanCapsule(capsule, velocity, van) {
  if (!van?.position) return { grounded: false, impact: 0 };
  const yaw = van.yaw ?? 0, cosine = Math.cos(yaw), sine = Math.sin(yaw);
  const local = new Capsule(toLocal(capsule.start, van, cosine, sine), toLocal(capsule.end, van, cosine, sine), capsule.radius);
  const speed = Number.isFinite(van.speed) ? van.speed : 0;
  const vanVX = -sine * speed, vanVZ = -cosine * speed;
  const relativeX = velocity.x - vanVX, relativeZ = velocity.z - vanVZ;
  const localVelocity = new Vector3(cosine * relativeX - sine * relativeZ, velocity.y,
    sine * relativeX + cosine * relativeZ);
  const before = localVelocity.clone();
  const grounded = localWorld.resolve(local, localVelocity);
  capsule.start.copy(toWorld(local.start, van, cosine, sine));
  capsule.end.copy(toWorld(local.end, van, cosine, sine));
  velocity.set(cosine * localVelocity.x + sine * localVelocity.z + vanVX,
    localVelocity.y, -sine * localVelocity.x + cosine * localVelocity.z + vanVZ);
  const impact = Math.max(0, before.length() - localVelocity.length());
  return { grounded, impact };
}
