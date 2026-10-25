import * as THREE from 'three';

export const COAST_SIZE = 256, COAST_RANGE = 64;

// RG stores a signed distance in metres with 16-bit precision. One small atlas
// shares the collision shoreline with the water shader, including open bays.
export function coastAtlas(shapes, slots) {
  const size = COAST_SIZE, width = size * slots, data = new Uint8Array(width * size * 4);
  for (let slot = 0; slot < slots; slot++) {
    const shape = shapes[slot];
    if (shape && shape.size !== size) throw new Error('Unexpected coast field size');
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const d = shape ? (shape.oceanField ?? shape.field)[z * size + x] : COAST_RANGE;
      const code = Math.round(Math.max(0, Math.min(1, (d + COAST_RANGE) / (2 * COAST_RANGE))) * 65535);
      const i = (z * width + slot * size + x) * 4;
      data[i] = code >> 8; data[i + 1] = code & 255; data[i + 3] = 255;
    }
  }
  return { data, width, height: size };
}

// Rasterise only physical terrain, clipped at the waterline. Pools, foliage and
// buildings are deliberately excluded by the asset adapter. The 256² field keeps
// open bays open, unlike the former enclosing-circle collision.
export function makeIslandShape(meshes, size = COAST_SIZE) {
  const bounds = new THREE.Box3();
  for (const m of meshes) { m.geometry.computeBoundingBox(); bounds.union(m.geometry.boundingBox); }
  const cell = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / (size - 6);
  const minX = (bounds.min.x + bounds.max.x) / 2 - cell * size / 2;
  const minZ = (bounds.min.z + bounds.max.z) / 2 - cell * size / 2;
  const mask = new Uint8Array(size * size), v = new THREE.Vector3();
  const edge = (a, b, x, z) => (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
  function triangle(a, b, c) {
    const area = edge(a, b, c.x, c.z); if (Math.abs(area) < 1e-8) return;
    const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - minX) / cell));
    const x1 = Math.min(size - 1, Math.ceil((Math.max(a.x, b.x, c.x) - minX) / cell));
    const z0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - minZ) / cell));
    const z1 = Math.min(size - 1, Math.ceil((Math.max(a.z, b.z, c.z) - minZ) / cell));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const px = minX + (x + .5) * cell, pz = minZ + (z + .5) * cell;
      if (edge(a, b, px, pz) / area >= -1e-6 && edge(b, c, px, pz) / area >= -1e-6 && edge(c, a, px, pz) / area >= -1e-6) mask[z * size + x] = 1;
    }
  }
  for (const m of meshes) {
    const g = m.geometry, p = g.attributes.position, count = g.index?.count ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(k => v.fromBufferAttribute(p, g.index ? g.index.getX(i + k) : i + k).clone());
      const clipped = [];
      for (let j = 0; j < 3; j++) {
        const a = points[j], b = points[(j + 1) % 3];
        if (a.y >= 0) clipped.push(a);
        if ((a.y >= 0) !== (b.y >= 0)) clipped.push(a.clone().lerp(b, -a.y / (b.y - a.y)));
      }
      for (let j = 1; j + 1 < clipped.length; j++) triangle(clipped[0], clipped[j], clipped[j + 1]);
    }
  }
  const distance = (source, seed) => {
    const d = Float32Array.from(source, n => n === seed ? 0 : 1e6), diag = Math.SQRT2;
    for (let z = 1; z < size - 1; z++) for (let x = 1; x < size - 1; x++) {
      const i = z * size + x;
      d[i] = Math.min(d[i], d[i - 1] + 1, d[i - size] + 1, d[i - size - 1] + diag, d[i - size + 1] + diag);
    }
    for (let z = size - 2; z > 0; z--) for (let x = size - 2; x > 0; x--) {
      const i = z * size + x;
      d[i] = Math.min(d[i], d[i + 1] + 1, d[i + size] + 1, d[i + size + 1] + diag, d[i + size - 1] + diag);
    }
    return d;
  };
  const signed = source => {
    const land = distance(source, 1), water = distance(source, 0);
    const field = Float32Array.from(source, (n, i) => (n ? .5 - water[i] : land[i] - .5) * cell);
    // Boundary cells are padded water; extend nearest interior values smoothly.
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) if (!x || !z || x === size - 1 || z === size - 1)
      field[z * size + x] = field[Math.max(1, Math.min(size - 2, z)) * size + Math.max(1, Math.min(size - 2, x))] + cell;
    return field;
  };
  const basins = closedBasins(mask, size), closedWater = new Uint8Array(mask.length);
  for (const basin of basins) for (const i of basin) closedWater[i] = 1;
  // Ocean sees only the outer shoreline. Still inland water is rendered by its
  // own opaque surface, with no ocean crests, wakes or surf inside the basin.
  const oceanMask = Uint8Array.from(mask, (n, i) => n || closedWater[i] ? 1 : 0);
  return { size, cell, minX, minZ, field: signed(mask), oceanField: signed(oceanMask),
    closedWater, basins, yaw: 0, radius: cell * size * .72 };
}

