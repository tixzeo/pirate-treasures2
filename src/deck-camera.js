import * as THREE from 'three';

// Screen right/forward projected onto the ship's deck. Both keyboard and stick
// keep their magnitude; the walker remains responsible for speed and collision.
export function cameraRelativeMove(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

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
  constructor(view = {}) { this.yaw = view.yaw ?? 0; this.pitch = view.pitch ?? .38; this.distance = view.distance ?? 4.2; this.local = null; this.focus = null; }
  view() { return { yaw: this.yaw, pitch: this.pitch, distance: this.distance }; }
  orbit(dx, dy) { this.yaw -= dx * .006; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * .004, .12, 1.05); }
  zoom(delta) { this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(delta * .001), 2.2, 6); }
  movement(x, z) { return cameraRelativeMove(x, z, this.lookYaw ?? this.yaw); }
  update(dt, camera, ship, walker, navigation) {
    const p = walker.position, target = new THREE.Vector3(p.x, p.y + 1.1, p.z);
    const blend = 1 - Math.exp(-dt * 10);
    if (!this.focus) {
      this.focus = target.clone(); this.azimuth = this.yaw; this.elevation = this.pitch; this.radius = this.distance;
      this.local = new THREE.Vector3();
    }
    this.focus.lerp(target, blend);
    this.azimuth += angleDelta(this.azimuth, this.yaw) * blend;
    this.elevation += (this.pitch - this.elevation) * blend;
    this.radius += (this.distance - this.radius) * blend;
    // Interpolate the orbit angles, not a chord through the captain on a fast
    // half-turn. Follow in ship space so rolling/sailing introduces no drift.
    const offset = new THREE.Vector3(Math.sin(this.azimuth) * Math.cos(this.elevation), Math.sin(this.elevation), Math.cos(this.azimuth) * Math.cos(this.elevation)).multiplyScalar(this.radius);
    this.local.copy(this.focus).add(offset);
    const boxes = navigation.obstacles.map(o => o.bounds);
    for (const s of navigation.surfaces) if (s.kind === 'quarterdeck' || s.kind === 'step') boxes.push(s.bounds);
    const fraction = cameraLimit(target.toArray(), this.local.toArray(), boxes);
    const safe = target.clone().lerp(this.local, fraction);
    // Use the view actually displayed, including follow/orbit smoothing. A fast
    // swipe must not change walking direction before the camera has turned.
    this.lookYaw = Math.atan2(safe.x - target.x, safe.z - target.z);
    camera.up.set(0, 1, 0);
    camera.position.copy(ship.localToWorld(safe));
    camera.lookAt(ship.localToWorld(target));
  }
}
