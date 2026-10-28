// Hull against hull in the sea plane. Each hull is a capsule: its centre line rounded by half its beam.
// Bodies are Vessels or plain objects with pos {x, z}, heading, length, width, mass, speed, drift and yaw.
export const RAM = Object.freeze({
  restitution: .2,   // how much of the closing speed bounces back
  maxYaw: .8,        // most rate of turn one blow can give, rad/s
  bow: .5,           // share of the half length from the middle that counts as the bow
  threshold: 1.5,    // m/s of closing speed a hull takes without damage
  damage: 2.2,       // hit points per m/s above that
  rammer: .35,       // share of the damage the ship that rams with her bow takes
  cooldown: .7,      // seconds before the same pair can take damage again
});

// Smaller blows: the guns' recoil and a ball striking home, per gun or per ball.
export const IMPACT = Object.freeze({
  gunRoll: .1,       // rad/s of roll each gun's recoil gives, away from the side that fired
  gunDrift: .05,     // m/s each gun pushes the hull away from that side
  ballPush: .35,     // m/s a ball's blow gives the whole hull along its flight
  ballRoll: .08,     // rad/s of roll it gives, away from the side it struck
});

const fwd = h => ({ x: -Math.sin(h), z: -Math.cos(h) });
const right = h => ({ x: Math.cos(h), z: -Math.sin(h) });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// The y part of a × b for vectors in the sea plane: the turning effect of a push b applied at a.
const cross = (a, b) => a.z * b.x - a.x * b.z;

// Relative mass of a hull: what matters is the ratio, so a brig shoulders a schooner aside.
export const hullMass = (length, width) => length * length * width / 100;

function centreLine(b) {
  const f = fwd(b.heading), half = Math.max(0, b.length / 2 - b.width / 2);
  return { x: b.pos.x - f.x * half, z: b.pos.z - f.z * half, dx: f.x * 2 * half, dz: f.z * 2 * half };
}

