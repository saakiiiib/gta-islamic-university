import { Raycaster, Vector3 } from 'three';

export const rectanglesOverlap = (a, b, gap = 6) => a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;

/** Pure selection/layout is also used by the tests; all names come from map metadata. */
export function selectLabels(anchors, camera, player, { width, height, inspection = false, avoid = [], occluded = () => false } = {}) {
  const forward = new Vector3(); camera.getWorldDirection(forward);
  const candidates = [];
  for (const anchor of anchors) {
    const distance = Math.hypot(anchor.x - player.x, anchor.z - player.z);
    if (!inspection && distance > 300) continue;
    const world = new Vector3(anchor.x, anchor.y, anchor.z);
    if (world.clone().sub(camera.position).dot(forward) <= 0) continue;
    const p = world.clone().project(camera);
    if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
    const labelWidth = Math.min(260, Math.max(110, anchor.name.length * 6.1 + 24));
    const labelHeight = anchor.name.length * 6.1 > 236 ? 54 : 40;
    const x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
    const rect = { left: x - labelWidth / 2, top: y - labelHeight, right: x + labelWidth / 2, bottom: y };
    if (rect.left < 8 || rect.right > width - 8 || rect.top < 8 || rect.bottom > height - 12 || avoid.some(a => rectanglesOverlap(rect, a))) continue;
    candidates.push({ anchor, x, y, width: labelWidth, rect, distance, opacity: inspection ? .96 : Math.max(.25, Math.min(1, (325 - distance) / 120)) });
  }
  candidates.sort((a, b) => (inspection ? (a.anchor.kind === 'building' ? 0 : 50) - (b.anchor.kind === 'building' ? 0 : 50) : 0) || a.distance - b.distance || a.anchor.id.localeCompare(b.anchor.id));
  const selected = [], maximum = inspection ? 18 : 6;
  for (const item of candidates) {
    if (selected.some(other => rectanglesOverlap(item.rect, other.rect)) || occluded(item.anchor)) continue;
    selected.push(item);
    if (selected.length === maximum) break;
  }
  return selected;
}

export class PlaceLabels {
  constructor(container, anchors, buildingMeshes) {
    this.container = container; this.anchors = anchors; this.buildingMeshes = buildingMeshes;
    this.enabled = true; this.elapsed = 1; this.ray = new Raycaster(); this.width = 0; this.height = 0;
    this.pool = Array.from({ length: 18 }, () => {
      const element = container.ownerDocument.createElement('div'); element.className = 'place-label'; element.hidden = true;
      const name = container.ownerDocument.createElement('b'), distance = container.ownerDocument.createElement('span');
      element.append(name, distance); container.append(element); return { element, name, distance };
    });
  }
  setEnabled(enabled) { this.enabled = !!enabled; this.elapsed = 1; if (!enabled) this.hide(); }
  hide() { this.pool.forEach(p => { p.element.hidden = true; }); }
  update(dt, camera, player, { inspection = false, visible = true, width, height } = {}) {
    if (!this.enabled || !visible) { this.hide(); return; }
    this.elapsed += dt;
    if (this.elapsed < .1 && width === this.width && height === this.height) return;
    this.elapsed = 0; this.width = width; this.height = height;
    camera.updateMatrixWorld();
    const avoid = [];
    for (const element of this.container.ownerDocument.querySelectorAll('.location,.minimap-card,.speed-card,.controls-strip,.game-header,.view-toolbar,.inspection-banner,.interaction-prompt,.dialogue,.pedestrian-health,#debug-panel,.attribution')) {
      const rect = element.getBoundingClientRect(); if (rect.width && rect.height) avoid.push(rect);
    }
    if (!inspection) avoid.push({ left: width / 2 - 65, right: width / 2 + 65, top: height * .5, bottom: height * .96 });
    const occluded = anchor => {
      const target = new Vector3(anchor.x, anchor.y, anchor.z), direction = target.sub(camera.position), length = direction.length();
      this.ray.set(camera.position, direction.normalize()); this.ray.near = .1; this.ray.far = Math.max(.1, length - .5);
      return this.ray.intersectObjects(this.buildingMeshes, false).length > 0;
    };
    const selected = selectLabels(this.anchors, camera, player, { width, height, inspection, avoid, occluded });
    this.pool.forEach((slot, index) => {
      const item = selected[index]; slot.element.hidden = !item;
      if (!item) return;
      slot.name.textContent = item.anchor.name; slot.distance.textContent = `${Math.round(item.distance)} m`;
      slot.element.style.transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px) translate(-50%, -100%)`;
      slot.element.style.width = `${item.width}px`; slot.element.style.opacity = item.opacity;
    });
  }
  dispose() { this.pool.forEach(slot => slot.element.remove()); }
}
