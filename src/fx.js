import * as THREE from 'three';
import { waveHeight } from './sea.js';

// Short-lived puffs: cannon smoke, splashes, fire on hits. Each one fades and is thrown away.
const puffGeo = new THREE.IcosahedronGeometry(1, 0);
const KINDS = {
  smoke: { color: '#e9e4da', grow: 2.2, life: 1.3, rise: 1.5, opacity: .5 },
  splash: { color: '#f2fbff', grow: 1.6, life: .8, rise: 3.5, opacity: .9 },
  fire: { color: '#ff9a3c', grow: 2, life: .6, rise: 2, opacity: 1, emissive: true },
  debris: { color: '#6b3f1f', grow: .4, life: 1.2, rise: 0, opacity: 1, fall: true },
  spark: { color: '#ffe08a', grow: .3, life: .5, rise: 0, opacity: 1, emissive: true },
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.balls = [];
    this.ballGeo = new THREE.SphereGeometry(.32, 10, 8);
    this.ballMat = new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: .4, metalness: .6 });
  }

  puff(kind, at, { size = 1, vel = null } = {}) {
    const k = KINDS[kind];
    const mat = new THREE.MeshStandardMaterial({ color: k.color, transparent: true, opacity: k.opacity, flatShading: true,
      emissive: k.emissive ? k.color : '#000', emissiveIntensity: k.emissive ? 2 : 0, depthWrite: false });
    const m = new THREE.Mesh(puffGeo, mat);
    m.position.copy(at);
    m.scale.setScalar(size * .4);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    this.scene.add(m);
    this.items.push({ m, k, t: 0, size, vel: vel || new THREE.Vector3((Math.random() - .5) * 1.5, k.rise, (Math.random() - .5) * 1.5) });
  }

  burst(kind, at, n, size = 1, spread = 4) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - .5) * spread, KINDS[kind].rise + Math.random() * spread, (Math.random() - .5) * spread);
      if (KINDS[kind].fall) v.y = 4 + Math.random() * 6;
      this.puff(kind, at, { size: size * (.6 + Math.random() * .6), vel: v });
    }
  }

  // A cannonball in flight. onHit(ball) returns true when it struck something and should stop.
  shoot(from, vel, owner) {
    const m = new THREE.Mesh(this.ballGeo, this.ballMat);
    m.position.copy(from);
    m.castShadow = true;
    this.scene.add(m);
    const b = { m, vel: vel.clone(), owner, life: 6 };
    this.balls.push(b);
    return b;
  }

  update(dt, t, onHit) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / it.k.life;
      if (k >= 1) { this.scene.remove(it.m); it.m.material.dispose(); this.items.splice(i, 1); continue; }
      if (it.k.fall) it.vel.y -= 18 * dt;
      it.m.position.addScaledVector(it.vel, dt);
      it.vel.multiplyScalar(it.k.fall ? 1 : 1 - dt * 1.5);
      it.m.scale.setScalar(it.size * (.4 + it.k.grow * Math.sqrt(k)));
      it.m.material.opacity = it.k.opacity * (1 - k * k);
    }
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.vel.y -= 9.8 * dt;
      b.m.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      const p = b.m.position;
      let done = onHit && onHit(b);
      if (!done && p.y < waveHeight(p.x, p.z, t)) { this.puff('splash', p, { size: 1.2 }); this.burst('splash', p, 4, .6, 2); done = true; b.splashed = true; }
      if (done || b.life < 0) { this.scene.remove(b.m); this.balls.splice(i, 1); }
    }
  }

  clearBalls() { this.balls.forEach(b => this.scene.remove(b.m)); this.balls = []; }
}
