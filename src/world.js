import { planBerth } from './berth-layout.js';
import * as THREE from 'three';
import { Sea, addSky, addClouds, waveHeight } from './sea.js';
import { buildShip, dressShip, Vessel } from './ship.js';
import { buildIsland, dressIsland, buildMarker, buildPier, buildKitPier, buildBerth, PIER_WIDTH, PIER_LENGTH, DOCK_PITCH } from './island.js';
import { kitReady } from './kit.js';
import { ISLANDS, BOSS_HOME, SCENERY } from './islands.js';
import { Effects } from './fx.js';
import { SeaLife } from './life.js';
import { Atmosphere } from './atmosphere.js';
import { Post, pickQuality } from './post.js';
import { character } from './characters.js';
import { sfx } from './sound.js';
import { PLAYER_SHIP, SHIP_RULES } from './ship-config.js';
import { HULL_PHYSICS } from './ship-physics.js';
import { coastDistance, coastPush, pierPush } from './ship-collision.js';
import { terrainPush } from './island-shape.js';
import { DeckWalker, makeDeckZone } from './deck-walk.js';
import { DeckCamera, CrewOcclusion } from './deck-camera.js';
import { boundsOf } from './ship-layout.js';
import { ShoreImpact } from './shore-impact.js';
import { Wind, tackFor } from './wind.js';
import { driftFloater } from './floaters.js';
import { collideHulls, ramDamage, applyImpulse, RAM, IMPACT } from './ship-contact.js';
import { BOSS_REWARD, VICTORY_AT, advanceSinking, crossed, BOSS_LOOK, LOOK_UNTIL, easeBossLook } from './boss-finish.js';

const RELOAD = 3.2;            // seconds between broadsides of one side
const BALL_SPEED_H = 42;       // horizontal speed of a cannonball, m/s
const G = 9.8;
const PIER = PIER_LENGTH;      // pier length, m
// How exactly the ship must lie at the berth before she can moor.
export const MOOR = SHIP_RULES.moor;
const wrapAbs = a => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));

// The open sea: the player's ship, the treasure islands in order, and the boss that patrols nearby.
export class World {
  constructor(renderer, ui) {
    this.renderer = renderer;
    this.ui = ui;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, .5, 5000);
    const { light, sun, sky, hemi } = addSky(this.scene, renderer);
    this.light = light;
    this.sea = new Sea(this.scene, sun);
    const clouds = addClouds(this.scene);
    this.atmo = new Atmosphere(this, { light, sky, hemi, clouds, sea: this.sea, renderer });
    this.post = new Post(renderer, this, pickQuality());
    this.fx = new Effects(this.scene);

    // Player: the supplied «Морской странник», with TASK 001's vessel mechanics.
    this.player = new Vessel(buildShip({ hull: 'polished_oak', trim: 'pirate_gold', sail: 'sail_canvas', flag: 'black_sailcloth', masts: 2, ...PLAYER_SHIP }), PLAYER_SHIP.handling);
    this.scene.add(this.player.mesh);
    this.reload = { left: 0, right: 0 };

    // Treasure islands, each with a pier facing the way you come from. You moor alongside it to go ashore.
    this.isles = ISLANDS.map((def, i) => {
      const isl = buildIsland({ radius: def.radius, seed: def.seed });
      isl.position.set(def.x, 0, def.z);
      isl.userData.def = def;
      isl.userData.done = false;
      const prev = i ? new THREE.Vector3(ISLANDS[i - 1].x, 0, ISLANDS[i - 1].z) : new THREE.Vector3();
      const dir = prev.sub(isl.position).normalize();          // out from the island along the pier
      const side = new THREE.Vector3(-dir.z, 0, dir.x);         // the side of the pier the berth is on
      const root = isl.position.clone().addScaledVector(dir, def.radius * .95);
      const pier = buildPier(PIER);
      pier.position.copy(root);
      pier.rotation.y = Math.atan2(-dir.z, dir.x);
      isl.userData.pier = { root, dir, side, mesh: pier, heading: Math.atan2(dir.x, dir.z) }; // heading: bow toward the island
      this.scene.add(isl, pier);
      this.layBerth(isl);
      return isl;
    });
    const scenery = this.scenery = SCENERY.map(([x, z, r, seed]) => {
      const isl = buildIsland({ radius: r, seed, chest: false, palms: 4 });
      isl.position.set(x, 0, z);
      this.scene.add(isl);
      return isl;
    });
    this.sea.setIslands([...this.isles, ...scenery]);
    // A beam of light and a golden arrow hang over whatever you should sail to next.
    this.marker = buildMarker();
    this.scene.add(this.marker);

    // Boss: «Каракатица», captain Scar's schooner from island 12.
    this.boss = new Vessel(buildShip({ hull: 'weathered_hull', hullTint: '#8a7f99', trim: 'worn_iron', sail: 'black_sailcloth', sailTint: '#9a8fb0', flag: 'crimson_sailcloth', masts: 2, length: 15 }), { hp: 150, maxSpeed: 9, turnRate: .55 });
    this.bossHome = new THREE.Vector3(BOSS_HOME.x, 0, BOSS_HOME.z);
    this.boss.pos.copy(this.bossHome).add(new THREE.Vector3(40, 0, 0));
    this.boss.throttle = .5;
    this.boss.reload = 2;
    this.scene.add(this.boss.mesh);
    this.bossBeaten = false;
    this.crew = {};
    this.seaControlMode = 'helm';
    this.shoreImpact = new ShoreImpact();
    // Артем's models replace the built-in ships and islands as soon as they are in; the crew boards after that.
    // Deck lanterns on both ships: off by day, warm pools of light on deck after dusk.
    this.lamps = [[this.player, '#ffb25a'], [this.boss, '#ff6a9a']].map(([v, col]) => {
      const lamp = v.mesh.userData.metrics.lamp;
      const l = new THREE.PointLight(col, 0, lamp.distance, 1.6);
      l.position.set(0, lamp.y, lamp.z);
      v.mesh.add(l);
      return l;
    });
    this.life = new SeaLife(this);
    // One wind for the whole sea: both ships sail by it.
    this.wind = new Wind();
    this.player.wind = this.boss.wind = this.wind;
    this.kitDone = kitReady.then(() => this.applyKit()).catch(e => console.warn('World kit not applied', e));
    this.loadCrew();

