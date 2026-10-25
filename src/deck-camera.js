import * as THREE from 'three';

// Segment/AABB entry distance in ship-local space, for camera collision only.
export function cameraLimit(from, to, boxes) {
  let limit = 1;
  for (const b of boxes) {
    let lo = 0, hi = 1;
    for (let k = 0; k < 3; k++) {
      const delta = to[k] - from[k], min = b.min[k] - .18, max = b.max[k] + .18;
      if (Math.abs(delta) < 1e-8) { if (from[k] < min || from[k] > max) { hi = -1; break; } }
      else { const a = (min - from[k]) / delta, c = (max - from[k]) / delta; lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c)); }
    }
    if (hi >= lo && lo > 0) limit = Math.min(limit, Math.max(.08, lo - .04));
  }
  return limit;
}

export class DeckCamera {
  constructor() { this.yaw = 0; this.pitch = .38; this.distance = 4.2; this.local = null; }
  orbit(dx, dy) { this.yaw -= dx * .006; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * .004, .12, 1.05); }
  zoom(delta) { this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(delta * .001), 2.2, 6); }
  update(dt, camera, ship, walker, navigation) {
    const p = walker.position, target = new THREE.Vector3(p.x, p.y + 1.1, p.z);
    const offset = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.distance);
    const want = target.clone().add(offset);
    // Smooth in the ship frame, then constrain the actual camera segment each
    // frame. World-space smoothing would lag behind the vessel's rolling deck.
    if (!this.local) this.local = want.clone();
    this.local.lerp(want, 1 - Math.exp(-dt * 10));
    const boxes = navigation.obstacles.map(o => o.bounds);
    for (const s of navigation.surfaces) if (s.kind === 'quarterdeck' || s.kind === 'step') boxes.push(s.bounds);
    const fraction = cameraLimit(target.toArray(), this.local.toArray(), boxes);
    const safe = target.clone().lerp(this.local, fraction);
    camera.up.set(0, 1, 0);
    camera.position.copy(ship.localToWorld(safe));
    camera.lookAt(ship.localToWorld(target));
  }
}
