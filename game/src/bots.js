// Bot brains: perception (a vision cone with line of sight, plus hearing recent
// gunfire), a small state machine (advance, hold, engage, plant, defuse, rotate,
// retreat) and burst fire with a human-like reaction delay and aim error. Bots
// walk the waypoint graph, stop to shoot (spread punishes movement for them
// too), reload behind no one, throw the grenades they bought, and play the
// objective: the Ember carrier plants on its site, Slate converges and defuses
// once the charge is down. rounds.js owns the plant/defuse mechanics; a bot
// only declares intent through its brain state.
import * as THREE from 'three';
import { defOf, spreadFor, fireGate, consumeRound, tryReload } from './weapons.js';
import { stepBody, groundSpeed } from './actor.js';
import { emit } from './state.js';

export const EMBER_NAMES = ['Vex', 'Ondo', 'Pell', 'Rusk', 'Tamar'];
export const SLATE_NAMES = ['Ilsa', 'Corv', 'Maren', 'Juno', 'Sten'];

export function createBrain(role) {
  return {
    role,                       // entry | planter | anchor | rotator
    site: 'A',                  // assigned objective, set by rounds.js
    post: null,                 // hold position for defenders
    state: 'advance',
    path: [],
    pathI: 0,
    goal: null,
    target: null,
    seenAt: -9,
    seenPos: new THREE.Vector3(),
    reactionT: 0,
    thinkT: Math.random() * 0.12,
    burstLeft: 0,
    burstWait: 0,
    blindT: 0,
    repathT: 0,
    stuckT: 0,
    lastX: 0,
    lastZ: 0,
    crouchShoot: false,
    skill: 0.75 + Math.random() * 0.45,  // aim/reaction scalar; the player is the star
    nadeT: 2 + Math.random() * 3,
  };
}

const eyeV = new THREE.Vector3();
const tgtV = new THREE.Vector3();
const dirV = new THREE.Vector3();

function eyeOf(a) {
  eyeV.set(a.body.pos.x, a.body.pos.y + a.body.eye, a.body.pos.z);
  return eyeV;
}

function angleTo(a, x, z) {
  const dx = x - a.body.pos.x;
  const dz = z - a.body.pos.z;
  let d = Math.atan2(-dx, -dz) - a.body.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function perceive(G, nav, bot, enemies) {
  const brain = bot.brain;
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.body.pos.x - bot.body.pos.x;
    const dz = e.body.pos.z - bot.body.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 44) continue;
    const inCone = dist < 3.6 || Math.abs(angleTo(bot, e.body.pos.x, e.body.pos.z)) < 1.25;
    if (!inCone) continue;
    if (!nav.hasSight(bot.body.pos.x, bot.body.pos.z, e.body.pos.x, e.body.pos.z)) continue;
    if (dist < bestD) { bestD = dist; best = e; }
  }
  if (best) {
    if (brain.target !== best) brain.reactionT = (0.34 + G.rng() * 0.22) / brain.skill;
    brain.target = best;
    brain.seenAt = G.time;
    brain.seenPos.set(best.body.pos.x, best.body.pos.y + 1.1, best.body.pos.z);
    return;
  }
  // Hearing: an enemy who fired in the last second and a half, close by.
  for (const e of enemies) {
    if (!e.alive) continue;
    if (G.time - e.loadout.lastShotAt > 1.5) continue;
    const dist = Math.hypot(e.body.pos.x - bot.body.pos.x, e.body.pos.z - bot.body.pos.z);
    if (dist < 19) {
      brain.seenAt = G.time - 0.4;
      brain.seenPos.set(e.body.pos.x, e.body.pos.y + 1.1, e.body.pos.z);
    }
  }
  if (G.time - brain.seenAt > 4.5) brain.target = null;
}

function setGoal(G, nav, bot, x, z) {
  const brain = bot.brain;
  brain.goal = { x, z };
  brain.path = nav.pathTo(bot.body.pos.x, bot.body.pos.z, x, z);
  brain.pathI = 0;
}

function followPath(G, bot, dt, speedScale, combat) {
  const brain = bot.brain;
  const body = bot.body;
  if (brain.pathI >= brain.path.length) return true;
  const wp = brain.path[brain.pathI];
  const dx = wp.x - body.pos.x;
  const dz = wp.z - body.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.8) { brain.pathI += 1; return brain.pathI >= brain.path.length; }
  const speed = defOf(bot.loadout).moveSpeed * speedScale;
  stepBody(body, dt, dx / dist, dz / dist, speed, false, false);
  body.yaw = Math.atan2(-dx, -dz);
  // Stuck? Shuffle sideways and, failing that, replan.
  brain.stuckT += dt;
  if (brain.stuckT > 0.85) {
    const moved = Math.hypot(body.pos.x - brain.lastX, body.pos.z - brain.lastZ);
    brain.stuckT = 0;
    brain.lastX = body.pos.x;
    brain.lastZ = body.pos.z;
    if (moved < 0.18 && combat) {
      stepBody(body, dt, 0, 0, 0, false, true);
      if (brain.goal) setGoal(G, combat.nav, bot, brain.goal.x, brain.goal.z);
    }
  }
  return false;
}

