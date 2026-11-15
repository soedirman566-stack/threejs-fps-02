// Combatants: one body simulation and one low-poly soldier mesh, shared by the
// player and every bot so movement, collision and hit zones can never drift
// apart. The body is a vertical box resolved axis by axis against the world's
// colliders; the mesh is boxes and a sphere in team colours, posed from the body
// each frame (walk swing, aim pitch on the gun rig, a fall when dead).
import * as THREE from 'three';
import { PALETTE, TEAM_COLORS } from './palette.js';

export const RADIUS = 0.34;
export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.12;
export const STAND_EYE = 1.58;
export const CROUCH_EYE = 1.0;
const GRAVITY = 20;

export function createBody(colliders, x, z) {
  const body = {
    colliders,
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    crouching: false,
    onGround: true,
    walkPhase: 0,
  };
  return body;
}

const probe = new THREE.Box3();
function overlaps(body, x, y, z, height, lift) {
  probe.min.set(x - RADIUS, y + lift, z - RADIUS);
  probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
  for (const c of body.colliders) if (probe.intersectsBox(c)) return c;
  return null;
}

// wishX/wishZ is a unit (or zero) desired direction; speed is the cap for this
// step (walk, crouch, rifle-in-hand all differ). Acceleration is high on the
// ground and weak in the air, so stopping to shoot is a real decision.
export function stepBody(body, dt, wishX, wishZ, speed, crouch, jump) {
  if (crouch && !body.crouching) {
    body.crouching = true;
    body.height = CROUCH_HEIGHT;
  } else if (!crouch && body.crouching && !overlaps(body, body.pos.x, body.pos.y, body.pos.z, STAND_HEIGHT, 0.02)) {
    body.crouching = false;
    body.height = STAND_HEIGHT;
  }
  const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
  body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

  const accel = body.onGround ? 11 : 1.6;
  const blend = Math.min(1, accel * dt);
  body.vel.x += (wishX * speed - body.vel.x) * blend;
  body.vel.z += (wishZ * speed - body.vel.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - 10 * dt);
    body.vel.x *= damp;
    body.vel.z *= damp;
  }
  if (jump && body.onGround) {
    body.vel.y = 6.2;
    body.onGround = false;
  }
  body.vel.y -= GRAVITY * dt;

  const nx = body.pos.x + body.vel.x * dt;
  if (!overlaps(body, nx, body.pos.y, body.pos.z, body.height, 0.04)) body.pos.x = nx;
  else body.vel.x = 0;
  const nz = body.pos.z + body.vel.z * dt;
  if (!overlaps(body, body.pos.x, body.pos.y, nz, body.height, 0.04)) body.pos.z = nz;
  else body.vel.z = 0;

  body.pos.y += body.vel.y * dt;
  body.onGround = false;
  const hit = overlaps(body, body.pos.x, body.pos.y, body.pos.z, body.height, 0);
  if (hit && body.vel.y <= 0) {
    body.pos.y = hit.max.y;
    body.vel.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.pos.y = hit.min.y - body.height;
    body.vel.y = 0;
  }
  if (body.pos.y < 0) {
    body.pos.y = 0;
    body.vel.y = 0;
    body.onGround = true;
  }
  body.vel.y = Math.max(-30, body.vel.y);
  const planar = Math.hypot(body.vel.x, body.vel.z);
  body.walkPhase += planar * dt * 1.9;
  return planar;
}

export function groundSpeed(body) {
  return Math.hypot(body.vel.x, body.vel.z);
}

const matCache = {};
function mat(hex, rough = 0.8, metal = 0.05) {
  if (!matCache[hex]) matCache[hex] = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: metal });
  return matCache[hex];
}

// A soldier from primitives: legs that swing, a team-coloured torso, a helmeted
// head, and a gun on a pitch rig so aim reads in screenshots. Head, torso and
// legs are separate hit meshes with userData.part set.
export function buildActorMesh(team) {
  const group = new THREE.Group();
  const teamMat = mat(TEAM_COLORS[team], 0.65);
  const darkMat = mat(PALETTE.charcoal, 0.85);
  const skinMat = mat('#c9a189', 0.7);

  function leg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.13 * side, 0.78, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.2), darkMat);
    mesh.position.y = -0.39;
    mesh.castShadow = true;
    mesh.userData.part = 'legs';
    pivot.add(mesh);
    group.add(pivot);
    return { pivot, mesh };
  }
  const legL = leg(-1);
  const legR = leg(1);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.62, 0.32), teamMat);
  torso.position.y = 1.09;
  torso.castShadow = true;
  torso.userData.part = 'torso';
  group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.36), darkMat);
  vest.position.y = 1.12;
  vest.userData.part = 'torso';
  group.add(vest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), skinMat);
  head.position.y = 1.56;
  head.castShadow = true;
  head.userData.part = 'head';
  group.add(head);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.13, 0.32), teamMat);
  helmet.position.y = 1.68;
  helmet.userData.part = 'head';
  group.add(helmet);

  const rig = new THREE.Group();
  rig.position.set(0.18, 1.32, 0);
  group.add(rig);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.62), darkMat);
  gun.position.set(0, 0, -0.28);
  gun.castShadow = true;
  rig.add(gun);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.4), teamMat);
  arm.position.set(-0.06, -0.08, -0.12);
  arm.rotation.x = 0.5;
  rig.add(arm);

  const hitMeshes = [torso, vest, head, helmet, legL.mesh, legR.mesh];
  return { group, rig, legL: legL.pivot, legR: legR.pivot, torso, head, hitMeshes, fall: 0 };
}

export function poseActorMesh(mesh, body, alive, dt) {
  mesh.group.position.copy(body.pos);
  mesh.group.rotation.set(0, body.yaw, 0);
  if (alive) {
    mesh.fall = 0;
    mesh.group.rotation.x = 0;
    const speed = groundSpeed(body);
    const swing = Math.min(1, speed / 4) * 0.55;
    mesh.legL.rotation.x = Math.sin(body.walkPhase * Math.PI) * swing;
    mesh.legR.rotation.x = -Math.sin(body.walkPhase * Math.PI) * swing;
    mesh.group.position.y = body.pos.y + Math.abs(Math.sin(body.walkPhase * Math.PI)) * 0.035 * Math.min(1, speed / 4);
    mesh.rig.rotation.x = body.pitch;
    const crouchDrop = body.crouching ? 0.34 : 0;
    mesh.torso.position.y = 1.09 - crouchDrop;
    mesh.head.position.y = 1.56 - crouchDrop;
    mesh.rig.position.y = 1.32 - crouchDrop;
  } else {
    mesh.fall = Math.min(1, mesh.fall + dt / 0.38);
    mesh.group.rotation.x = -mesh.fall * Math.PI * 0.48;
    mesh.group.position.y = body.pos.y - mesh.fall * 0.25;
  }
}
