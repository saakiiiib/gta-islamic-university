import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData, pointInMultiPolygon } from '../src/map/index.js';
import { buildWorld, bridgeHeightAt } from '../src/world/index.js';
import { PlayerController, isWaterBlocked } from '../src/player/index.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const world = buildWorld(map);
const settle = player => { for (let i = 0; i < 45; i++) player.update(1 / 60, {}, 0); };
const createPlayer = () => new PlayerController({ collisionGroup: world.collisionGroup, mapData: map });

function walkTo(player, target, maxFrames = 1800) {
  let maxHeight = player.position.y;
  for (let i = 0; i < maxFrames; i++) {
    const dx = target[0] - player.position.x, dz = target[1] - player.position.z;
    if (Math.hypot(dx, dz) < .11) return { reached: true, maxHeight };
    player.update(1 / 60, { forward: true }, Math.atan2(-dx, -dz));
    maxHeight = Math.max(maxHeight, player.position.y);
  }
  return { reached: false, maxHeight };
}

test('actual Main Gate spawn settles on ground and walks inward at human scale', () => {
  const player = createPlayer(); settle(player);
  assert.ok(player.grounded);
  assert.ok(Math.abs(player.position.y) < .005);
  const start = player.position.clone();
  for (let i = 0; i < 120; i++) player.update(1 / 60, { forward: true }, map.spawn.yaw);
  const distance = player.position.distanceTo(start);
  assert.ok(distance > 6.8 && distance < 7.8, `walked ${distance} metres`);
  assert.ok(player.position.x < start.x && player.position.z < start.z);
  assert.equal(map.buildings.some(building => pointInMultiPolygon([player.position.x, player.position.z], building.polygons)), false);
  player.dispose();
});

test('actual lake bridge supports traversal from one mapped shore to the other', () => {
  const player = createPlayer(), bridge = map.bridges.find(item => item.id === '1317423268');
  const path = bridge.paths[0], first = path[0], next = path[1], last = path.at(-1), prior = path.at(-2);
  const incoming = Math.hypot(next[0] - first[0], next[1] - first[1]);
  const outgoing = Math.hypot(last[0] - prior[0], last[1] - prior[1]);
  player.reset({ x: first[0] - (next[0] - first[0]) / incoming * .8, z: first[1] - (next[1] - first[1]) / incoming * .8, y: 0, yaw: 0 });
  settle(player);
  let maxHeight = 0;
  for (const target of [...path, [last[0] + (last[0] - prior[0]) / outgoing, last[1] + (last[1] - prior[1]) / outgoing]]) {
    const result = walkTo(player, target);
    assert.ok(result.reached, `blocked approaching ${target}, stopped at ${player.position.toArray()}`);
    maxHeight = Math.max(maxHeight, result.maxHeight);
  }
  assert.ok(maxHeight >= .4 && maxHeight < .6, `deck height reached ${maxHeight}`);
  assert.ok(player.grounded);
  settle(player); assert.ok(player.position.y < .05);
  player.dispose();
});

test('real bridge corridor overrides water while adjacent lake remains blocked', () => {
  const bridge = map.bridges[0], path = bridge.paths[0], a = path[1], b = path[2];
  const x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  assert.ok(bridgeHeightAt(x, z, map.bridges) >= .4);
  assert.equal(isWaterBlocked(x, z, map, .32), false);
  assert.equal(isWaterBlocked(x - (b[1] - a[1]) / length * 3, z + (b[0] - a[0]) / length * 3, map, .32), true);
});

test('the repaired real courtyard remains open to ground-level physics', () => {
  const building = map.buildings.find(item => item.id === '18079382');
  assert.ok(building, 'Rabindro Najrul Arts Building relation is preserved');
  const hole = building.polygons[0][1];
  const point = hole.slice(0, -1).reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0]).map(v => v / (hole.length - 1));
  assert.equal(pointInMultiPolygon(point, building.polygons), false);
  const player = createPlayer(); player.reset({ x: point[0], z: point[1], y: 1, yaw: 0 }); settle(player);
  assert.ok(player.grounded); assert.ok(player.position.y < .02, `courtyard floor at ${player.position.y}`);
  player.dispose();
});
