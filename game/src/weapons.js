// Weapons: the four guns and two grenades as data, the per-actor loadout state
// (magazines, reserves, reload, cooldown), and the first-person view models.
// Damage lives here as numbers; combat.js applies it with range falloff and the
// head multiplier, so a headshot from any gun decides a fight and spraying on
// the move (spreadMove) does not.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9:      { id: 'p9', name: 'P9 Sidearm', slot: 'sidearm', price: 0, damage: 34, headMult: 4, rpm: 380, mag: 12, reserve: 48, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03, moveSpeed: 5.3, range: 55, auto: false, kick: 0.01, zoom: 1.15 },
  raptor:  { id: 'raptor', name: 'Raptor SMG', slot: 'primary', price: 1250, damage: 26, headMult: 3.4, rpm: 750, mag: 32, reserve: 96, reload: 1.9, spreadStill: 0.006, spreadMove: 0.045, moveSpeed: 5.35, range: 40, auto: true, kick: 0.007, zoom: 1.15 },
  kestrel: { id: 'kestrel', name: 'Kestrel Rifle', slot: 'primary', price: 2700, damage: 36, headMult: 4, rpm: 620, mag: 30, reserve: 90, reload: 2.2, spreadStill: 0.0022, spreadMove: 0.032, moveSpeed: 5.0, range: 80, auto: true, kick: 0.011, zoom: 1.2 },
  longbow: { id: 'longbow', name: 'Longbow DMR', slot: 'primary', price: 3400, damage: 72, headMult: 2.6, rpm: 75, mag: 8, reserve: 32, reload: 2.6, spreadStill: 0.0008, spreadMove: 0.06, moveSpeed: 4.7, range: 120, auto: false, kick: 0.03, zoom: 2.4 },
};
export const BUY_ORDER = ['raptor', 'kestrel', 'longbow'];

export const GRENADES = {
  frag:  { id: 'frag', name: 'Frag Grenade', price: 300, fuse: 1.6, radius: 5.5, damage: 115 },
  flash: { id: 'flash', name: 'Flash Charge', price: 200, fuse: 1.05, radius: 17 },
};

export function createLoadout() {
  return {
    owned: { p9: true },
    mags: { p9: WEAPONS.p9.mag },
    reserves: { p9: WEAPONS.p9.reserve },
    current: 'p9',
    cooldown: 0,
    reloadLeft: 0,
    grenades: { frag: 0, flash: 0 },
    lastShotAt: -9,
  };
}

export function defOf(loadout) {
  return WEAPONS[loadout.current];
}

export function giveWeapon(loadout, id) {
  loadout.owned[id] = true;
  loadout.mags[id] = WEAPONS[id].mag;
  loadout.reserves[id] = WEAPONS[id].reserve;
}

export function switchTo(loadout, id) {
  if (!loadout.owned[id] || loadout.current === id) return false;
  loadout.current = id;
  loadout.reloadLeft = 0;
  loadout.cooldown = Math.max(loadout.cooldown, 0.25);
  return true;
}

export function stepLoadout(loadout, dt) {
  loadout.cooldown = Math.max(0, loadout.cooldown - dt);
  if (loadout.reloadLeft > 0) {
    loadout.reloadLeft = Math.max(0, loadout.reloadLeft - dt);
    if (loadout.reloadLeft === 0) {
      const def = defOf(loadout);
      const take = Math.min(def.mag - loadout.mags[loadout.current], loadout.reserves[loadout.current]);
      loadout.mags[loadout.current] += take;
      loadout.reserves[loadout.current] -= take;
    }
  }
}

export function tryReload(loadout) {
  const def = defOf(loadout);
  if (loadout.reloadLeft > 0 || loadout.mags[loadout.current] >= def.mag || loadout.reserves[loadout.current] <= 0) return false;
  loadout.reloadLeft = def.reload;
  return true;
}

export function fireGate(loadout, time) {
  const def = defOf(loadout);
  return loadout.reloadLeft === 0 && loadout.cooldown === 0 && loadout.mags[loadout.current] > 0 && time - loadout.lastShotAt >= 60 / def.rpm;
}

export function consumeRound(loadout, time) {
  loadout.mags[loadout.current] -= 1;
  loadout.lastShotAt = time;
  loadout.cooldown = 60 / defOf(loadout).rpm;
}

