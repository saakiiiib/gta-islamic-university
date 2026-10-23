/** One reusable dialogue card; timers follow gameplay time, not wall-clock time. */
export class Subtitles {
  constructor(element) { this.element = element; this.remaining = 0; this.hide(); }
  show({ text, textEnglish = '', npcId, duration = 3.5 }) {
    this.element.querySelector('[data-speaker]').textContent = `STUDENT ${String(Number(npcId) + 1).padStart(2, '0')}`;
    this.element.querySelector('[data-bangla]').textContent = text;
    this.element.querySelector('[data-english]').textContent = textEnglish;
    this.element.hidden = false; this.remaining = Math.max(2, Math.min(6, duration));
  }
  update(dt) { this.remaining = Math.max(0, this.remaining - Math.max(0, Math.min(dt, .1))); if (!this.remaining) this.hide(); }
  hide() { this.remaining = 0; this.element.hidden = true; }
}
