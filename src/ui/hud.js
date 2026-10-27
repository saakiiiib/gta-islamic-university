import { Minimap, nearestPlace } from './minimap.js';
const $ = id => document.getElementById(id);
export class HUD {
  constructor(data, { touch = false } = {}) {
    this.touch = touch;
    this.data = data; this.map = new Minimap($('minimap'), data); this.accumulated = 1;
    this.toastUntil = 0; this.debug = false;
    $('building-count').textContent = data.buildings.length;
  }
  update(dt, player, renderer, fps, { inspection = false, simulation, visibility = {} } = {}) {
    this.accumulated += dt;
    if (this.accumulated < .1) return;
    this.accumulated = 0;
    const p = player.position;
    const driving = !!player.driving;
    this.map.draw(p, player.yaw, { vans: simulation?.session?.allVehicles ?? simulation?.vans, van: simulation?.van, ambulance: simulation?.ambulance, pedestrians: simulation?.crowd.agents, driving });
    $('location-name').textContent = nearestPlace(p, this.data);
    $('coordinates').textContent = `${Math.abs(p.x).toFixed(0)} ${p.x >= 0 ? 'E' : 'W'} · ${Math.abs(p.z).toFixed(0)} ${p.z <= 0 ? 'N' : 'S'}`;
    $('speed').textContent = inspection ? '0' : driving ? (player.speed * 3.6).toFixed(0) : player.speed.toFixed(1);
    $('travel-mode').textContent = driving ? 'ELECTRIC VAN' : 'ON FOOT';
    $('speed-unit').textContent = driving ? 'KM / H' : 'METRES / SECOND';
    $('movement-state').textContent = inspection ? 'CAMPUS VIEW · SIMULATION PAUSED' : driving ? player.disabled ? 'VAN DISABLED · E TO STEP OFF' : player.reversing ? 'REVERSING · PASSENGER' : player.speed > .1 ? 'RIDING BEHIND THE DRIVER' : 'PARKED · PASSENGER' : !player.grounded ? 'IN THE AIR' : player.state?.motionState === 'land' ? 'LANDING' : player.speed > 4.5 ? 'SPRINTING' : player.speed > .2 ? 'EXPLORING' : 'TAKING IT IN';
    $('foot-controls').hidden = driving; $('van-controls').hidden = !driving;
    const character = simulation?.player, motion = character?.state.motionState;
    $('player-health-card').hidden = inspection;
    $('player-health').value = character?.health ?? 100;
    $('player-health-label').textContent = `YOU · ${Math.round(character?.health ?? 100)} HP${['jumpOff','stumble','fallen','recover'].includes(motion) ? ` · ${motion === 'jumpOff' ? 'JUMPING OFF' : motion.toUpperCase()}` : ''}`;
    let hint = simulation?.session.hint ?? '';
    if (this.touch && hint) hint = driving ? 'Tap EXIT to jump off · Fast landings can hurt' : 'Tap ENTER to ride behind the driver';
    $('interaction-prompt').hidden = inspection || !hint;
    $('interaction-text').textContent = hint;
    const van = simulation?.van;
    $('vehicle-guide').hidden = inspection || driving || !van;
    if (van) $('vehicle-guide').textContent = `⚡ ELECTRIC VAN · ${Math.round(Math.hypot(van.position.x - p.x, van.position.z - p.z))} m`;
    const nearVan = van && Math.hypot(van.position.x - p.x, van.position.z - p.z) < 7;
    $('durability-card').hidden = inspection || !(driving || nearVan);
    if (van) {
      $('durability').value = van.durability;
      $('durability-label').textContent = `VAN ${(van.id ?? 0) + 1} · ${van.disabled ? 'DISABLED' : `${Math.round(van.durability)}% DURABILITY`}`;
      $('durability-card').classList.toggle('damaged', van.durability < 35);
    }
    const collision = simulation?.lastCollision;
    const injured = collision && simulation.impacts.time - collision.time < 8 ? simulation.crowd.agents.find(a => a.id === collision.npcId) : null;
    $('pedestrian-health').hidden = inspection || !injured;
    if (injured) {
      $('health').value = injured.health;
      $('pedestrian-status').textContent = `STUDENT ${String(injured.id + 1).padStart(2, '0')} · ${Math.round(injured.health)} HP · ${injured.reactionState.toUpperCase()}`;
    }
    const scale = document.querySelector('.map-caption i');
    scale.style.width = `${$('minimap').clientWidth * 100 / this.map.span}px`;
    if (this.toastUntil && performance.now() > this.toastUntil) { $('toast').hidden = true; this.toastUntil = 0; }
    if (this.debug) $('debug-text').textContent = [
      `GTA Islamic University · LIVING CAMPUS · ${inspection ? 'INSPECTION' : driving ? 'ELECTRIC VAN' : 'STUDENT'}`,
      `FPS ${fps.toFixed(0)} · draw calls ${renderer.info.render.calls} · triangles ${renderer.info.render.triangles.toLocaleString()}`,
      `Position ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} m`,
      `Grounded ${player.grounded} · speed ${player.speed.toFixed(2)} m/s`,
      `Buildings ${this.data.buildings.length} · roads ${this.data.roads.length} · bridge ${this.data.bridges.length}`,
      `Map warnings ${this.data.diagnostics.warnings.length} · repairs ${this.data.diagnostics.repairs.length}`,
      `Vans ${simulation?.vans.length ?? 0} · pedestrians ${simulation?.crowd.agents.length ?? 0} · durability ${Math.round(van?.durability ?? 100)}%`,
      `NPCs nearby (80m) ${visibility.npcNearby ?? '—'} · visible estimate (160m) ${visibility.npcVisible ?? '—'}`,
      `Vans nearby ${visibility.vanNearby ?? '—'} · visible estimate ${visibility.vanVisible ?? '—'} · moving ${visibility.vanMoving ?? '—'}`,
      `Traffic parked ${visibility.vanParked ?? '—'} · yielding ${visibility.vanYielding ?? '—'}`,
      `Activity: ${simulation?.crowd.activity?.primary?.name ?? simulation?.crowd.stats?.primaryHub ?? 'Campus approaches'}`,
      `Walking ${simulation?.crowd.stats?.walking ?? 0} · paired students ${simulation?.crowd.stats?.pairs ?? 0} · chatting ${simulation?.crowd.stats?.conversation ?? 0} · waiting ${simulation?.crowd.stats?.waiting ?? 0}`,
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