export function spreadFor(def, speed, crouching, aiming) {
  let s = def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
  if (crouching) s *= 0.62;
  if (aiming) s *= 0.45;
  return s;
}

export function damageAt(def, dist, part) {
  const fall = Math.max(0.5, 1 - Math.max(0, dist - 14) / def.range * 0.5);
  const zone = part === 'head' ? def.headMult : part === 'legs' ? 0.72 : 1;
  return def.damage * fall * zone;
}

// --- First-person view models: one small group per gun, swapped on switch. ---
export function buildViewModels(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.charcoal), roughness: 0.55, metalness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.4, metalness: 0.55 });
  const gripM = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4c4238'), roughness: 0.8 });

  function gun(parts) {
    const g = new THREE.Group();
    for (const [w, h, d, x, y, z, m] of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || dark);
      mesh.position.set(x, y, z);
      g.add(mesh);
    }
    g.visible = false;
    camera.add(g);
    return g;
  }
  const models = {
    p9: gun([[0.05, 0.07, 0.27, 0, 0, -0.03, steel], [0.045, 0.13, 0.06, 0, -0.09, 0.08, gripM], [0.018, 0.035, 0.018, 0, 0.05, -0.13, dark]]),
    raptor: gun([[0.06, 0.09, 0.42, 0, 0, -0.06, steel], [0.035, 0.035, 0.3, 0, 0.02, -0.36, dark], [0.05, 0.17, 0.07, 0, -0.12, -0.02, gripM], [0.045, 0.06, 0.17, 0, -0.02, 0.19, gripM]]),
    kestrel: gun([[0.065, 0.095, 0.5, 0, 0, -0.06, steel], [0.038, 0.038, 0.46, 0, 0.028, -0.46, dark], [0.055, 0.19, 0.08, 0, -0.13, 0.03, gripM], [0.05, 0.07, 0.22, 0, -0.025, 0.26, gripM], [0.026, 0.05, 0.026, 0, 0.075, -0.14, dark], [0.05, 0.05, 0.14, 0, -0.01, -0.3, dark]]),
    longbow: gun([[0.065, 0.1, 0.62, 0, 0, -0.12, steel], [0.034, 0.034, 0.52, 0, 0.028, -0.6, dark], [0.075, 0.085, 0.13, 0, 0.1, -0.16, dark], [0.055, 0.17, 0.08, 0, -0.12, 0.06, gripM], [0.05, 0.07, 0.26, 0, -0.025, 0.32, gripM]]),
  };
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc46b'), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  camera.add(flash);
  const light = new THREE.PointLight(new THREE.Color('#ffb27a'), 0, 6);
  camera.add(light);

  const HIP = { x: 0.27, y: -0.235, z: -0.52 };
  const ADS = { x: 0, y: -0.155, z: -0.46 };
  let current = null;
  let kick = 0;
  let flashT = 0;
  let reloadDip = 0;

  return {
    setWeapon(id) {
      if (current) models[current].visible = false;
      current = id;
      if (id && models[id]) models[id].visible = true;
    },
    muzzleFlash() { flashT = 0.055; kick = 0.05; },
    setReloading(on) { reloadDip = on ? 1 : 0; },
    step(dt, aiming) {
      if (!current) return;
      kick += (0 - kick) * Math.min(1, dt * 13);
      flashT = Math.max(0, flashT - dt);
      const g = models[current];
      const target = aiming ? ADS : HIP;
      g.position.x += (target.x - g.position.x) * Math.min(1, dt * 16);
      g.position.y += (target.y - reloadDip * 0.1 - g.position.y) * Math.min(1, dt * 16);
      g.position.z = target.z + kick;
      g.rotation.x = kick * 2.4 - reloadDip * 0.5;
      const def = WEAPONS[current];
      const mz = current === 'longbow' ? -1.55 : current === 'p9' ? -0.78 : current === 'raptor' ? -1.05 : -1.3;
      flash.position.set(g.position.x, g.position.y + 0.03, mz);
      flash.visible = flashT > 0 && !aiming;
      flash.rotation.z = flashT * 40;
      light.position.set(g.position.x, g.position.y, -0.7);
      light.intensity = flashT > 0 ? 16 : 0;
      void def;
    },
  };
}
