// The match: ten actors, twelve rounds at most, sides swapped after six, first
// to seven. This module owns the phase machine (freeze with buying, live,
// planted, round over), the economy, team assignments and the bomb's whole
// life — carried, dropped, planting, planted, defusing, detonated, defused.
// Bots declare intent through their brain state; the player through the use
// key main.js passes in. Win money, kill money and the plant bonus land here,
// where the kill events arrive.
import * as THREE from 'three';
import { createBody, buildActorMesh } from './actor.js';
import { createLoadout, giveWeapon, WEAPONS, GRENADES } from './weapons.js';
import { createBrain, EMBER_NAMES, SLATE_NAMES } from './bots.js';
import { emit } from './state.js';

export const FREEZE_TIME = 9;
export const ROUND_TIME = 115;
export const BOMB_TIME = 40;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 6;
export const ARMOR_PRICE = 1000;
const WIN_PAY = 2700;
const LOSS_PAY = 1900;

export const BUY_ITEMS = [
  { id: 'raptor', label: 'Raptor SMG', price: WEAPONS.raptor.price, key: '1' },
  { id: 'kestrel', label: 'Kestrel Rifle', price: WEAPONS.kestrel.price, key: '2' },
  { id: 'longbow', label: 'Longbow DMR', price: WEAPONS.longbow.price, key: '3' },
  { id: 'armor', label: 'Vest + Helmet', price: ARMOR_PRICE, key: '4' },
  { id: 'frag', label: 'Frag Grenade', price: GRENADES.frag.price, key: '5' },
  { id: 'flash', label: 'Flash Charge', price: GRENADES.flash.price, key: '6' },
];

const SLATE_POSTS = {
  A: [{ x: 12.2, z: -13.4, lookX: 4, lookZ: -11 }, { x: 18.4, z: -7.8, lookX: 10, lookZ: -10 }],
  B: [{ x: 12.2, z: 13.4, lookX: 4, lookZ: 11 }, { x: 18.4, z: 7.8, lookX: 10, lookZ: 10 }],
  MID: { x: 11.5, z: -1.5, lookX: -6, lookZ: 0 },
};

