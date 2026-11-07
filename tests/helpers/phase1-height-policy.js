import { readFileSync } from 'node:fs';
export const heightPolicyChanges = JSON.parse(readFileSync(new URL('../height-policy-changes.json', import.meta.url)));
// Keep the historical Phase 1 fixture intact. Restore only the explicitly
// reviewed policy differences when checking that unrelated geometry stayed fixed.
export function phase1HeightMap(map) {
  const copy = structuredClone(map);
  for (const c of heightPolicyChanges) {
    const b = copy.buildings.find(b => b.id === c.id);
    if (b) Object.assign(b, { height: c.before.height, heightSource: c.before.heightSource });
  }
  return copy;
}
