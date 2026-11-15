// Thrown grenades: a frag that bursts for area damage through the same armour
// rule as bullets, and a flash charge that blinds whoever faces it (bots lose
// their sight for a few seconds; the player gets the white-out event). Bodies
// are small spheres with gravity and a cheap bounce against the collider list.
import * as THREE from 'three';
import { GRENADES } from './weapons.js';
import { emit } from './state.js';

export function createGrenades(scene, world, G, combat, nav) {
  const live = [];
  const fragMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3c3a34'), roughness: 0.6, metalness: 0.3 });
  const flashMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8b95a1'), roughness: 0.35, metalness: 0.6 });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb27a'), transparent: true, opacity: 0, depthWrite: false }));
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color('#ff9a4d'), 0, 16);
  scene.add(boomLight);
  let boomT = 0;
  const probe = new THREE.Box3();

  function insideSolid(p, r) {
    probe.min.set(p.x - r, p.y - r, p.z - r);
    probe.max.set(p.x + r, p.y + r, p.z + r);
    for (const c of world.colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  function throwGrenade(owner, kind, origin, direction) {
    const def = GRENADES[kind];
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), kind === 'frag' ? fragMat : flashMat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    const vel = direction.clone().normalize().multiplyScalar(13.5);
    vel.y += 2.4;
    live.push({ mesh, vel, kind, def, owner, fuse: def.fuse, pos: mesh.position });
    emit(G, 'throw', { actor: owner, kind });
  }

  function detonate(g) {
    const at = g.pos;
    if (g.kind === 'frag') {
      boom.position.copy(at);
      boom.visible = true;
      boomT = 0.32;
      boomLight.position.copy(at).y += 0.6;
      boomLight.intensity = 60;
      for (const a of G.actors) {
        if (!a.alive) continue;
        const centre = new THREE.Vector3(a.body.pos.x, a.body.pos.y + 0.9, a.body.pos.z);
        const dist = centre.distanceTo(at);
        if (dist > g.def.radius) continue;
        if (!nav.hasSight(at.x, at.z, a.body.pos.x, a.body.pos.z) && dist > 1.2) continue;
        combat.applyDamage(a, g.def.damage * (1 - (dist / g.def.radius) * 0.75), g.owner, 'torso', 'frag');
      }
      emit(G, 'explosion', { pos: at.clone() });
    } else {
      boom.position.copy(at);
      boom.visible = true;
      boomT = 0.18;
      boomLight.position.copy(at).y += 0.6;
      boomLight.intensity = 26;
      const toBlast = new THREE.Vector3();
      for (const a of G.actors) {
        if (!a.alive) continue;
        const eye = new THREE.Vector3(a.body.pos.x, a.body.pos.y + a.body.eye, a.body.pos.z);
        const dist = eye.distanceTo(at);
        if (dist > g.def.radius) continue;
        if (!nav.hasSight(at.x, at.z, a.body.pos.x, a.body.pos.z) && dist > 1.6) continue;
        toBlast.copy(at).sub(eye).normalize();
        const facing = new THREE.Vector3(-Math.sin(a.body.yaw) * Math.cos(a.body.pitch), Math.sin(a.body.pitch), -Math.cos(a.body.yaw) * Math.cos(a.body.pitch));
        const dot = facing.dot(toBlast);
        const fall = 1 - dist / g.def.radius;
        let strength = 0;
        if (dot > 0.25) strength = 1;
        else if (dot > -0.35) strength = 0.45;
        else strength = 0.12;
        const seconds = 2.8 * strength * (0.35 + fall * 0.65);
        if (a.isPlayer) emit(G, 'flashed', { strength: Math.min(1, seconds / 2.4) });
        else a.brain.blindT = Math.max(a.brain.blindT, seconds);
        emit(G, 'flashpop', { pos: at.clone() });
      }
    }
  }

  function step(dt) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        detonate(g);
        scene.remove(g.mesh);
        live.splice(i, 1);
        continue;
      }
      g.vel.y -= 15 * dt;
      const p = g.pos;
      const nx = p.x + g.vel.x * dt;
      if (!insideSolid(new THREE.Vector3(nx, p.y, p.z), 0.09)) p.x = nx; else g.vel.x *= -0.42;
      const nz = p.z + g.vel.z * dt;
      if (!insideSolid(new THREE.Vector3(p.x, p.y, nz), 0.09)) p.z = nz; else g.vel.z *= -0.42;
      const ny = p.y + g.vel.y * dt;
      if (ny < 0.09) {
        p.y = 0.09;
        g.vel.y *= -0.38;
        g.vel.x *= 0.72;
        g.vel.z *= 0.72;
        if (Math.abs(g.vel.y) < 0.8) g.vel.y = 0;
      } else if (!insideSolid(new THREE.Vector3(p.x, ny, p.z), 0.09)) p.y = ny;
      else g.vel.y *= -0.38;
    }
    if (boomT > 0) {
      boomT -= dt;
      const k = Math.max(0, boomT / 0.32);
      boom.scale.setScalar(1 + (1 - k) * 4.2);
      boom.material.opacity = k * 0.75;
      boomLight.intensity *= Math.max(0, 1 - dt * 7);
      if (boomT <= 0) boom.visible = false;
    }
  }

  return { throwGrenade, step, liveCount: () => live.length };
}