export function createRounds(G, world, scene) {
  const actors = [];
  const player = makeActor(G, world, scene, 'You', 'ember', true, 0);
  actors.push(player);
  G.player = player;
  const emberBots = EMBER_NAMES.slice(0, 4).map((n, i) => makeActor(G, world, scene, n, 'ember', false, i + 1));
  const slateBots = SLATE_NAMES.map((n, i) => makeActor(G, world, scene, n, 'slate', false, i + 1));
  actors.push(...emberBots, ...slateBots);
  G.actors = actors;

  function makeActor(G2, world2, scene2, name, team, isPlayer, idx) {
    const body = createBody(world2.colliders, 0, 0);
    const mesh = buildActorMesh(team);
    if (isPlayer) mesh.group.visible = false; // the camera is the player's head; bots still hit the body
    scene2.add(mesh.group);
    const actor = {
      id: idx, name, team, isPlayer,
      body, mesh,
      alive: true, health: 100, armor: 0,
      money: 800, kills: 0, deaths: 0,
      loadout: createLoadout(),
      brain: isPlayer ? null : createBrain('support'),
      lastAttacker: null, lastHurtAt: -9,
    };
    for (const m of mesh.hitMeshes) m.userData.actorRef = actor;
    return actor;
  }

  function resetActor(a, x, z, yaw) {
    a.alive = true;
    a.health = 100;
    a.body.pos.set(x, 0, z);
    a.body.vel.set(0, 0, 0);
    a.body.yaw = yaw;
    a.body.pitch = 0;
    a.body.crouching = false;
    a.mesh.fall = 0;
    if (a.brain) {
      a.brain.path = [];
      a.brain.pathI = 0;
      a.brain.goal = null;
      a.brain.target = null;
      a.brain.state = 'advance';
      a.brain.blindT = 0;
    }
  }

  function teamActors(team) { return actors.filter((a) => a.team === team); }
  function aliveCount(team) { return teamActors(team).filter((a) => a.alive).length; }

  function assignRound() {
    const attackSite = G.rng() < 0.5 ? 'A' : 'B';
    const embers = teamActors('ember');
    const bots = embers.filter((a) => !a.isPlayer);
    bots.forEach((b, i) => {
      b.brain.site = attackSite;
      b.brain.role = i === 0 ? 'planter' : i < 3 ? 'entry' : 'support';
      b.brain.post = null;
    });
    const carrier = bots[0];
    G.bomb.state = 'carried';
    G.bomb.carrier = carrier;
    G.bomb.pos = null;
    G.bomb.timer = 0;
    G.bomb.progress = 0;
    G.bomb.actor = null;
    const slates = teamActors('slate').filter((a) => !a.isPlayer);
    slates.forEach((b, i) => {
      if (i < 2) { b.brain.role = 'anchor'; b.brain.site = 'A'; b.brain.post = SLATE_POSTS.A[i]; }
      else if (i < 4) { b.brain.role = 'anchor'; b.brain.site = 'B'; b.brain.post = SLATE_POSTS.B[i - 2]; }
      else { b.brain.role = 'rotator'; b.brain.site = attackSite; b.brain.post = SLATE_POSTS.MID; }
    });
    // Spawns.
    for (const team of ['ember', 'slate']) {
      const list = teamActors(team);
      const spawns = world.spawns[team];
      list.forEach((a, i) => {
        const [x, z] = spawns[i % spawns.length];
        resetActor(a, x, z, team === 'ember' ? -Math.PI / 2 : Math.PI / 2);
      });
    }
  }

  function botBuy(b) {
    const L = b.loadout;
    const buy = (price) => { if (b.money >= price) { b.money -= price; return true; } return false; };
    if (!L.owned.kestrel && buy(WEAPONS.kestrel.price)) giveWeapon(L, 'kestrel');
    else if (!L.owned.raptor && buy(WEAPONS.raptor.price)) giveWeapon(L, 'raptor');
    if (L.owned.kestrel || L.owned.raptor) L.current = L.owned.kestrel ? 'kestrel' : 'raptor';
    if (b.armor <= 0 && buy(ARMOR_PRICE)) b.armor = 100;
    if (b.brain.role === 'entry' && L.grenades.frag === 0 && buy(GRENADES.frag.price)) L.grenades.frag = 1;
    if (b.brain.role === 'support' && L.grenades.flash === 0 && buy(GRENADES.flash.price)) L.grenades.flash = 1;
    // Top up ammunition for what is owned.
    for (const id of Object.keys(L.owned)) {
      L.mags[id] = WEAPONS[id].mag;
      L.reserves[id] = WEAPONS[id].reserve;
    }
  }

  function buy(a, itemId) {
    if (G.phase !== 'freeze' && G.phase !== 'menu') return false;
    const L = a.loadout;
    if (itemId === 'armor') {
      if (a.armor > 40 || a.money < ARMOR_PRICE) return false;
      a.money -= ARMOR_PRICE;
      a.armor = 100;
      return true;
    }
    if (GRENADES[itemId]) {
      if (L.grenades[itemId] >= 1 || a.money < GRENADES[itemId].price) return false;
      a.money -= GRENADES[itemId].price;
      L.grenades[itemId] += 1;
      return true;
    }
    const def = WEAPONS[itemId];
    if (!def || L.owned[itemId] || a.money < def.price) return false;
    a.money -= def.price;
    giveWeapon(L, itemId);
    L.current = itemId;
    emit(G, 'buy', { actor: a, item: itemId });
    return true;
  }

  function startRound() {
    assignRound();
    for (const a of actors) if (!a.isPlayer) botBuy(a);
    G.phase = 'freeze';
    G.phaseT = FREEZE_TIME;
    G.winner = null;
    emit(G, 'roundStart', { round: G.round });
  }

  function startMatch() {
    G.round = 1;
    G.half = 1;
    G.wins = { ember: 0, slate: 0 };
    for (const a of actors) {
      a.money = 800;
      a.kills = 0;
      a.deaths = 0;
      a.armor = 0;
      a.loadout = createLoadout();
      a.team = a.isPlayer || emberBots.includes(a) ? 'ember' : 'slate';
      // Mesh colours stay with the roster: at the half the rosters swap sides,
      // spawns and names, exactly like a side swap in the sport.
    }
    startRound();
  }

  function endRound(winner, reason) {
    G.phase = 'roundover';
    G.phaseT = 5;
    G.winner = winner;
    G.winReason = reason;
    G.wins[winner] += 1;
    for (const a of actors) {
      a.money += a.team === winner ? WIN_PAY : LOSS_PAY;
      if (G.bomb.state === 'detonated' || G.bomb.state === 'planted') {
        if (a.team === 'ember') a.money += 300;
      }
      a.money = Math.min(16000, a.money);
    }
    emit(G, 'roundEnd', { winner, reason });
  }

  function matchWinner() {
    if (G.wins.ember >= 7) return 'ember';
    if (G.wins.slate >= 7) return 'slate';
    if (G.round >= 12) return G.wins.ember === G.wins.slate ? null : (G.wins.ember > G.wins.slate ? 'ember' : 'slate');
    return undefined;
  }

  function nextRound() {
    const mw = matchWinner();
    if (mw !== undefined) {
      G.phase = 'matchover';
      G.winner = mw;
      emit(G, 'matchEnd', { winner: mw });
      return;
    }
    G.round += 1;
    if (G.round === 7) {
      G.half = 2;
      for (const a of actors) {
        a.team = a.team === 'ember' ? 'slate' : 'ember';
        a.money = 800;
        a.armor = 0;
        a.loadout = createLoadout();
      }
      emit(G, 'halfSwap', {});
    }
    startRound();
  }

  function siteAt(pos) {
    for (const key of Object.keys(G.sites)) {
      const s = G.sites[key];
      if (Math.hypot(pos.x - s.x, pos.z - s.z) < s.r) return key;
    }
    return null;
  }

  function step(dt, ctx) {
    G.phaseT -= dt;
    // Kill money arrives as events from combat; pay it here, once per event
    // (events live until the frame drains them, which may be steps later).
    for (const e of G.events) {
      if (e.type === 'kill' && !e.paid && e.attacker && e.attacker !== e.victim) {
        e.paid = true;
        e.attacker.money = Math.min(16000, e.attacker.money + 300);
      }
    }

    if (G.phase === 'freeze') {
      if (G.phaseT <= 0) { G.phase = 'live'; G.phaseT = ROUND_TIME; emit(G, 'live', {}); }
      return;
    }
    if (G.phase === 'roundover') {
      if (G.phaseT <= 0) nextRound();
      return;
    }
    if (G.phase !== 'live' && G.phase !== 'planted') return;

    const bomb = G.bomb;
    // Dropped charge: an Ember walking over it picks it up.
    if (bomb.state === 'dropped') {
      for (const a of teamActors('ember')) {
        if (a.alive && Math.hypot(a.body.pos.x - bomb.pos.x, a.body.pos.z - bomb.pos.z) < 1.25) {
          bomb.state = 'carried';
          bomb.carrier = a;
          emit(G, 'pickup', { actor: a });
          break;
        }
      }
    }
    if (bomb.carrier && !bomb.carrier.alive && bomb.state === 'carried') {
      bomb.state = 'dropped';
      bomb.pos = bomb.carrier.body.pos.clone();
      bomb.carrier = null;
      emit(G, 'dropped', {});
    }

    // Planting.
    const planter = bomb.carrier;
    const plantWanted = planter && planter.alive && siteAt(planter.body.pos)
      && (planter.isPlayer ? ctx.playerUse : planter.brain && planter.brain.state === 'plant');
    if (bomb.state === 'carried' && plantWanted) {
      bomb.state = 'planting';
      bomb.progress = 0;
      bomb.actor = planter;
    }
    if (bomb.state === 'planting') {
      const a = bomb.actor;
      const still = a && a.alive && siteAt(a.body.pos) && (a.isPlayer ? ctx.playerUse : a.brain.state === 'plant');
      if (!still) {
        bomb.state = a && a.alive ? 'carried' : 'dropped';
        if (bomb.state === 'dropped') bomb.pos = a.body.pos.clone();
        bomb.carrier = bomb.state === 'carried' ? a : null;
        bomb.progress = 0;
        bomb.actor = null;
      } else {
        bomb.progress += dt / PLANT_TIME;
        if (bomb.progress >= 1) {
          bomb.state = 'planted';
          bomb.pos = a.body.pos.clone();
          bomb.pos.y = 0.12;
          bomb.timer = BOMB_TIME;
          bomb.progress = 0;
          bomb.actor = null;
          a.money = Math.min(16000, a.money + 300);
          G.phase = 'planted';
          G.phaseT = BOMB_TIME;
          const defuser = teamActors('slate').filter((x) => x.alive && !x.isPlayer)
            .sort((p, q) => p.body.pos.distanceTo(bomb.pos) - q.body.pos.distanceTo(bomb.pos))[0];
          if (defuser) defuser.brain.role = 'defuser';
          emit(G, 'planted', { pos: bomb.pos.clone() });
        }
      }
    }

    // Defusing.
    if (bomb.state === 'planted' || bomb.state === 'defusing') {
      let defuser = null;
      for (const a of teamActors('slate')) {
        if (!a.alive) continue;
        if (Math.hypot(a.body.pos.x - bomb.pos.x, a.body.pos.z - bomb.pos.z) > 1.35) continue;
        if (a.isPlayer ? ctx.playerUse : a.brain && a.brain.state === 'defuse') { defuser = a; break; }
      }
      if (defuser) {
        bomb.state = 'defusing';
        bomb.actor = defuser;
        bomb.progress += dt / DEFUSE_TIME;
        if (bomb.progress >= 1) {
          bomb.state = 'defused';
          defuser.money = Math.min(16000, defuser.money + 300);
          emit(G, 'defused', {});
          endRound('slate', 'Charge defused');
          return;
        }
      } else if (bomb.state === 'defusing') {
        bomb.state = 'planted';
        bomb.progress = 0;
        bomb.actor = null;
      }
      bomb.timer -= dt;
      G.phaseT = bomb.timer;
      if (bomb.timer <= 0) {
        bomb.state = 'detonated';
        emit(G, 'explosion', { pos: bomb.pos.clone(), big: true });
        endRound('ember', 'Charge detonated');
        return;
      }
    }

    // Elimination and timeout.
    const emberAlive = aliveCount('ember');
    const slateAlive = aliveCount('slate');
    if (G.phase === 'planted') {
      if (slateAlive === 0) { endRound('ember', 'Slate eliminated'); return; }
    } else {
      if (emberAlive === 0) { endRound('slate', 'Ember eliminated'); return; }
      if (slateAlive === 0) { endRound('ember', 'Slate eliminated'); return; }
      if (G.phaseT <= 0) { endRound('slate', 'Time expired'); return; }
    }
  }

  return { actors, player, startMatch, startRound, step, buy, aliveCount, teamActors };
}
