const clamp = (value, max) => Math.min(max, Math.max(0, value));
export function impactDamage(speed) {
  const v = Math.abs(Number.isFinite(speed) ? speed : 0);
  return { pedestrian: v < .4 ? 0 : clamp(v * 2 + v * v * 1.6, 70), van: v < .4 ? 0 : clamp(v * 1.8 + v * v * .55, 48) };
}

/** Contact-enter damage, with separation rearming and independent actor cooldowns. */
export class ImpactSystem {
  constructor(crowd) { this.crowd = crowd; this.time = 0; this.contacts = new Map(); this.staticCooldown = new Map(); this.events = []; }
  update(dt) {
    this.time += dt;
    for (const [key, contact] of this.contacts) if (this.time - contact.time > 1.2 && contact.van.distanceFrom(contact.person.position.x, contact.person.position.z) > .9) this.contacts.delete(key);
  }
  handle({ type, van, pedestrian, other, speed, normal }) {
    const magnitude = Math.abs(speed), damage = impactDamage(magnitude);
    if (type === 'pedestrian') {
      if (!damage.pedestrian) return false;
      const key = `${van.id ?? 0}:${pedestrian.id}`;
      if (this.contacts.has(key)) return false;
      this.contacts.set(key, { van, person: pedestrian, time: this.time });
      const accepted = this.crowd.applyImpact(pedestrian, { speed: magnitude, damage: damage.pedestrian, normal, vanId: van.id ?? 0 });
      if (!accepted) return false;
      van.applyDamage(damage.van, { speed: magnitude, normal });
      return true;
    }
    if (magnitude < 1.2 || (this.staticCooldown.get(van.id ?? 0) ?? -1) > this.time) return false;
    this.staticCooldown.set(van.id ?? 0, this.time + .9);
    van.applyDamage(damage.van * .75, { speed: magnitude, normal });
    if (other) other.applyDamage(damage.van * .6, { speed: magnitude, normal });
    this.events.push({ type: 'worldImpact', vanId: van.id ?? 0, position: { ...van.position }, speed: magnitude, severity: Math.min(1, magnitude / 8) });
    if (this.events.length > 32) this.events.shift();
    return true;
  }
  drainEvents() { return this.events.splice(0); }
  reset() { this.time = 0; this.contacts.clear(); this.staticCooldown.clear(); this.events.length = 0; }
}