// Four-connected water connected to the padded boundary belongs to the sea.
// The remaining components are closed inland basins, including narrow channels.
export function closedBasins(land, size) {
  const seen = new Uint8Array(land.length), queue = new Int32Array(land.length);
  const flood = start => {
    let read = 0, count = 1; queue[0] = start; seen[start] = 1;
    while (read < count) {
      const i = queue[read++], x = i % size, z = Math.floor(i / size);
      for (const n of [x ? i - 1 : -1, x < size - 1 ? i + 1 : -1, z ? i - size : -1, z < size - 1 ? i + size : -1])
        if (n >= 0 && !land[n] && !seen[n]) { seen[n] = 1; queue[count++] = n; }
    }
    return Array.from(queue.subarray(0, count));
  };
  for (let i = 0; i < land.length; i++) if ((!Math.floor(i / size) || Math.floor(i / size) === size - 1 || !(i % size) || i % size === size - 1) && !land[i] && !seen[i]) flood(i);
  const basins = [];
  for (let i = 0; i < land.length; i++) if (!land[i] && !seen[i]) basins.push(flood(i));
  return basins;
}

export function shoreDistance(shape, x, z) {
  const { size: n, cell, minX, minZ, field } = shape;
  const gx = (x - minX) / cell - .5, gz = (z - minZ) / cell - .5;
  const cx = Math.max(0, Math.min(n - 1.001, gx)), cz = Math.max(0, Math.min(n - 1.001, gz));
  const ix = Math.floor(cx), iz = Math.floor(cz), fx = cx - ix, fz = cz - iz;
  const a = field[iz * n + ix] * (1 - fx) + field[iz * n + ix + 1] * fx;
  const b = field[(iz + 1) * n + ix] * (1 - fx) + field[(iz + 1) * n + ix + 1] * fx;
  return a * (1 - fz) + b * fz + Math.hypot(gx - cx, gz - cz) * cell;
}

export function terrainClearance(pos, heading, coast, island) {
  const s = island.userData.terrain, yaw = s.yaw, c = Math.cos(yaw), sn = Math.sin(yaw);
  const px = pos.x - island.position.x, pz = pos.z - island.position.z;
  const x = c * px - sn * pz, z = sn * px + c * pz, h = heading - yaw;
  const steps = Math.max(2, Math.ceil(2 * coast.reach / Math.max(1, coast.radius * .5)));
  let best = null;
  for (let i = 0; i <= steps; i++) {
    const t = -coast.reach + i / steps * 2 * coast.reach;
    const sx = x - Math.sin(h) * t, sz = z - Math.cos(h) * t, d = shoreDistance(s, sx, sz) - coast.radius - .3;
    if (!best || d < best.distance) best = { distance: d, x: sx, z: sz };
  }
  return best;
}

export function terrainPush(pos, heading, coast, island) {
  const s = island.userData.terrain;
  if (Math.hypot(pos.x - island.position.x, pos.z - island.position.z) > s.radius + coast.reach + coast.radius) return null;
  const p = { x: pos.x, z: pos.z };
  for (let i = 0; i < 6; i++) {
    const hit = terrainClearance(p, heading, coast, island);
    if (hit.distance >= -1e-4) break;
    const e = s.cell;
    let nx = shoreDistance(s, hit.x + e, hit.z) - shoreDistance(s, hit.x - e, hit.z);
    let nz = shoreDistance(s, hit.x, hit.z + e) - shoreDistance(s, hit.x, hit.z - e);
    if (Math.hypot(nx, nz) < 1e-6) { nx = hit.x || 1; nz = hit.z; }
    const scale = (-hit.distance + .02) / Math.hypot(nx, nz); nx *= scale; nz *= scale;
    p.x += nx * Math.cos(s.yaw) + nz * Math.sin(s.yaw);
    p.z += -nx * Math.sin(s.yaw) + nz * Math.cos(s.yaw);
  }
  const x = p.x - pos.x, z = p.z - pos.z;
  return Math.hypot(x, z) > 1e-4 ? { x, z } : null;
}
