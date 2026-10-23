import { Minimap, nearestPlace } from './minimap.js';
const $ = id => document.getElementById(id);
export class HUD {
  constructor(data) {
    this.data = data; this.map = new Minimap($('minimap'), data); this.accumulated = 1;
    this.toastUntil = 0; this.debug = false;
    $('building-count').textContent = data.buildings.length;
  }
  update(dt, player, renderer, fps, { inspection = false } = {}) {
    this.accumulated += dt;
    if (this.accumulated < .1) return;
    this.accumulated = 0;
    const p = player.position;
    this.map.draw(p, player.yaw);
    $('location-name').textContent = nearestPlace(p, this.data);
    $('coordinates').textContent = `${Math.abs(p.x).toFixed(0)} ${p.x >= 0 ? 'E' : 'W'} · ${Math.abs(p.z).toFixed(0)} ${p.z <= 0 ? 'N' : 'S'}`;
    $('speed').textContent = inspection ? '0.0' : player.speed.toFixed(1);
    $('movement-state').textContent = inspection ? 'STUDENT PAUSED · CAMPUS VIEW' : !player.grounded ? 'IN THE AIR' : player.speed > 4.5 ? 'SPRINTING' : player.speed > .2 ? 'EXPLORING' : 'TAKING IT IN';
    const scale = document.querySelector('.map-caption i');
    scale.style.width = `${$('minimap').clientWidth * 100 / this.map.span}px`;
    if (this.toastUntil && performance.now() > this.toastUntil) { $('toast').hidden = true; this.toastUntil = 0; }
    if (this.debug) $('debug-text').textContent = [
      `GTA Islamic University · PHASE 1.5 · ${inspection ? 'INSPECTION' : 'STUDENT'}`,
      `FPS ${fps.toFixed(0)} · draw calls ${renderer.info.render.calls} · triangles ${renderer.info.render.triangles.toLocaleString()}`,
      `Position ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} m`,
      `Grounded ${player.grounded} · speed ${player.speed.toFixed(2)} m/s`,
      `Buildings ${this.data.buildings.length} · roads ${this.data.roads.length} · bridge ${this.data.bridges.length}`,
      `Map warnings ${this.data.diagnostics.warnings.length} · repairs ${this.data.diagnostics.repairs.length}`,
      `Water blocks movement; the mapped bridge remains walkable.`,
      `F3 hides this panel.`,
    ].join('\n');
  }
  toast(message, duration = 4500) {
    $('toast').textContent = message; $('toast').hidden = false;
    this.toastUntil = performance.now() + duration;
    $('announcer').textContent = message;
  }
  toggleDebug() { this.debug = !this.debug; $('debug-panel').hidden = !this.debug; }
}
