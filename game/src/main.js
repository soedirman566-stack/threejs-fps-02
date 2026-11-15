// CINDERLINE boot and the one loop: a fixed 60 Hz simulation (player, bots,
// grenades, combat, rounds) feeding a render at the display's rate, with the
// drained state events turned into HUD and sound. ?shot=buy|fight|site|menu
// with &seed=N stages a deterministic frame for a capture, renders it twice,
// then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, emit } from './state.js';
import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createInput } from './input.js';
import { createRounds, BUY_ITEMS } from './rounds.js';
import { stepBots } from './bots.js';
import { createCombat } from './combat.js';
import { createGrenades } from './grenades.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { stepBody, groundSpeed, poseActorMesh } from './actor.js';
import {
  WEAPONS, defOf, fireGate, consumeRound, tryReload, switchTo, spreadFor,
  stepLoadout, buildViewModels,
} from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 48, 150);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 320);
scene.add(camera);

const G = createState(seed);
const world = createWorld(scene);
G.sites = world.sites;
const nav = createNav(world.nodes, world.colliders);
const combat = createCombat(scene, world, G);
const grenades = createGrenades(scene, world, G, combat, nav);
const rounds = createRounds(G, world, scene);
const player = rounds.player;
const hud = createHud();
const audio = createAudio();
const viewModels = buildViewModels(camera);
viewModels.setWeapon('p9');
const ctx = { nav, combat, grenades, playerUse: false };

// The charge prop: a dark case with a blinking light, carried on a back,
// dropped where its carrier fell, planted inside a site ring.
const bombMesh = new THREE.Group();
const bombCase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.26),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.charcoal), roughness: 0.6, metalness: 0.3 }));
const bombLightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }));
bombLightMesh.position.set(0.1, 0.11, 0);
bombMesh.add(bombCase, bombLightMesh);
scene.add(bombMesh);

let started = false;
let staging = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let nadeCd = 0;
let beepT = 0;
let shake = 0;
let wasReloading = false;

const input = createInput(renderer.domElement, onLockChange);
hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (G.phase === 'matchover') rounds.startMatch();
  if (G.phase === 'menu') { G.phase = 'freeze'; G.phaseT = 9; }
  started = true;
  if (G.phase === 'freeze' && player.alive) hud.setBuyOpen(true);
  hud.hideOverlay();
  input.requestLock();
});
hud.showOverlay('start', G);
rounds.startMatch();
G.phase = 'menu';

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (started && G.phase !== 'matchover' && G.phase !== 'menu') {
    hud.showOverlay(player.alive ? 'paused' : 'dead', G);
  }
}

function playerEye(out) {
  return out.set(player.body.pos.x, player.body.pos.y + player.body.eye, player.body.pos.z);
}
const eyeTmp = new THREE.Vector3();
const dirTmp = new THREE.Vector3();

function playerShoot() {
  const def = defOf(player.loadout);
  if (!fireGate(player.loadout, G.time)) {
    if (player.loadout.mags[player.loadout.current] === 0 && !prevFiring) {
      audio.dryFire();
      tryReload(player.loadout);
    }
    return;
  }
  consumeRound(player.loadout, G.time);
  camera.getWorldDirection(dirTmp);
  const spread = spreadFor(def, groundSpeed(player.body), player.body.crouching, input.state.aiming);
  dirTmp.x += (G.rng() * 2 - 1) * spread;
  dirTmp.y += (G.rng() * 2 - 1) * spread;
  dirTmp.z += (G.rng() * 2 - 1) * spread;
  dirTmp.normalize();
  combat.shoot(player, playerEye(eyeTmp), dirTmp, def);
  viewModels.muzzleFlash();
  audio.shot(def.id, 0);
  player.body.pitch = Math.min(1.45, player.body.pitch + def.kick * (0.85 + G.rng() * 0.3));
  player.body.yaw += (G.rng() * 2 - 1) * def.kick * 0.35;
  emit(G, 'shot', { actor: player, pos: player.body.pos.clone() });
}