function faceToward(bot, x, z, dt, rate = 9) {
  const want = Math.atan2(-(x - bot.body.pos.x), -(z - bot.body.pos.z));
  let d = want - bot.body.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  bot.body.yaw += d * Math.min(1, dt * rate);
}

function engage(G, ctx, bot, dt) {
  const brain = bot.brain;
  const body = bot.body;
  const target = brain.target;
  const def = defOf(bot.loadout);
  const eye = eyeOf(bot);
  const dist = Math.hypot(target.body.pos.x - body.pos.x, target.body.pos.z - body.pos.z);
  faceToward(bot, target.body.pos.x, target.body.pos.z, dt, 12);
  const dy = (target.body.pos.y + 1.15) - eye.y;
  body.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.max(1, dist))));
  brain.crouchShoot = dist > 17 && brain.skill > 0.9;
  // Tactical: mostly plant the feet to shoot; a short strafe between bursts.
  const strafing = brain.burstWait > 0.12 && dist < 20;
  const sx = strafing ? Math.cos(body.yaw) * (brain.strafeDir || 1) : 0;
  const sz = strafing ? -Math.sin(body.yaw) * (brain.strafeDir || 1) : 0;
  stepBody(body, dt, sx, sz, def.moveSpeed * 0.5, brain.crouchShoot, false);

  brain.reactionT -= dt;
  brain.burstWait -= dt;
  if (brain.burstLeft <= 0 && brain.burstWait <= 0) {
    brain.burstLeft = def.auto ? 2 + Math.floor(G.rng() * 3) : 1;
    brain.burstWait = 0.24 + G.rng() * 0.3;
    brain.strafeDir = G.rng() < 0.5 ? -1 : 1;
  }
  if (brain.reactionT > 0 || brain.blindT > 0) return;
  if (brain.burstLeft <= 0) return;
  if (!ctx.nav.hasSight(body.pos.x, body.pos.z, target.body.pos.x, target.body.pos.z)) return;
  if (!fireGate(bot.loadout, G.time)) {
    if (bot.loadout.mags[bot.loadout.current] === 0) tryReload(bot.loadout);
    return;
  }
  consumeRound(bot.loadout, G.time);
  brain.burstLeft -= 1;
  const err = (0.028 / brain.skill) + groundSpeed(target.body) * 0.012;
  const aim = tgtV.set(
    target.body.pos.x + (G.rng() * 2 - 1) * err * dist * 0.4,
    target.body.pos.y + 1.12 + (G.rng() * 2 - 1) * err * dist * 0.3,
    target.body.pos.z + (G.rng() * 2 - 1) * err * dist * 0.4,
  );
  const dir = dirV.copy(aim).sub(eye).normalize();
  const spread = spreadFor(def, groundSpeed(body), body.crouching, false);
  dir.x += (G.rng() * 2 - 1) * spread;
  dir.y += (G.rng() * 2 - 1) * spread;
  dir.z += (G.rng() * 2 - 1) * spread;
  ctx.combat.shoot(bot, eye.clone(), dir, def);
  emit(G, 'shot', { actor: bot, pos: body.pos.clone() });
}

