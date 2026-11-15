// The waypoint graph the bots walk. Nodes sit in the open lanes; an edge joins two
// nodes when the straight walk between them clears every tall collider, tested
// with the same Box3 list that collides the actors, padded by an actor's width.
// Paths are breadth-first over that graph. One geometry helper (segment vs box)
// also answers the bots' "can I just walk straight there" and line-of-sight asks.
import * as THREE from 'three';

export function segmentBlocked(x1, z1, x2, z2, blockers, pad) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  for (const b of blockers) {
    const minX = b.min.x - pad;
    const maxX = b.max.x + pad;
    const minZ = b.min.z - pad;
    const maxZ = b.max.z + pad;
    let t0 = 0;
    let t1 = 1;
    if (Math.abs(dx) < 1e-9) {
      if (x1 < minX || x1 > maxX) continue;
    } else {
      let ta = (minX - x1) / dx;
      let tb = (maxX - x1) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (z1 < minZ || z1 > maxZ) continue;
    } else {
      let ta = (minZ - z1) / dz;
      let tb = (maxZ - z1) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    return true;
  }
  return false;
}

export function createNav(nodeList, colliders) {
  // Tall solids block walking and sight; low cover (crates, the mid wall) blocks
  // walking too, so it is in the walk list but not the sight list.
  const walkBlockers = colliders.filter((b) => b.min.y < 0.4 && b.max.y > 0.5);
  const sightBlockers = colliders.filter((b) => b.min.y < 0.4 && b.max.y > 1.55);
  const nodes = nodeList.map(([x, z]) => ({ x, z, edges: [] }));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist > 14.5) continue;
      if (segmentBlocked(a.x, a.z, b.x, b.z, walkBlockers, 0.5)) continue;
      a.edges.push(j);
      b.edges.push(i);
    }
  }

  function nearest(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Breadth-first path as a list of {x, z} waypoints ending at the goal point.
  function pathTo(x1, z1, x2, z2) {
    const start = nearest(x1, z1);
    const goal = nearest(x2, z2);
    if (start === goal) return [{ x: x2, z: z2 }];
    const prev = new Array(nodes.length).fill(-1);
    prev[start] = start;
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const next of nodes[cur].edges) {
        if (prev[next] === -1) { prev[next] = cur; queue.push(next); }
      }
    }
    if (prev[goal] === -1) return [{ x: x2, z: z2 }];
    const path = [];
    let cur = goal;
    while (cur !== start) {
      path.push({ x: nodes[cur].x, z: nodes[cur].z });
      cur = prev[cur];
    }
    path.reverse();
    path.push({ x: x2, z: z2 });
    return path;
  }

  return {
    nodes,
    pathTo,
    canWalk: (x1, z1, x2, z2) => !segmentBlocked(x1, z1, x2, z2, walkBlockers, 0.45),
    hasSight: (x1, z1, x2, z2) => !segmentBlocked(x1, z1, x2, z2, sightBlockers, 0.05),
  };
}