// Closest points of two segments (Ericson, Real-Time Collision Detection 5.1.9).
function closest(p, q) {
  const rx = p.x - q.x, rz = p.z - q.z, a = p.dx * p.dx + p.dz * p.dz, e = q.dx * q.dx + q.dz * q.dz, f = q.dx * rx + q.dz * rz;
  let s = 0, t = 0;
  if (a < 1e-12 && e < 1e-12) return { s, t };
  if (a < 1e-12) t = clamp(f / e, 0, 1);
  else {
    const c = p.dx * rx + p.dz * rz;
    if (e < 1e-12) s = clamp(-c / a, 0, 1);
    else {
      const b = p.dx * q.dx + p.dz * q.dz, den = a * e - b * b;
      // Side by side: the middle of the stretch where they overlap, so a scrape pushes without a twist.
      if (den <= 1e-9 * a * e) {
        const at = (x, z) => clamp(((x - p.x) * p.dx + (z - p.z) * p.dz) / a, 0, 1);
        s = (at(q.x, q.z) + at(q.x + q.dx, q.z + q.dz)) / 2;
      } else s = clamp((b * f - c * e) / den, 0, 1);
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return { s, t };
}

// Where two hulls overlap: the normal from b towards a, how deep, and the point between them. Null when clear.
export function hullContact(a, b) {
  const p = centreLine(a), q = centreLine(b), { s, t } = closest(p, q);
  const ax = p.x + p.dx * s, az = p.z + p.dz * s, bx = q.x + q.dx * t, bz = q.z + q.dz * t;
  let nx = ax - bx, nz = az - bz;
  const dist = Math.hypot(nx, nz), depth = (a.width + b.width) / 2 - dist;
  if (depth <= 0) return null;
  if (dist > 1e-9) { nx /= dist; nz /= dist; }
  else {
    // Centre lines cross: part them along the line between the hulls' middles, or sideways.
    const cx = a.pos.x - b.pos.x, cz = a.pos.z - b.pos.z, c = Math.hypot(cx, cz);
    const r = right(a.heading);
    [nx, nz] = c > 1e-9 ? [cx / c, cz / c] : [r.x, r.z];
  }
  return { nx, nz, depth, x: (ax + bx) / 2, z: (az + bz) / 2 };
}

// A push J (mass × m/s) at a point rel from the middle: forward speed, slip and rate of turn all change.
export function applyImpulse(body, rel, jx, jz) {
  const f = fwd(body.heading), r = right(body.heading), m = body.mass, inertia = m * body.length * body.length / 12;
  body.speed += (jx * f.x + jz * f.z) / m;
  body.drift += (jx * r.x + jz * r.z) / m;
  body.yaw += clamp(cross(rel, { x: jx, z: jz }) / inertia, -RAM.maxYaw, RAM.maxYaw);
}

const pointVelocity = (b, rel) => {
  const f = fwd(b.heading), r = right(b.heading);
  return { x: f.x * b.speed + r.x * b.drift + b.yaw * rel.z, z: f.z * b.speed + r.z * b.drift - b.yaw * rel.x };
};
const isBow = (b, rel, n) => {
  const f = fwd(b.heading);
  return (rel.x * f.x + rel.z * f.z) > b.length / 2 * RAM.bow && b.speed > 0 && f.x * n.x + f.z * n.z > .3;
};

// Two hulls meet: part them by mass, bounce them with a little restitution, turn them by where they touched.
// Returns null when clear, else the closing speed and who struck with the bow.
export function collideHulls(a, b) {
  const c = hullContact(a, b);
  if (!c) return null;
  const n = { x: c.nx, z: c.nz }, total = a.mass + b.mass, gap = c.depth + 1e-4;
  a.pos.x += n.x * gap * b.mass / total; a.pos.z += n.z * gap * b.mass / total;
  b.pos.x -= n.x * gap * a.mass / total; b.pos.z -= n.z * gap * a.mass / total;
  const ra = { x: c.x - a.pos.x, z: c.z - a.pos.z }, rb = { x: c.x - b.pos.x, z: c.z - b.pos.z };
  const va = pointVelocity(a, ra), vb = pointVelocity(b, rb);
  const closing = -((va.x - vb.x) * n.x + (va.z - vb.z) * n.z);
  const out = { closing: Math.max(0, closing), x: c.x, z: c.z, nx: n.x, nz: n.z,
    ramA: isBow(a, ra, { x: -n.x, z: -n.z }), ramB: isBow(b, rb, n) };
  if (closing <= 0) return out;
  const ia = a.mass * a.length * a.length / 12, ib = b.mass * b.length * b.length / 12;
  const k = 1 / a.mass + 1 / b.mass + cross(ra, n) ** 2 / ia + cross(rb, n) ** 2 / ib;
  const j = (1 + RAM.restitution) * closing / k;
  applyImpulse(a, ra, n.x * j, n.z * j);
  applyImpulse(b, rb, -n.x * j, -n.z * j);
  return out;
}

// Hit points each side loses: the one rammed takes it all, the rammer a share, a scrape is shared.
export function ramDamage({ closing, ramA, ramB }) {
  const full = Math.max(0, closing - RAM.threshold) * RAM.damage;
  if (ramA && !ramB) return { a: full * RAM.rammer, b: full };
  if (ramB && !ramA) return { a: full, b: full * RAM.rammer };
  return { a: full * .6, b: full * .6 };
}

// A hull run against something fixed (shore, pier) at an angle turns along it: the blow lands on the end that
// leads into it. push: how far the contact moved her; impact: her speed into it; keep: the share of speed kept.
export function contactTurn(body, push, impact, keep) {
  const depth = Math.hypot(push.x, push.z);
  if (!(depth > 0) || !(impact > 0)) return 0;
  // Bow first, stern first, or alongside (no lever at all): the more end-on, the further out the blow lands.
  const f = fwd(body.heading), n = { x: push.x / depth, z: push.z / depth }, lead = clamp(-2 * (f.x * n.x + f.z * n.z), -1, 1);
  const rel = { x: f.x * body.length * .4 * lead, z: f.z * body.length * .4 * lead };
  const turn = clamp(cross(rel, n) * impact * (1 - keep) * 12 / (body.length * body.length), -RAM.maxYaw, RAM.maxYaw);
  body.yaw += turn;
  return turn;
}
