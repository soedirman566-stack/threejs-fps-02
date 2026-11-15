// Hitscan combat shared by the player and the bots: one ray, the nearest of the
// world's solids and the actors' hit meshes wins, damage from weapons.js with
// range falloff and the head multiplier. Armour soaks a share of every hit.
// Tracers and impact sparks are pooled meshes, never allocated per shot. Kills
// and hurts go out as events; rounds.js pays the money, the HUD shows the feed.
import * as THREE from 'three';
import { damageAt } from './weapons.js';
import { emit } from './state.js';

export function createCombat(scene, world, G) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 180;
  const dirV = new THREE.Vector3();
  const fromV = new THREE.Vector3();

  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.85 });
  const tracers = [];
  for (let i = 0; i < 28; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 1), tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const sparks = [];
  for (let i = 0; i < 14; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffca7a'), transparent: true, opacity: 0.9 }));
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0 });
  }

  function tracer(from, to) {
    const t = tracers.find((e) => e.life <= 0);
    if (!t) return;
    const len = from.distanceTo(to);
    t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    t.mesh.scale.set(1, 1, len);
    t.mesh.lookAt(to);
    t.mesh.visible = true;
    t.life = 0.07;
  }
  function spark(at) {
    const s = sparks.find((e) => e.life <= 0);
    if (!s) return;
    s.mesh.position.copy(at);
    s.mesh.visible = true;
    s.life = 0.09;
  }

  function applyDamage(victim, dmg, attacker, part, weaponId) {
    if (!victim.alive) return false;
    let taken = dmg;
    if (victim.armor > 0) {
      taken = dmg * 0.55;
      victim.armor = Math.max(0, victim.armor - dmg * 0.35);
    }
    victim.health -= taken;
    victim.lastAttacker = attacker;
    victim.lastHurtAt = G.time;
    emit(G, 'hurt', { victim, attacker, part });
    if (victim.health > 0) return false;
    victim.health = 0;
    victim.alive = false;
    victim.deaths += 1;
    if (attacker && attacker !== victim) attacker.kills += 1;
    emit(G, 'kill', { victim, attacker, headshot: part === 'head', weaponId });
    return true;
  }

  // One trigger pull. origin/dir are world space; spread was already applied by
  // the caller. Returns the actor hit, or null.
  function shoot(shooter, origin, direction, def) {
    dirV.copy(direction).normalize();
    fromV.copy(origin);
    raycaster.set(fromV, dirV);
    const targets = [];
    for (const a of G.actors) {
      if (a === shooter || !a.alive) continue;
      for (const m of a.mesh.hitMeshes) targets.push(m);
    }
    const hits = raycaster.intersectObjects(world.shootables.concat(targets), false);
    const muzzle = fromV.clone().addScaledVector(dirV, 0.6);
    const hit = hits[0];
    if (!hit) {
      tracer(muzzle, fromV.clone().addScaledVector(dirV, 90));
      return null;
    }
    tracer(muzzle, hit.point);
    spark(hit.point);
    const ref = hit.object.userData.actorRef;
    if (ref && ref.alive) {
      const part = hit.object.userData.part || 'torso';
      applyDamage(ref, damageAt(def, hit.distance, part), shooter, part, def.id);
      return ref;
    }
    return null;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false; }
    }
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.scale.setScalar(1 + (0.09 - s.life) * 22);
        if (s.life <= 0) { s.mesh.visible = false; s.mesh.scale.setScalar(1); }
      }
    }
  }

  return { shoot, applyDamage, step };
}