function throwNade(kind) {
  if (nadeCd > 0 || player.loadout.grenades[kind] <= 0) return;
  if (G.phase !== 'live' && G.phase !== 'planted') return;
  player.loadout.grenades[kind] -= 1;
  nadeCd = 0.55;
  camera.getWorldDirection(dirTmp);
  grenades.throwGrenade(player, kind, playerEye(eyeTmp), dirTmp);
  audio.throwIt();
}

function bestPrimary() {
  for (const id of ['kestrel', 'longbow', 'raptor']) if (player.loadout.owned[id]) return id;
  return null;
}

function playerControl(dt) {
  const body = player.body;
  const keys = input.state.keys;
  if (!player.alive || G.phase === 'menu' || G.phase === 'matchover' || G.phase === 'roundover') {
    stepBody(body, dt, 0, 0, 0, false, false);
    return;
  }
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const sin = Math.sin(body.yaw);
  const cos = Math.cos(body.yaw);
  let wx = -sin * f + cos * s;
  let wz = -cos * f - sin * s;
  const len = Math.hypot(wx, wz);
  if (len > 0) { wx /= len; wz /= len; }
  const walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const def = defOf(player.loadout);
  const speed = def.moveSpeed * (walk ? 0.52 : 1) * (input.state.aiming ? 0.62 : 1);
  stepBody(body, dt, wx, wz, speed, keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'), keys.has('Space'));

  ctx.playerUse = keys.has('KeyE');
  nadeCd = Math.max(0, nadeCd - dt);

  if (hud.isBuyOpen()) {
    for (let i = 0; i < BUY_ITEMS.length; i += 1) {
      if (input.wasPressed(`Digit${i + 1}`) && rounds.buy(player, BUY_ITEMS[i].id)) audio.buy();
    }
  } else if (G.phase === 'live' || G.phase === 'planted' || G.phase === 'freeze') {
    if (input.wasPressed('Digit1')) switchTo(player.loadout, 'p9');
    if (input.wasPressed('Digit2')) { const p = bestPrimary(); if (p) switchTo(player.loadout, p); }
    if (input.wasPressed('Digit4') || input.wasPressed('KeyG')) throwNade('frag');
    if (input.wasPressed('Digit5')) throwNade('flash');
    if (input.wasPressed('KeyR') && tryReload(player.loadout)) audio.reload();
    const wheel = input.takeWheel();
    if (wheel !== 0) {
      const p = bestPrimary();
      if (p) switchTo(player.loadout, player.loadout.current === 'p9' ? p : 'p9');
    }
    if ((G.phase === 'live' || G.phase === 'planted') && input.state.firing) {
      if (def.auto || !prevFiring) playerShoot();
    }
  }
  if (input.wasPressed('KeyB') && G.phase === 'freeze' && player.alive) {
    hud.setBuyOpen(!hud.isBuyOpen());
  }
  prevFiring = input.state.firing;
}

function step(dt) {
  G.time += dt;
  scene.updateMatrixWorld(true);
  playerControl(dt);
  if (!staging) stepBots(G, ctx, dt);
  for (const a of G.actors) stepLoadout(a.loadout, dt);
  grenades.step(dt);
  combat.step(dt);
  rounds.step(dt, ctx);
  for (const a of G.actors) poseActorMesh(a.mesh, a.body, a.alive, dt);
  // Bomb prop follows its state.
  const bomb = G.bomb;
  if (bomb.state === 'carried' && bomb.carrier) {
    bombMesh.visible = true;
    bombMesh.position.set(bomb.carrier.body.pos.x, bomb.carrier.body.pos.y + 1.15, bomb.carrier.body.pos.z);
    bombMesh.rotation.y = bomb.carrier.body.yaw;
  } else if (bomb.pos) {
    bombMesh.visible = true;
    bombMesh.position.copy(bomb.pos);
  } else {
    bombMesh.visible = false;
  }
  bombLightMesh.material.color.set(bomb.state === 'planted' || bomb.state === 'defusing'
    ? (Math.sin(G.time * 9) > 0 ? PALETTE.danger : '#571512')
    : PALETTE.danger);
  if ((G.phase === 'planted') && bomb.state !== 'detonated') {
    beepT -= dt;
    if (beepT <= 0) {
      beepT = Math.max(0.24, bomb.timer / 40);
      audio.beep(bomb.timer < 6);
    }
  }
}

function presentEvents() {
  const list = G.events.splice(0, G.events.length);
  if (!list.length) return;
  hud.events(G, list);
  for (const e of list) {
    if (e.type === 'shot' && e.actor !== player) {
      audio.shot(e.actor.loadout.current, e.actor.body.pos.distanceTo(player.body.pos));
    } else if (e.type === 'hurt') {
      if (e.attacker === player) { hud.hitMarker(false); audio.hit(false); }
      if (e.victim === player) audio.hurt();
    } else if (e.type === 'kill') {
      if (e.attacker === player) { hud.hitMarker(true); audio.hit(true); }
      if (e.victim === player) shake = Math.max(shake, 0.5);
    } else if (e.type === 'explosion') {
      audio.explosion(e.pos.distanceTo(player.body.pos));
      const d = e.pos.distanceTo(player.body.pos);
      if (d < 9) shake = Math.max(shake, (9 - d) / 9 * 0.7);
    } else if (e.type === 'flashpop') {
      audio.flashPop(e.pos.distanceTo(player.body.pos));
    } else if (e.type === 'roundEnd') {
      audio.roundSting(e.winner === player.team);
      hud.setBuyOpen(false);
    } else if (e.type === 'roundStart') {
      if (started && player.alive) hud.setBuyOpen(true);
    } else if (e.type === 'live') {
      hud.setBuyOpen(false);
    } else if (e.type === 'buy' && e.actor === player) {
      audio.buy();
    }
  }
}

function syncCamera(dt) {
  const body = player.body;
  const look = input.takeLook();
  if (!shot && player.alive) {
    body.yaw -= look.x * 0.0021;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - look.y * 0.0021));
  }
  const targetEye = player.alive ? body.eye : 0.4;
  camera.position.set(body.pos.x, body.pos.y + targetEye + Math.abs(Math.sin(body.walkPhase * Math.PI)) * 0.028 * Math.min(1, groundSpeed(body) / 4), body.pos.z);
  shake = Math.max(0, shake - dt * 1.6);
  const shX = (G.rng() * 2 - 1) * shake * 0.03;
  const shY = (G.rng() * 2 - 1) * shake * 0.03;
  camera.rotation.set(body.pitch + shX, body.yaw + shY, player.alive ? 0 : 0.42, 'YXZ');
  const def = defOf(player.loadout);
  const scoped = input.state.aiming && def.id === 'longbow' && player.alive;
  const targetFov = input.state.aiming && player.alive ? 74 / def.zoom : 74;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
  camera.updateProjectionMatrix();
  hud.setScope(scoped);
  viewModels.setWeapon(scoped ? null : player.loadout.current);
  const reloading = player.loadout.reloadLeft > 0;
  if (reloading !== wasReloading) { viewModels.setReloading(reloading); wasReloading = reloading; }
  viewModels.step(dt, input.state.aiming && !scoped);
  const spread = spreadFor(def, groundSpeed(body), body.crouching, input.state.aiming);
  hud.setCrosshairSpread(5 + spread * 620 + groundSpeed(body) * 0.7);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    presentEvents();
    syncCamera(dt);
    hud.frame(G, dt);
    input.clearPressed();
  }
  renderer.render(scene, camera);
}