export function stepBots(G, ctx, dt) {
  const { nav } = ctx;
  for (const bot of G.actors) {
    if (bot.isPlayer || !bot.alive) continue;
    const brain = bot.brain;
    const body = bot.body;
    brain.blindT = Math.max(0, brain.blindT - dt);
    brain.thinkT -= dt;
    const enemies = G.actors.filter((a) => a.team !== bot.team);
    if (brain.thinkT <= 0) {
      brain.thinkT = 0.12;
      if (brain.blindT <= 0) perceive(G, nav, bot, enemies);
    }

    if (G.phase === 'freeze' || G.phase === 'menu' || G.phase === 'matchover') {
      stepBody(body, dt, 0, 0, 0, false, false);
      continue;
    }
    if (G.phase === 'roundover') {
      stepBody(body, dt, 0, 0, 0, false, false);
      continue;
    }

    const visible = brain.target && G.time - brain.seenAt < 0.35 && brain.blindT <= 0;
    if (visible) {
      brain.state = 'engage';
      engage(G, ctx, bot, dt);
      continue;
    }
    if (brain.state === 'engage') brain.state = 'advance';

    // Objective play.
    const site = G.sites[brain.site];
    if (bot.team === 'ember') {
      if (G.bomb.state === 'carried' && G.bomb.carrier === bot) {
        const d = Math.hypot(body.pos.x - site.x, body.pos.z - site.z);
        if (d < site.r - 0.9) {
          brain.state = 'plant';
          stepBody(body, dt, 0, 0, 0, true, false);
          faceToward(bot, site.x + 6, site.z, dt, 4);
          continue;
        }
        brain.state = 'advance';
        if (!brain.goal || brain.pathI >= brain.path.length) setGoal(G, nav, bot, site.x + (G.rng() * 2 - 1) * 1.5, site.z + (G.rng() * 2 - 1) * 1.5);
        followPath(G, bot, dt, 1, ctx);
        maybeThrow(G, ctx, bot, site);
        continue;
      }
      if (G.bomb.state === 'planted') {
        brain.state = 'hold';
        if (!brain.goal) setGoal(G, nav, bot, site.x + (G.rng() * 4 - 2), site.z + (G.rng() * 4 - 2));
        if (!followPath(G, bot, dt, 0.9, ctx)) continue;
        stepBody(body, dt, 0, 0, 0, G.rng() < 0.4, false);
        faceToward(bot, G.bomb.pos.x - 8, G.bomb.pos.z, dt, 3);
        continue;
      }
      // Escort / take the assigned site.
      brain.state = 'advance';
      const dSite = Math.hypot(body.pos.x - site.x, body.pos.z - site.z);
      if (dSite > site.r + 2.5) {
        if (!brain.goal || brain.pathI >= brain.path.length) {
          setGoal(G, nav, bot, site.x + (G.rng() * 5 - 2.5), site.z + (G.rng() * 5 - 2.5));
        }
        followPath(G, bot, dt, brain.role === 'entry' ? 1 : 0.94, ctx);
        maybeThrow(G, ctx, bot, site);
      } else {
        stepBody(body, dt, 0, 0, 0, false, false);
        faceToward(bot, body.pos.x + 8, body.pos.z, dt, 3);
      }
    } else {
      // Slate: hold posts until the plant, then converge; one defuses.
      if (G.bomb.state === 'planted') {
        const bp = G.bomb.pos;
        const d = Math.hypot(body.pos.x - bp.x, body.pos.z - bp.z);
        if (brain.role === 'defuser' && d > 1.1) {
          brain.state = 'rotate';
          if (!brain.goal || Math.hypot(brain.goal.x - bp.x, brain.goal.z - bp.z) > 2) setGoal(G, nav, bot, bp.x, bp.z);
          followPath(G, bot, dt, 1, ctx);
          continue;
        }
        if (brain.role === 'defuser') {
          brain.state = 'defuse';
          stepBody(body, dt, 0, 0, 0, true, false);
          faceToward(bot, bp.x + 4, bp.z, dt, 4);
          continue;
        }
        brain.state = 'hold';
        if (!brain.goal || Math.hypot(brain.goal.x - bp.x, brain.goal.z - bp.z) > 9) {
          setGoal(G, nav, bot, bp.x + (G.rng() * 10 - 5), bp.z + (G.rng() * 10 - 5));
        }
        if (!followPath(G, bot, dt, 0.95, ctx)) continue;
        stepBody(body, dt, 0, 0, 0, false, false);
        faceToward(bot, bp.x, bp.z, dt, 3);
        continue;
      }
      brain.state = 'hold';
      const post = brain.post || site;
      const dPost = Math.hypot(body.pos.x - post.x, body.pos.z - post.z);
      if (dPost > 1.2) {
        if (!brain.goal || brain.pathI >= brain.path.length) setGoal(G, nav, bot, post.x, post.z);
        followPath(G, bot, dt, 0.97, ctx);
      } else {
        stepBody(body, dt, 0, 0, 0, brain.role === 'anchor' && G.rng() < 0.3, false);
        faceToward(bot, post.lookX ?? body.pos.x - 8, post.lookZ ?? body.pos.z, dt, 2.5);
      }
      // Rotate toward a fresh contact report.
      if (G.time - brain.seenAt < 3.5 && brain.role === 'rotator') {
        brain.state = 'rotate';
        setGoal(G, nav, bot, brain.seenPos.x, brain.seenPos.z);
        followPath(G, bot, dt, 1, ctx);
      }
    }
    // Reload when safe and low.
    if (bot.loadout.mags[bot.loadout.current] < defOf(bot.loadout).mag * 0.35) tryReload(bot.loadout);
  }
}

function maybeThrow(G, ctx, bot, site) {
  const brain = bot.brain;
  brain.nadeT -= 0.016;
  if (brain.nadeT > 0) return;
  brain.nadeT = 2.5 + G.rng() * 3;
  const d = Math.hypot(bot.body.pos.x - site.x, bot.body.pos.z - site.z);
  if (d < 7 || d > 17) return;
  const kind = bot.loadout.grenades.frag > 0 ? 'frag' : bot.loadout.grenades.flash > 0 ? 'flash' : null;
  if (!kind) return;
  if (G.time - brain.seenAt > 6 && kind === 'frag') return;
  bot.loadout.grenades[kind] -= 1;
  const eye = new THREE.Vector3(bot.body.pos.x, bot.body.pos.y + bot.body.eye, bot.body.pos.z);
  const dir = new THREE.Vector3(site.x - bot.body.pos.x, 0.55, site.z - bot.body.pos.z).normalize();
  ctx.grenades.throwGrenade(bot, kind, eye, dir);
}
