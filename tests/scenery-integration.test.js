import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { PlayerController } from '../src/player/controller.js';
import { ThirdPersonCamera } from '../src/player/camera.js';
import { CollisionWorld } from '../src/player/collision.js';
import { CampusVisibility } from '../src/activity/visibility.js';

const bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const obstacle = { id: 'bench', kind: 'bench', polygon: [[-1,-2],[1,-2],[1,-1],[-1,-1],[-1,-2]], height: .9 };
function box(group, x, y, z, width, height, depth) {
  const mesh = new Mesh(new BoxGeometry(width,height,depth),new MeshBasicMaterial());
  mesh.position.set(x,y,z); group.add(mesh); return mesh;
}
test('scenery obstacles block disc, segment and van footprint without editing source map', () => {
  const map = { bounds }, before = JSON.stringify(map), queries = new CampusQueries(map, { obstacles: [obstacle] });
  assert.equal(queries.discClear(0,-1.5), false);
  assert.equal(queries.segmentClear([0,0],[0,-3]), false);
  assert.equal(queries.rectangleClear({x:0,z:0},0), false);
  assert.equal(queries.discClear(4,-1.5), true);
  assert.equal(JSON.stringify(map), before);
  queries.setSceneryObstacles([]); assert.equal(queries.segmentClear([0,0],[0,-3]), true);
});
test('solid scenery remains in the capsule solver when live van obstacles refresh', () => {
  const mapGroup = new Group(), scenery = new Group();
  box(mapGroup,0,-.5,0,100,1,100); box(scenery,0,1,-1.5,3,2,.3);
  const player = new PlayerController({ collisionGroup: mapGroup, sceneryCollisionGroup: scenery, mapData: {bounds,spawn:{x:0,y:0,z:0,yaw:0}} });
  player.setVanObstacles([]);
  for(let i=0;i<90;i++) player.update(1/60,{forward:true});
  assert.ok(player.position.z > -1.1, `wall stopped capsule at ${player.position.z}`);
  assert.ok(player.grounded); player.dispose();
});
test('camera obstruction includes separate scenery, and visibility rejects walls and offscreen actors', () => {
  const walls = new Group(); box(walls,0,2,3,3,4,.3);
  walls.updateMatrixWorld(true);
  const camera = new PerspectiveCamera(60,1.6,.08,100), chase = new ThirdPersonCamera(camera,walls);
  chase.reset({x:0,z:0,yaw:0}); assert.ok(chase.currentDistance < 3.2);
  camera.position.set(0,2,8); camera.lookAt(0,1,0); camera.updateMatrixWorld();
  const visibility = new CampusVisibility([new CollisionWorld(walls)]); visibility.prepare(camera);
  assert.equal(visibility.isVisible({x:0,y:0,z:0}),false);
  assert.equal(visibility.isVisible({x:0,y:0,z:6}),true);
  assert.equal(visibility.isVisible({x:100,y:0,z:0}),false);
  const sim = { crowd:{agents:[{position:new Vector3(0,0,0)},{position:new Vector3(0,0,6)}]},vans:[] };
  const stats = visibility.sample(.2,sim,new Vector3());
  assert.equal(stats.npcNearby,2); assert.equal(stats.npcVisible,1); assert.equal(stats.vanMoving,0);
});
