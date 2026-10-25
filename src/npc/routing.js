/** Remove overlapping roadside hairpins for crowd routing only. Every shortcut
 * stays inside the ORIGINAL accepted pedestrian corridor and collision checks.
 * Source graph, map surfaces, crossings and collider triangles remain untouched. */
export function buildCrowdRouting(source) {
  const nodes = source.nodes.map(n => ({ ...n, neighbors: n.neighbors.map(e => ({ ...e })) }));
  const edges = source.edges.map(e => ({ ...e })), shortcuts = [];
  for (const middle of source.nodes) {
    for (let i = 0; i < middle.neighbors.length; i++) for (let j = i + 1; j < middle.neighbors.length; j++) {
      const first = middle.neighbors[i], second = middle.neighbors[j];
      if (first.walkingKind !== 'roadside' || second.walkingKind !== 'roadside') continue;
      const a = nodes[first.to], c = nodes[second.to];
      const ax = middle.x - a.x, az = middle.z - a.z, cx = c.x - middle.x, cz = c.z - middle.z;
      const along = (ax * cx + az * cz) / Math.max(.0001, Math.hypot(ax, az) * Math.hypot(cx, cz));
      const length = Math.hypot(c.x - a.x, c.z - a.z);
      if (along > -.65 || length < .4 || length > 10 || length > (first.length + second.length) * .8
        || Math.abs(a.height - c.height) > .16 || a.neighbors.some(e => e.to === c.id)) continue;
      if (!source.segmentWalkable([a.x, a.z], [c.x, c.z], .28)) continue;
      const detail = { ...first, length, walkingKind: 'roadside', source: 'validated-corridor-shortcut', estimated: true };
      delete detail.to;
      a.neighbors.push({ ...detail, to: c.id }); c.neighbors.push({ ...detail, to: a.id });
      edges.push({ a: a.id, b: c.id, ...detail }); shortcuts.push({ a: a.id, b: c.id, via: middle.id, length });
    }
  }
  return { ...source, nodes, edges, diagnostics: { ...source.diagnostics, crowdShortcuts: shortcuts } };
}
