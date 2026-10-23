import { buildingPalette } from '../world/appearance.js';
import { isWalking } from '../world/roads.js';
const GREEN = { forest: '#587b58', wood: '#587b58', orchard: '#829c63', garden: '#74985f', park: '#87a777', pitch: '#b3bc88' };

export function mapToMinimap([x, z], center, span = 280, size = 256) {
  return { x: (x - center.x) / span * size + size / 2, y: (z - center.z) / span * size + size / 2 };
}
export function nearestPlace(position, mapData) {
  let name = 'Islamic University', distance = 110;
  const gate = Math.hypot(position.x - mapData.spawn.x, position.z - mapData.spawn.z);
  if (gate < 55) return 'Main Gate';
  for (const feature of [...mapData.buildings, ...mapData.greens, ...mapData.water]) {
    if (!feature.name || !feature.polygons?.[0]?.[0]?.length) continue;
    const ring = feature.polygons[0][0];
    const x = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
    const z = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    const d = Math.hypot(x - position.x, z - position.z);
    if (d < distance) { name = feature.name; distance = d; }
  }
  return name;
}

export class Minimap {
  constructor(canvas, data) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.data = data;
    this.span = 280; this.size = canvas.width;
    this.base = document.createElement('canvas');
    this.base.width = 1536;
    const b = data.bounds;
    this.base.height = Math.round(1536 * (b.maxZ - b.minZ) / (b.maxX - b.minX));
    this.paintBase();
  }
  paintBase() {
    const g = this.base.getContext('2d'), b = this.data.bounds;
    const sx = this.base.width / (b.maxX - b.minX), sz = this.base.height / (b.maxZ - b.minZ);
    g.fillStyle = '#a7b28b'; g.fillRect(0, 0, this.base.width, this.base.height);
    const draw = (polygons, color, stroke) => {
      if (!polygons?.length) return;
      g.beginPath();
      for (const polygon of polygons) for (const ring of polygon) {
        ring.forEach(([x, z], i) => { const u = (x - b.minX) * sx, v = (z - b.minZ) * sz; i ? g.lineTo(u, v) : g.moveTo(u, v); });
        g.closePath();
      }
      g.fillStyle = color; g.fill('evenodd');
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.2; g.stroke(); }
    };
    draw(this.data.campus.polygons, '#b2bf93', '#d9dec2');
    for (const green of this.data.greens) draw(green.polygons, GREEN[green.kind] || '#a4b980');
    for (const water of this.data.water) draw(water.polygons, '#559b9f', '#377e82');
    for (const road of this.data.roads.filter(isWalking)) draw(road.polygons, '#ddcba5');
    for (const road of this.data.roads.filter(r => !isWalking(r))) draw(road.polygons, '#475253');
    for (const bridge of this.data.bridges) draw(bridge.polygons, '#e0c68b');
    for (const building of this.data.buildings) draw(building.polygons, buildingPalette(building).map, '#596052');
    g.fillStyle = '#547447';
    for (const tree of this.data.trees) { g.beginPath(); g.arc((tree.x - b.minX) * sx, (tree.z - b.minZ) * sz, 4, 0, Math.PI * 2); g.fill(); }
  }
  draw(position, yaw) {
    const g = this.ctx, b = this.data.bounds, n = this.size, half = this.span / 2;
    const sx = this.base.width / (b.maxX - b.minX), sz = this.base.height / (b.maxZ - b.minZ);
    g.fillStyle = '#b9c49b'; g.fillRect(0, 0, n, n);
    // Keep the map north-up: negative world Z always points toward the top.
    g.drawImage(this.base, (position.x - half - b.minX) * sx, (position.z - half - b.minZ) * sz,
      this.span * sx, this.span * sz, 0, 0, n, n);
    g.strokeStyle = '#244b3e12'; g.lineWidth = 1;
    for (let p = n / 4; p < n; p += n / 4) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, n); g.moveTo(0, p); g.lineTo(n, p); g.stroke(); }
    const gate = mapToMinimap([this.data.spawn.x, this.data.spawn.z], position, this.span, n);
    if (gate.x > 15 && gate.x < n - 15 && gate.y > 15 && gate.y < n - 15) {
      g.strokeStyle = '#244b3e'; g.lineWidth = 1.5; g.strokeRect(gate.x - 4, gate.y - 4, 8, 8);
    }
    g.save(); g.translate(n / 2, n / 2); g.rotate(-yaw);
    g.shadowColor = '#182c2560'; g.shadowBlur = 7;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath();
    g.fillStyle = '#f4c064'; g.fill(); g.shadowBlur = 0; g.strokeStyle = '#20382c'; g.lineWidth = 2; g.stroke(); g.restore();
  }
}