    this.state = 'sail';
    this.camYaw = 0;       // view turned around the ship by dragging, radians
    this.camPitch = 0;
    this.camZoom = 1;
    this.camDragAt = -9;
    this.bossLook = 0;     // share of the view turned toward Scar, eased
    const cam = this.player.mesh.userData.metrics.camera;
    this.camPos = new THREE.Vector3(0, cam.teleportUp, cam.resetBack);
    this.time = 0;
    this.queue = [];
  }

  // The berth lies alongside the pier, its outline sized to the player's ship.
  layBerth(isl) {
    const b = isl.userData.pier, u = this.player.mesh.userData;
    const at = along => b.root.clone().addScaledVector(b.dir, along).addScaledVector(b.side, PIER_WIDTH / 2 + u.width / 2 + SHIP_RULES.berthGap);
    const plan = planBerth({ length: b.length ?? PIER, shipLength: u.length, pitch: DOCK_PITCH,
      blocked: along => !!(isl.userData.terrain && terrainPush(at(along),b.heading,u.metrics.coast,isl)) });
    if(plan.length !== (b.length ?? PIER)) {
      const previous=b.mesh;
      b.mesh=b.kit ? buildKitPier(b.kit,plan.segments) : buildPier(plan.length);
      b.mesh.position.copy(b.root); b.mesh.rotation.copy(previous.rotation);
      this.scene.remove(previous); this.scene.add(b.mesh);
    }
    b.length=plan.length; b.berth=at(plan.along);
    // The island keeps ships off its beach, but never so far out that the berth itself is blocked.
    const coast = u.metrics.coast;
    isl.userData.block = Math.min(isl.userData.shore + 3,
      coastDistance(b.berth, b.heading, coast.reach, isl.position).distance - coast.radius - .1);
    if (b.ghost) {
      this.scene.remove(b.ghost);
      b.ghost.traverse(o => { if (o.geometry) { o.geometry.dispose(); o.material.dispose(); } });
    }
    b.ghost = buildBerth(u.length, u.width);
    b.ghost.position.copy(b.berth);
    b.ghost.rotation.y = b.heading;
    this.scene.add(b.ghost);
  }

  applyKit() {
    this.setSeaControlMode('helm');
    this.lastDeckPosition = null;
    dressShip(this.player.mesh, PLAYER_SHIP.model);
    dressShip(this.boss.mesh, 'scar_karakatitsa');
    for (const isl of this.isles) {
      const { def, pier } = isl.userData;
      // Our pier starts a few metres up the sand from where the model's beach meets the sea.
      const coast = dressIsland(isl, def.kit, pier.dir);
      if (coast) pier.root.copy(isl.position).addScaledVector(pier.dir, coast - (isl.userData.terrain ? 1 : 4));
      const segments = isl.userData.terrain ? 4 : 3;
      pier.length = DOCK_PITCH * segments;
      const kitPier = buildKitPier(def.dock, segments);
      kitPier.position.copy(pier.root);
      kitPier.rotation.copy(pier.mesh.rotation);
      this.scene.remove(pier.mesh);
      this.scene.add(kitPier);
      pier.mesh = kitPier;
      pier.kit = def.dock;
      this.layBerth(isl);
    }
    const kinds = ['island_crescent_bay', 'island_jungle_ruins', 'island_fortress_rock'];
    SCENERY.forEach(([, , , seed], i) => dressIsland(this.scenery[i], kinds[i % kinds.length], null, seed));
    this.sea.setIslands([...this.isles, ...this.scenery]);
    this.life.build();
  }

  // Артем's characters on deck: the captain at the helm, the bosun amidships, Tim once he has joined, Scar on his own quarterdeck.
  async loadCrew() {
    const place = (...a) => this.board(...a);
    try {
      await this.kitDone;
      const [captain, bosun, tim, scar] = await Promise.all([
        character('captain', 1.75), character('bosun', 1.7), character('tim_cabin_boy', 1.35), character('captain_scar', 1.8)]);
      const W = this.player.mesh.userData.width;
      this.crew = {
        captain: place(this.player, captain, 0, 0, true),
        bosun: place(this.player, bosun, W * .22, .1, false, -.6),
        tim: place(this.player, tim, -W * .1, -.62, false, .3),
        scar: place(this.boss, scar, 0, 0, true),
      };
      this.syncCrew();
    } catch (e) {
      console.warn('Characters did not load', e);
    }
  }

  board(ship, fig, x, z, castle = false, turn = 0) {
    const u = ship.mesh.userData;
    const anchor = u.navigation?.anchors?.[fig.userData.id];
    if (anchor) fig.position.fromArray(anchor);
    else fig.position.set(x, castle ? u.castle.y : u.deckY, castle ? u.castle.z : z * u.length / 2);
    fig.rotation.y = Math.PI + turn; // the bow is -Z, the figures face +Z
    ship.mesh.add(fig);
    return fig;
  }

  syncCrew() {
    const { tim, scar } = this.crew;
    if (tim) tim.visible = !!this.bossGone || this.boss.sinking >= VICTORY_AT;
    // Scar stays on his quarterdeck until the schooner is hit for good, then he is in his rowboat or out of sight.
    if (scar) {
      const boat = this.life.boat;
      if (boat && scar.parent !== boat.mesh) this.board(boat, scar, 0, .3, false, Math.PI);
      if (!boat && scar.parent !== this.boss.mesh) this.board(this.boss, scar, 0, 0, true);
      scar.visible = !!boat || this.boss.sinking === 0;
    }
  }

  canDeckWalk() {
    const c = this.crew.captain;
    return !!(this.state === 'sail' && this.player.hp > 0 && !this.player.sinking && this.player.mesh.parent &&
      c?.parent === this.player.mesh && c.userData.actions?.Walk && c.userData.actions?.Idle &&
      this.player.mesh.userData.navigation?.surfaces?.find(s => s.kind === 'deck')?.outline?.length >= 3);
  }

  captainMotion(moving) {
    const c = this.crew.captain, name = moving ? 'Walk' : 'Idle';
    if (!c?.userData.actions || (c.userData.deckMotion ?? 'Idle') === name) return;
    const actions = c.userData.actions, previous = actions[c.userData.deckMotion ?? 'Idle'];
    previous?.fadeOut(.16); actions[name]?.reset().fadeIn(.16).play();
    c.userData.deckMotion = name;
  }

  setSeaControlMode(mode) {
    if (mode === this.seaControlMode) return true;
    if (mode === 'deck') {
      if (!this.canDeckWalk() || this.ui.open) return false;
      const navigation = this.player.mesh.userData.navigation;
      // Stationary crew occupy space too; they are never duplicated or moved.
      const crew = Object.values(this.crew).filter(c => c !== this.crew.captain && c.visible && c.parent === this.player.mesh).map(c => ({ bounds: {
        min: [c.position.x - .3, c.position.y, c.position.z - .3],
        max: [c.position.x + .3, c.position.y + c.userData.height, c.position.z + .3],
      } }));
      const walker = new DeckWalker(makeDeckZone(navigation, crew), this.walkNavigation === navigation ? this.lastDeckPosition : null);
      if (!walker.position) return false;
      this.walkNavigation = navigation; this.deckWalker = walker;
      this.deckCamera = new DeckCamera(this.deckView);
      this.crewOcclusion = new CrewOcclusion(Object.values(this.crew)
        .filter(c => c !== this.crew.captain && c.visible && c.parent === this.player.mesh)
        .map(figure => ({ figure, frame: this.player.mesh })));
      this.helmCamera = { yaw: this.camYaw, pitch: this.camPitch, zoom: this.camZoom };
      this.crew.captain.position.set(walker.position.x, walker.position.y, walker.position.z);
      this.crew.captain.rotation.y = walker.facing;
    } else if (mode === 'helm') {
      this.deckView = this.deckCamera?.view();
      this.crewOcclusion?.restore(); this.crewOcclusion = null;
      this.lastDeckPosition = this.deckWalker?.position && { ...this.deckWalker.position };
      if (this.crew.captain) this.board(this.player, this.crew.captain, 0, 0, true);
      this.captainMotion(false);
      if (this.helmCamera) { this.camYaw = this.helmCamera.yaw; this.camPitch = this.helmCamera.pitch; this.camZoom = this.helmCamera.zoom; }
      this.camPos.copy(this.camera.position);
    } else return false;
    this.seaControlMode = mode;
    this.onControlMode?.(mode);
    return true;
  }

  updateDeck(dt, input) {
    if (this.seaControlMode !== 'deck') return;
    if (!this.canDeckWalk() || this.ui.open || this.walkNavigation !== this.player.mesh.userData.navigation) { this.setSeaControlMode('helm'); return; }
    const walker = this.deckWalker, captain = this.crew.captain;
    const move = this.deckCamera.movement(input.walkX ?? 0, input.walkZ ?? 0);
    walker.update(dt, move.x, move.z);
    const p = walker.position; captain.position.set(p.x, p.y, p.z);
    const angle = Math.atan2(Math.sin(walker.facing - captain.rotation.y), Math.cos(walker.facing - captain.rotation.y));
    captain.rotation.y += angle * (1 - Math.exp(-dt * 14));
    this.captainMotion(walker.moving);
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.post.resize(); }

  // How the ship lies against the nearest open berth: distance, angle off the pier line, speed, and whether each is good enough.
  dockState() {
    if (this.state !== 'sail' || this.player.hp <= 0) return null;
    const p = this.player;
    let best = null;
    for (const isl of this.isles) {
      if (isl.userData.done) continue;
      const b = isl.userData.pier;
      const dist = Math.hypot(p.pos.x - b.berth.x, p.pos.z - b.berth.z);
      if (dist > 60 || (best && dist > best.dist)) continue;
      const ang = Math.min(wrapAbs(p.heading - b.heading), wrapAbs(p.heading - b.heading - Math.PI));
      best = { isle: isl, dist, ang, speed: Math.hypot(p.speed, p.drift) };
    }
    if (best) {
      best.ok = { dist: best.dist < MOOR.dist, ang: best.ang < MOOR.ang, speed: best.speed < MOOR.speed };
      best.ready = best.ok.dist && best.ok.ang && best.ok.speed;
    }
    return best;
  }

  // The island whose berth the ship is lying at, ready to moor, or null.
  nearIsland() {
    const d = this.dockState();
    return d && d.ready ? d.isle : null;
  }

  // Tie up: lay the ship exactly in the berth, whichever way round she came in.
  moor(isl) {
    this.setSeaControlMode('helm');
    const b = isl.userData.pier, p = this.player;
    p.pos.set(b.berth.x, p.pos.y, b.berth.z);
    p.heading = wrapAbs(p.heading - b.heading) < Math.PI / 2 ? b.heading : b.heading + Math.PI;
    p.resetDynamics();
  }

  // Put the ship out in the approach to a berth, lined up with it and stopped.
  teleportBerth(isl, dist = 45) {
    this.setSeaControlMode('helm');
    const b = isl.userData.pier, p = this.player;
    p.pos.copy(b.berth).addScaledVector(b.dir, dist).setY(0);
    p.heading = b.heading;
    p.resetDynamics();
    const cam = p.mesh.userData.metrics.camera;
    this.camPos.copy(p.pos).addScaledVector(b.dir, cam.teleportBack).setY(cam.teleportUp);
  }

  // What to sail to next: the first unvisited island, then Scar, then nothing.
  target() {
    const isl = this.isles.find(i => !i.userData.done);
    if (isl) return { kind: 'isle', name: isl.userData.def.name, pos: isl.userData.pier.berth, isle: isl };
    if (!this.bossBeaten) return { kind: 'boss', name: '«Каракатица»', pos: this.boss.pos };
    return null;
  }

  // Bearing of a point relative to the bow, in radians (positive is to the left).
  bearing(pos) {
    const to = pos.clone().sub(this.player.pos);
    return THREE.MathUtils.euclideanModulo(Math.atan2(-to.x, -to.z) - this.player.heading + Math.PI, Math.PI * 2) - Math.PI;
  }

  // Broadside from one side of a ship. Aims at `target` when it is on that side, else fires at a default range.
  broadside(ship, side, target, spread = .04) {
    const dir = ship.side(side);
    let range = 55;
    if (target) {
      const to = target.pos.clone().sub(ship.pos); to.y = 0;
      const ang = dir.angleTo(to.clone().normalize());
      // Lead a moving target by where it will be when the ball lands.
      const lead = target.velocity().multiplyScalar(to.length() / BALL_SPEED_H);
      if (ang < .6) range = THREE.MathUtils.clamp(to.add(lead).length(), 15, 110);
    }
    // The guns go off one after another; update() fires them when their time comes.
    ship.mesh.userData.muzzles[side].forEach((m, i) => {
      this.queue.push({ at: this.time + i * .11 + Math.random() * .06, ship, side, m, range, spread });
    });
    sfx('cannon');
  }

  shot({ ship, side, m, range, spread }) {
    if (ship.hp <= 0) return;
    ship.mesh.updateMatrixWorld();
    const from = m.getWorldPosition(new THREE.Vector3());
    const r = range * (1 + (Math.random() - .5) * spread * 2);
    const t = r / BALL_SPEED_H;
    const d = ship.side(side).applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - .5) * spread);
    const vel = d.multiplyScalar(BALL_SPEED_H).add(ship.velocity());
    vel.y = .5 * G * t - (from.y - .5) / t;
    this.fx.shoot(from, vel, ship);
    // Recoil: each gun rolls her away from the side that fired and nudges her that way.
    const away = side === 'right' ? 1 : -1;
    ship.motion.kick(0, away * IMPACT.gunRoll);
    ship.drift -= away * IMPACT.gunDrift;
    this.fx.puff('smoke', from.clone().addScaledVector(ship.side(side), 1.5), { size: .9, vel: ship.side(side).multiplyScalar(3).setY(1) });
    this.fx.puff('fire', from, { size: .5 });
  }

  fire(side) {
    if (this.seaControlMode === 'deck' || this.ui.open) return;
    if (this.state !== 'battle' && this.state !== 'sail') return;
    if (this.reload[side] > 0 || this.player.hp <= 0) return;
    this.reload[side] = RELOAD;
    this.broadside(this.player, side, this.state === 'battle' ? this.boss : null, .03);
  }

  // Whether a ball is inside a ship's hull box.
  hits(ball, ship) {
    if (ball.owner === ship || ship.hp <= 0) return false;
    const p = ship.mesh.worldToLocal(ball.m.position.clone());
    const hit = ship.mesh.userData.metrics.hit;
    return Math.abs(p.x) < hit.halfWidth && Math.abs(p.z) < hit.halfLength && p.y > hit.minY && p.y < hit.maxY;
  }

  onBall(ball) {
    for (const ship of [this.player, this.boss]) {
      if (!this.hits(ball, ship)) continue;
      const dmg = ship === this.boss ? 6 : this.immortal ? 0 : 5;
      ship.hp = Math.max(0, ship.hp - dmg);
      if (ship === this.player && dmg > 0) this.lastDamage = 'cannon';
      // The blow shoves the hull along the ball's flight, turns her by where it struck and rolls her away from it.
      const fly = ball.vel ? ball.vel.clone().setY(0) : new THREE.Vector3();
      if (fly.lengthSq() > 1e-6) {
        fly.normalize();
        const at = ball.m.position.clone().sub(ship.pos);
        applyImpulse(ship, at, fly.x * ship.mass * IMPACT.ballPush, fly.z * ship.mass * IMPACT.ballPush);
        ship.motion.kick(0, -fly.dot(ship.side('right')) * IMPACT.ballRoll);
      }
      this.fx.burst('fire', ball.m.position, 4, .6, 3);
      this.fx.burst('debris', ball.m.position, 5, 1, 5);
      this.fx.puff('smoke', ball.m.position, { size: 1.6 });
      sfx('hit');
      if (ship === this.player) this.shake = .5;
      this.ui.battleHud(this.player, this.boss);
      return true;
    }
    return false;
  }

  startBattle() {
    this.state = 'battle';
    this.setSeaControlMode('helm');
    this.boss.throttle = .8;
    this.boss.reload = 3;
    this.ui.banner('«Каракатица» идёт на абордаж!', 'Шхуна капитана Шрама. Ставьте корабль бортом и давайте залп: Q — левый борт, E — правый.');
    this.ui.battleHud(this.player, this.boss);
  }

  // Scar keeps about 45 m away and turns his side to you before firing.
  bossAI(dt) {
    const b = this.boss, to = this.player.pos.clone().sub(b.pos); to.y = 0;
    const dist = to.length();
    const toDir = to.clone().normalize();
    // Which side faces the player, and the heading that would put that side square on.
    const side = b.side('right').dot(toDir) > 0 ? 'right' : 'left';
    const want = Math.atan2(-toDir.x, -toDir.z) + (side === 'right' ? Math.PI / 2 : -Math.PI / 2);
    let goal = want;
    if (dist > 70) goal = Math.atan2(-toDir.x, -toDir.z);          // close in
    else if (dist < 28) goal = Math.atan2(toDir.x, toDir.z);       // open the range
    goal = tackFor(goal, this.wind.toward);                          // no square-rigger sails into the wind
    let diff = THREE.MathUtils.euclideanModulo(goal - b.heading + Math.PI, Math.PI * 2) - Math.PI;
    b.rudder = THREE.MathUtils.clamp(diff * 2, -1, 1);
    b.throttle = dist > 70 ? 1 : .55;
    b.reload -= dt;
    const aim = b.side(side).angleTo(toDir);
    if (b.reload <= 0 && aim < .35 && dist < 100) {
      b.reload = 4.2;
      this.broadside(b, side, this.player, .09);
    }
  }

  bossPatrol(dt) {
    const b = this.boss, to = this.bossHome.clone().sub(b.pos); to.y = 0;
    // Circle round the home point.
    const tangent = new THREE.Vector3(-to.z, 0, to.x).normalize().add(to.clone().normalize().multiplyScalar((to.length() - 40) / 40));
    const goal = tackFor(Math.atan2(-tangent.x, -tangent.z), this.wind.toward);
    const diff = THREE.MathUtils.euclideanModulo(goal - b.heading + Math.PI, Math.PI * 2) - Math.PI;
    b.rudder = THREE.MathUtils.clamp(diff * 2, -1, 1);
    b.throttle = .45;
  }

  update(dt, input) {
    this.time += dt;
    const t = this.time, p = this.player;
    const shift = this.wind.shift;
    this.wind.update(dt, this.atmo.storm);
    if (this.wind.shift !== shift && this.wind.shifting && this.state !== 'battle') this.ui.flash('Ветер меняется');
    if (this.state === 'sail' || this.state === 'battle') {
      if (p.hp > 0) {
        p.throttle = input.throttle;
        p.rudder = this.seaControlMode === 'deck' ? 0 : input.rudder;
      } else { p.throttle = 0; p.rudder = 0; }
    }
    for (const s of ['left', 'right']) this.reload[s] = Math.max(0, this.reload[s] - dt);

    if (!this.bossBeaten) {
      if (this.state === 'battle') this.bossAI(dt);
      else this.bossPatrol(dt);
      if (this.state === 'sail' && p.pos.distanceTo(this.boss.pos) < 85 && p.hp > 0) this.startBattle();
    }
    p.update(dt, t);
    if (!this.bossGone) this.boss.update(dt, t);
    // A bow that drops hard into a sea at speed throws spray over the head.
    for (const v of [p, this.boss]) {
      if (v.sinking > 0 || (v === this.boss && this.bossGone)) continue;
      const slam = -v.motion.pitchVelocity;
      if (slam > HULL_PHYSICS.spray && v.speed > 6 && t - (v.sprayAt ?? -9) > .5) {
        v.sprayAt = t;
        const bow = v.pos.clone().addScaledVector(v.forward(), v.length * .45);
        bow.y = waveHeight(bow.x, bow.z, t) + .6;
        this.fx.puff('splash', bow, { size: .5 + slam * 12 + v.speed * .03, vel: v.forward().multiplyScalar(v.speed * .4).setY(3) });
      }
    }
    // The two ships cannot pass through each other: they bounce, turn, and a hard blow does damage.
    if (!this.bossGone && p.sinking < 1 && this.boss.sinking < 1) {
      const hit = collideHulls(p, this.boss);
      if (hit && hit.closing > RAM.threshold && this.time - (this.rammedAt ?? -9) > RAM.cooldown) this.onRam(hit);
    }
    this.updateFloaters(dt, t);
    this.life.update(dt, t);
    this.updateDeck(dt, input);
    for (const fig of Object.values(this.crew)) fig?.userData.mixer?.update(dt);
    // Ships cannot sail through the islands.
    for (const isl of this.scene.children.filter(o => o.userData.radius)) {
      for (const v of [p, this.boss]) {
        if (v.sinking >= 1) continue;
        const min = isl.userData.block || isl.userData.shore + 3;
        const push = isl.userData.terrain ? terrainPush(v.pos, v.heading, v.mesh.userData.metrics.coast, isl) :
          coastPush(v.pos, v.heading, v.mesh.userData.metrics.coast, isl.position, min);
        if (push) {
          const impact=v.resolveContact(push,.5);
          if (v === p && p.hp > 0) this.onShoreImpact(impact);
        }
      }
    }
    // Nor through piers, including diagonal approaches and both pier ends.
    for (const isl of this.isles) {
      const b = isl.userData.pier;
      for (const v of [p, this.boss]) {
        if (v.sinking >= 1) continue;
        const push = pierPush(v.pos, v.heading, v.mesh.userData, b, b.length ?? PIER, PIER_WIDTH);
        if (push) {
          const impact=v.resolveContact(push,.6);
          if (v === p && impact > 2 && this.time - (this.bumpAt ?? -9) > .8) { sfx('hit'); this.bumpAt = this.time; }
        }
      }
    }

    if (this.state === 'battle') {
      if (this.boss.hp <= 0 && !this.bossBeaten) this.winBattle();
    }
    if (p.hp <= 0 && !this.lost) this.loseBattle();
    if (this.boss.hp <= 0 && !this.bossGone) this.sinkBoss(dt);
    if (p.hp <= 0) p.sinking = Math.min(.35, p.sinking + dt * .15);
    // Burning ships smoke.
    for (const v of [p, this.boss]) if (v.hp < v.maxHp * .5 && v.sinking < .6 && Math.random() < dt * (v.hp <= 0 ? 12 : 4))
      this.fx.puff('smoke', v.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 4, 3, (Math.random() - .5) * 6)), { size: 1.2 });

    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].at <= t) this.shot(this.queue.splice(i, 1)[0]);
    this.fx.update(dt, t, b => this.onBall(b));
    this.sea.update(t, p.pos);
    this.sea.addWake(dt, [p, this.bossGone && this.life.boat ? this.life.boat : this.boss]);
    const goal = this.target(), dock = this.dockState();
    // The berth outline: gold while you line up, green once she lies right.
    for (const isl of this.isles) {
      const g = isl.userData.pier.ghost, here = dock && dock.isle === isl;
      g.visible = !isl.userData.done;
      g.position.y = waveHeight(g.position.x, g.position.z, t) * .4 + .25;
      g.userData.setColor(here && dock.ready ? '#5be38a' : here ? '#ffd24a' : '#fff1c4');
    }
    // Close to the berth the outline on the water takes over from the beam.
    this.marker.visible = !!goal && this.state !== 'battle' && !(dock && dock.dist < 45 && goal.isle === dock.isle);
    if (goal) {
      const h = goal.kind === 'isle' ? 14 : 26;
      this.marker.position.set(goal.pos.x, h + Math.sin(t * 2) * 1.2, goal.pos.z);
      this.marker.userData.arrow.rotation.y = t * 1.5;
      this.marker.userData.beam.material.opacity = .22 + Math.sin(t * 2.5) * .06;
      this.marker.userData.setColor(goal.kind === 'boss' ? '#ff5a4a' : '#ffd24a');
    }

    this.updateCamera(dt);
    this.atmo.update(dt, this.camera);
    for (const l of this.lamps) l.intensity = 16 * this.atmo.night;
    // Shadows never lie flatter than about 11 degrees, however low the sun.
    const ld = this.atmo.keyDir.clone(); ld.y = Math.max(ld.y, .2); ld.normalize();
    this.light.position.copy(p.pos).addScaledVector(ld, 100);
    this.light.target.position.copy(p.pos);

    this.ui.sailHud({
      speed: Math.abs(p.speed), throttle: p.throttle, reload: this.reload, reloadMax: RELOAD,
      dock, battle: this.state === 'battle',
      marks: this.marks(),
      goal: goal && { name: goal.name, kind: goal.kind, dist: Math.round(goal.pos.distanceTo(p.pos)), ang: this.bearing(goal.pos) },
    });
    this.ui.deckHud?.(this.seaControlMode, this.canDeckWalk());
  }

  // Compass bar markers: angle relative to the bow and distance.
  marks() {
    const goal = this.target();
    const out = this.isles.filter(i => !i.userData.done).map(i => ({
      ang: this.bearing(i.userData.pier.berth), icon: '✕', label: i.userData.def.name, dist: Math.round(i.userData.pier.berth.distanceTo(this.player.pos)), goal: goal && goal.isle === i,
    }));
    if (!this.bossBeaten) out.push({ ang: this.bearing(this.boss.pos), icon: '☠', label: 'Шрам', dist: Math.round(this.boss.pos.distanceTo(this.player.pos)), goal: goal && goal.kind === 'boss', foe: true });
    return out;
  }

  // Turn the view: drag to orbit around the ship (dx, dy in pixels), wheel to zoom.
  orbit(dx, dy) {
    if (this.seaControlMode === 'deck') { this.deckCamera.orbit(dx, dy); return; }
    this.camYaw -= dx * .006;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * .004, -.3, .9);
    this.camDragAt = this.time;
  }
  zoom(delta) {
    if (this.seaControlMode === 'deck') { this.deckCamera.zoom(delta); return; }
    this.camZoom = THREE.MathUtils.clamp(this.camZoom * Math.exp(delta * .001), .55, 1.8);
  }

  updateCamera(dt) {
    if (this.seaControlMode === 'deck') {
      this.deckCamera.update(dt, this.camera, this.player.mesh, this.deckWalker, this.walkNavigation);
      return;
    }
    const p = this.player, f = p.forward(), cam = p.mesh.userData.metrics.camera;
    // A tall phone screen sees less to the sides, so the camera stands further back.
    const k = THREE.MathUtils.clamp(1.25 / this.camera.aspect, 1, 2.1);
    const back = (this.state === 'battle' ? cam.battleBack : cam.back) * k, up = (this.state === 'battle' ? cam.battleUp : cam.up) * (1 + (k - 1) * .6);
    // Left alone while under way, a turned view drifts back behind the stern.
    const dragging = this.time - this.camDragAt < .15;
    if (this.time - this.camDragAt > 3 && Math.abs(p.speed) > 1) {
      this.camYaw = Math.atan2(Math.sin(this.camYaw), Math.cos(this.camYaw)) * (1 - Math.min(1, dt * .9));
      this.camPitch *= 1 - Math.min(1, dt * .9);
    }
    const dist = Math.hypot(back, up) * this.camZoom, elev = Math.atan2(up, back) + this.camPitch, yaw = p.heading + this.camYaw;
    const want = p.pos.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.cos(yaw) * Math.cos(elev) * dist));
    want.y = Math.max(want.y, cam.minY);
    this.camPos.lerp(want, Math.min(1, dt * (dragging ? 10 : 2.2)));
    this.camera.position.copy(this.camPos);
    this.shake = Math.max(0, (this.shake || 0) - dt);
    if (this.shake) this.camera.position.add(new THREE.Vector3((Math.random() - .5), (Math.random() - .5), 0).multiplyScalar(this.shake));
    // Looking ahead of the bow from behind; the further the view is turned, the more it looks at the ship itself.
    const ahead = p.pos.clone().addScaledVector(f, cam.ahead).add(new THREE.Vector3(0, cam.lookY, 0));
    const look = ahead.lerp(p.pos.clone().setY(p.pos.y + cam.lookY), Math.min(1, Math.abs(Math.sin(this.camYaw / 2)) * 2));
    const b = this.boss, watch = (this.state === 'battle' && b.hp > 0) || (b.hp <= 0 && !this.bossGone && b.sinking < LOOK_UNTIL);
    this.bossLook = easeBossLook(this.bossLook, watch ? BOSS_LOOK : 0, dt);
    if (this.bossLook > 1e-4) look.lerp(b.pos, this.bossLook);
    this.camera.lookAt(look);
  }

  // Nine seconds from the last hit to the last bubble; the victory story starts once the hull is under.
  sinkBoss(dt) {
    const b = this.boss, before = b.sinking;
    b.throttle = 0; b.rudder = 0;
    b.sinking = advanceSinking(b.sinking, dt);
    if (before === 0) {
      this.life.launchBoat(b, this.player.pos);
      this.syncCrew(); // Scar is off to his rowing boat
      this.fx.burst('debris', b.pos.clone().setY(1.5), 14, 1.2, 7);
      this.spawnFloaters(b.pos, 9);
    }
    // Air and water churn where the hull goes down.
    if (Math.random() < dt * (b.sinking < .9 ? 14 : 4)) {
      const at = b.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 8, 0, (Math.random() - .5) * 12));
      at.y = waveHeight(at.x, at.z, this.time) + .2;
      this.fx.puff('splash', at, { size: .5 + Math.random() * .6 });
    }
    if (before < .35 && b.sinking >= .35) { sfx('splash'); this.fx.burst('splash', b.pos.clone().setY(.5), 10, 1, 4); }
    if (crossed(before, b.sinking, VICTORY_AT)) {
      this.syncCrew(); // Tim climbs aboard
      this.onVictory?.();
    }
    if (b.sinking >= 1) {
      this.bossGone = true;
      this.scene.remove(b.mesh);
      this.fx.burst('splash', b.pos.clone().setY(.3), 6, .8, 2);
    }
  }

  // Barrels and planks left floating where a ship went down; they drift and fade after a while.
  spawnFloaters(at, n) {
    if (this.life.spawnWreck(at, n)) return;
    this.floaters = this.floaters || [];
    const wood = new THREE.MeshStandardMaterial({ color: '#7a4a28', roughness: .9, flatShading: true, transparent: true });
    for (let i = 0; i < n; i++) {
      const barrel = i % 3 === 0;
      const m = new THREE.Mesh(barrel ? new THREE.CylinderGeometry(.5, .5, 1.1, 8) : new THREE.BoxGeometry(2.4 + Math.random() * 1.5, .25, .6), wood);
      if (barrel) m.rotation.z = Math.PI / 2;
      m.position.set(at.x + (Math.random() - .5) * 14, 0, at.z + (Math.random() - .5) * 18);
      m.castShadow = true;
      this.scene.add(m);
      this.floaters.push({ m, life: 25 + Math.random() * 8, spin: (Math.random() - .5) * .4, drift: new THREE.Vector3((Math.random() - .5) * 1.2, 0, (Math.random() - .5) * 1.2), yaw: Math.random() * 6 });
    }
  }

  updateFloaters(dt, t) {
    if (!this.floaters) return;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      driftFloater(f, dt, this.wind, [this.player]);
      f.yaw += f.spin * dt;
      f.m.position.y = waveHeight(f.m.position.x, f.m.position.z, t) - .05 - Math.max(0, 3 - f.life) * .4;
      f.m.rotation.y = f.yaw;
      if (f.life <= 0) { this.scene.remove(f.m); f.m.geometry.dispose(); this.floaters.splice(i, 1); }
    }
  }

  winBattle() {
    this.bossBeaten = true;
    this.state = 'sail';
    this.onBossBeaten && this.onBossBeaten();
    sfx('win');
    this.ui.battleHud(null);
    this.ui.banner('«Каракатица» идёт ко дну!', 'Шрам прыгает в шлюпку. Смотрите, как шхуна уходит под воду.', 5000, false);
    this.onGold && this.onGold(BOSS_REWARD);
  }

  onRam(hit) {
    this.rammedAt = this.time;
    const p = this.player, b = this.boss, loss = ramDamage(hit);
    // Both hulls rock from the blow, each away from where she was struck.
    const rock = Math.min(.3, hit.closing * .02);
    p.motion.kick(0, -(hit.nx * p.side('right').x + hit.nz * p.side('right').z) * rock);
    b.motion.kick(0, (hit.nx * b.side('right').x + hit.nz * b.side('right').z) * rock);
    const mine = this.immortal ? 0 : Math.round(loss.a), his = Math.round(loss.b);
    p.hp = Math.max(0, p.hp - mine);
    b.hp = Math.max(0, b.hp - his);
    if (mine > 0) this.lastDamage = 'ram';
    const at = new THREE.Vector3(hit.x, 1.5, hit.z);
    this.fx.burst('debris', at, 6 + Math.min(10, Math.round(hit.closing)), 1.2, 6);
    this.fx.puff('splash', at.clone().setY(.4), { size: 1 + hit.closing * .1 });
    sfx('hit');
    this.shake = Math.max(this.shake ?? 0, Math.min(.8, .2 + hit.closing * .05));
    this.ui.flash(hit.ramA ? `Таран! «Каракатица» −${his}` : hit.ramB ? `Шрам таранит! −${mine} прочности` : `Борт о борт: −${mine}`);
    if (this.state === 'battle') this.ui.battleHud(p, b);
  }

  onShoreImpact(speed) {
    const hit = this.shoreImpact.sample(speed, this.time, this.immortal);
    if (!hit) return;
    const p = this.player;
    p.hp = Math.max(0, p.hp - hit.damage);
    if (hit.damage > 0) this.lastDamage = 'shore';
    if (this.time - (this.bumpAt ?? -9) > .8) { sfx('hit'); this.bumpAt = this.time; }
    this.shake = Math.max(this.shake ?? 0, .3);
    this.ui.flash(hit.damage ? `Берег: −${hit.damage} прочности` : 'Удар о берег');
    if (this.state === 'battle') this.ui.battleHud(p, this.boss);
  }

  loseBattle() {
    this.lost = true;
    this.setSeaControlMode('helm');
    const battle = this.state === 'battle', grounding = this.lastDamage === 'shore';
    sfx('lose');
    clearTimeout(this.lossTimer);
    this.lossTimer = setTimeout(() => {
      if (!this.lost || this.player.hp > 0) return;
      this.ui.dialog({
        title: grounding ? 'Корабль разбит о берег' : 'Корабль пробит',
        icon: 'shield',
        who: battle && !grounding ? 'captain_scar' : 'bosun',
        text: battle && !grounding ? 'Шрам оказался сильнее. Плотники залатают пробоины, а в следующий раз держитесь к нему бортом и не подставляйте корму.' :
          'Корпус не выдержал повреждений. Плотники починят корабль и вернут его в безопасную воду с убранными парусами.',
        buttons: [[battle ? 'Починиться и снова в бой' : 'Починиться и вернуться в море', () => { this.ui.closeDialog(); this.repair(); }]],
      });
    }, 1200);
  }

  repair() {
    clearTimeout(this.lossTimer);
    this.setSeaControlMode('helm');
    const p = this.player;
    p.hp = p.maxHp; p.sinking = 0; p.resetDynamics();
    this.shoreImpact.reset();
    this.lastDamage = null;
    this.lost = false;
    this.fx.clearBalls();
    this.queue = [];
    // Back off to where Scar is out of sight, he regains his crew too.
    if (this.state === 'battle') {
      const away = p.pos.clone().sub(this.boss.pos); away.y = 0; away.normalize();
      p.pos.copy(this.boss.pos).addScaledVector(away, 120);
      p.heading = Math.atan2(-away.x, -away.z);
      this.boss.hp = this.boss.maxHp;
    } else this.teleport(new THREE.Vector3(), 0);
    this.state = 'sail';
    this.ui.battleHud(null);
    this.onRepair?.();
  }

  // Saved progress: which islands are done and whether Scar is already at the bottom.
  applySave(save) {
    for (const isl of this.isles) isl.userData.done = save.done.includes(isl.userData.def.name);
    if (save.bossBeaten && !this.bossGone) {
      this.bossBeaten = this.bossGone = true;
      this.boss.hp = 0;
      this.scene.remove(this.boss.mesh);
    }
    this.syncCrew();
  }

  // Back to a fresh voyage: islands open, Scar afloat, the ship at the start.
  resetProgress() {
    clearTimeout(this.lossTimer);
    this.shoreImpact.reset();
    this.lastDamage = null;
    this.setSeaControlMode('helm');
    this.lastDeckPosition = null;
    for (const isl of this.isles) isl.userData.done = false;
    const b = this.boss;
    b.hp = b.maxHp; b.sinking = 0; b.resetDynamics();
    b.pos.copy(this.bossHome).add(new THREE.Vector3(40, 0, 0));
    if (this.bossGone) this.scene.add(b.mesh);
    this.bossBeaten = this.bossGone = false;
    this.life.clearBoat();
    this.syncCrew();
    this.fx.clearBalls();
    this.queue = [];
    const p = this.player;
    p.hp = p.maxHp; p.sinking = 0; p.resetDynamics(); p.heading = 0;
    p.pos.set(0, 0, 0);
    const cam = p.mesh.userData.metrics.camera;
    this.camPos.set(0, cam.teleportUp, cam.resetBack);
    this.lost = false;
    this.state = 'sail';
    this.ui.battleHud(null);
  }

  // Put the ship next to a place, bow toward it.
  teleport(to, dist) {
    this.setSeaControlMode('helm');
    const p = this.player, from = to.clone().add(new THREE.Vector3(0, 0, dist));
    from.y = 0;
    p.pos.copy(from);
    p.heading = 0;
    p.resetDynamics();
    const cam = p.mesh.userData.metrics.camera;
    this.camPos.copy(from).add(new THREE.Vector3(0, cam.teleportUp, cam.teleportBack));
  }

  render() {
    if(this.seaControlMode==='deck')this.crewOcclusion?.update(this.deckCamera.eye,this.deckWalker.position);
    this.post.render();
  }
}