// --- Screenshot staging: deterministic scenes that show real systems. ---
function settle(n) { for (let i = 0; i < n; i += 1) step(FIXED_STEP); }

function teleport(a, x, z, yaw) {
  a.body.pos.set(x, 0, z);
  a.body.vel.set(0, 0, 0);
  a.body.yaw = yaw;
  a.body.pitch = 0;
}

function stageShot(name) {
  staging = true;
  hud.hideOverlay();
  const ember = G.actors.filter((a) => a.team === 'ember' && !a.isPlayer);
  const slate = G.actors.filter((a) => a.team === 'slate');
  if (name === 'buy') {
    G.phase = 'freeze';
    G.phaseT = 8;
    player.money = 4350;
    rounds.buy(player, 'kestrel');
    player.money = 1650;
    teleport(player, -19.8, -0.6, -Math.PI / 2 + 0.15);
    teleport(ember[0], -18.2, -3.4, -Math.PI / 2);
    teleport(ember[1], -17.6, 2.6, -Math.PI / 2 + 0.4);
    teleport(ember[2], -15.5, -1.2, -Math.PI / 2 - 0.2);
    settle(6);
    hud.setBuyOpen(true);
  } else if (name === 'fight') {
    player.money = 4350;
    rounds.buy(player, 'kestrel');
    player.money = 2400;
    G.phase = 'live';
    G.phaseT = 74;
    teleport(player, 0.2, -3.6, -Math.PI / 2 - 0.1);
    player.health = 76;
    teleport(ember[0], 5.5, 3.6, -Math.PI / 2);
    teleport(ember[1], -3.4, -4.4, -Math.PI / 2);
    teleport(slate[0], 8.6, -3.4, Math.PI / 2);
    teleport(slate[1], 13.4, -5.4, Math.PI / 2);
    teleport(slate[2], 17.5, -2.6, Math.PI / 2 - 0.4);
    settle(6);
    // A live exchange: an enemy drops to the teammate, the player answers.
    combat.applyDamage(slate[0], 500, ember[0], 'torso', 'kestrel');
    settle(14);
    const eye = new THREE.Vector3(player.body.pos.x, player.body.pos.y + player.body.eye, player.body.pos.z);
    const dir = new THREE.Vector3(1, 0.03, -0.14).normalize();
    combat.shoot(player, eye, dir, WEAPONS.kestrel);
    viewModels.muzzleFlash();
    settle(1);
    presentEvents();
    hud.clearBanner();
    hud.hitMarker(false);
  } else if (name === 'site') {
    player.money = 4350;
    rounds.buy(player, 'kestrel');
    player.money = 950;
    player.health = 58;
    player.armor = 65;
    G.phase = 'planted';
    G.phaseT = 23;
    G.bomb.state = 'planted';
    G.bomb.pos = new THREE.Vector3(14.2, 0.12, -10.2);
    G.bomb.timer = 23;
    teleport(player, 10.2, -6.6, -0.9);
    teleport(ember[0], 11.2, -13.6, -1.1);
    teleport(slate[0], 14.6, -9.6, Math.PI / 2 + 0.5);
    slate[0].body.crouching = true;
    slate[0].body.height = 1.12;
    teleport(slate[1], 18.6, -13.8, Math.PI / 2 + 0.9);
    settle(8);
    presentEvents();
    hud.banner('CHARGE PLANTED', '23 seconds to detonation', 99);
  } else { // menu
    G.phase = 'menu';
    teleport(player, -19.4, 0.2, -Math.PI / 2);
    teleport(ember[0], -18.4, -2.6, -Math.PI / 2);
    teleport(ember[1], -18.8, 3, -Math.PI / 2);
    settle(6);
    hud.showOverlay('start', G);
  }
  syncCamera(0.016);
  hud.frame(G, 0.016);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      window.__debug = {
        phase: G.phase,
        round: G.round,
        alive: G.actors.filter((a) => a.alive).length,
        bomb: G.bomb.state,
      };
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shot) stageShot(shot);
else requestAnimationFrame(frame);
