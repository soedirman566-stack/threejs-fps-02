// The map: Kilnworks, a disused brickworks yard at dusk. Three horizontal lanes
// (north, mid, south) cut by two brick divider walls with staggered gaps, a kiln
// block and a shed in mid, and a bombsite in each eastern pocket. Every solid is
// an axis-aligned box: the same Box3 list collides the actors, stops bullets and
// blocks the bots' pathing, so what you see is exactly what plays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const std = (hex, rough = 0.92, metal = 0.03) =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: metal });
  const materials = {
    sand: std(PALETTE.sand),
    sandDark: std(PALETTE.sandDark),
    brick: std(PALETTE.brick, 0.95),
    brickDark: std(PALETTE.brickDark, 0.97),
    charcoal: std(PALETTE.charcoal, 0.85, 0.08),
    steel: std(PALETTE.steel, 0.5, 0.5),
    ember: std(PALETTE.ember, 0.7),
    slate: std(PALETTE.slate, 0.7),
    ink: std(PALETTE.ink, 0.6),
  };

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, { collide = true, shoot = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    if (shoot) shootables.push(mesh);
    return mesh;
  }
  function flat(w, d, x, z, material) { // ground paint: no collision, no shadow casting
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), materials[material]);
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter.
  box(47, 0.4, 35.4, 0, -0.2, 0, 'sand');
  box(0.6, 4.4, 35.4, -23.3, 2.2, 0, 'brick');
  box(0.6, 4.4, 35.4, 23.3, 2.2, 0, 'brick');
  box(47.2, 4.4, 0.6, 0, 2.2, -17.5, 'brick');
  box(47.2, 4.4, 0.6, 0, 2.2, 17.5, 'brick');
  // Worn aprons and dust patches so the ground does not read as one flat colour.
  flat(20, 12, 12, -10.5, 'sandDark');
  flat(20, 12, 12, 10.5, 'sandDark');
  flat(9, 30, -19, 0, 'sandDark');
  flat(14, 5, 0, 0, 'sandDark');
  flat(6, 6, -4, -11, 'sandDark');
  flat(6, 6, 4, 11, 'sandDark');

  // Divider walls (3.4 m) with staggered gaps: north gaps at x -9..-5 and 3..7,
  // south gaps at x -3..1 and 9..13, so no lane change is ever a straight run.
  box(12.5, 3.4, 0.5, -15.25, 1.7, -5.5, 'brick');
  box(8, 3.4, 0.5, -1, 1.7, -5.5, 'brick');
  box(14.5, 3.4, 0.5, 14.25, 1.7, -5.5, 'brick');
  box(18.5, 3.4, 0.5, -12.25, 1.7, 5.5, 'brick');
  box(8, 3.4, 0.5, 5, 1.7, 5.5, 'brick');
  box(8.5, 3.4, 0.5, 17.25, 1.7, 5.5, 'brick');

  // Mid: the kiln (with chimney) west, a steel shed east, a low wall between.
  box(5.5, 4.6, 4.5, -11, 2.3, 0, 'brickDark');
  box(6.1, 0.5, 5.1, -11, 4.85, 0, 'charcoal');
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.9, 3.4, 14), materials.brickDark);
  chimney.position.set(-12.2, 6.6, -1);
  chimney.castShadow = true;
  group.add(chimney);
  colliders.push(new THREE.Box3().setFromObject(chimney));
  shootables.push(chimney);
  box(4.5, 3.2, 4, 9, 1.6, 0, 'charcoal');
  box(4.9, 0.35, 4.4, 9, 3.35, 0, 'steel');
  box(0.5, 1.15, 6, 0, 0.575, 0, 'sandDark');

  // Crates and low cover. A crate is 1.2 m; a low is 1.1 m and crouch-safe.
  const crate = (x, z, h = 1.2) => box(1.2, h, 1.2, x, h / 2, z, 'sandDark');
  const low = (x, z, w = 2.4) => box(w, 1.1, 1.2, x, 0.55, z, 'charcoal');
  crate(13, -12.6); crate(13, -11.4); crate(16.8, -8.8); low(14.2, -13.2);
  crate(17.8, -12.4); crate(17.8, -11.2, 1.2);
  crate(13, 12.6); crate(16.8, 8.8); low(14.2, 13.2); crate(11.8, 8.2);
  crate(-4, -2.6); crate(4.6, 2.8); low(-16.5, 2.2); crate(16.5, -2.2);
  crate(-13, -11.2); low(2, -12.6); crate(-19, -8.4);
  crate(-13, 11.2); low(2, 12.6); crate(7.6, 8.6);
  low(-20, -3.4); low(-20, 3.4); low(20.5, 0, 1.2);

  // Bombsites: painted ring, corner posts and a banner pole each, so a site reads
  // from anywhere in its pocket.
  const sites = { A: { x: 15, z: -10.5, r: 4.2 }, B: { x: 15, z: 10.5, r: 4.2 } };
  for (const key of Object.keys(sites)) {
    const s = sites[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ink), transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.045, s.z);
    group.add(ring);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      box(0.18, 1.5, 0.18, s.x + px * s.r, 0.75, s.z + pz * s.r, 'steel');
    }
    box(0.16, 4.6, 0.16, s.x - s.r - 0.8, 2.3, s.z, 'steel', { collide: false });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slate), roughness: 0.8, side: THREE.DoubleSide }));
    banner.position.set(s.x - s.r - 0.8, 3.9, s.z + 0.86);
    group.add(banner);
    shootables.push(banner);
  }

  // Sky dome: a two-stop gradient, warm at the horizon where the sun went down.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#46587a') }, low: { value: new THREE.Color('#c07f4c') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 low; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(low, top, pow(h, 0.75)), 1.0); }',
    }),
  );
  group.add(sky);

  // Light: low warm sun with shadows, cool sky fill, and three lamp glows.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#8b9cc0'), new THREE.Color(PALETTE.fog), 1.25));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb27a'), 2.9);
  sun.position.set(-34, 30, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0007;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5f74a8'), 0.5);
  fill.position.set(20, 18, 24);
  scene.add(fill);
  for (const [x, z] of [[0, 0], [15, -10.5], [15, 10.5]]) {
    const lamp = new THREE.PointLight(new THREE.Color('#ffc98a'), 14, 13, 1.6);
    lamp.position.set(x, 3.4, z);
    scene.add(lamp);
    box(0.14, 3.4, 0.14, x + 0.5, 1.7, z + 0.5, 'steel');
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0') }));
    bulb.position.set(x, 3.45, z);
    group.add(bulb);
  }

  const spawns = {
    ember: [[-20, -3], [-21.2, -1], [-20, 0.6], [-21.2, 2.2], [-19.4, -1.8]],
    slate: [[20, -3], [21.2, -1], [20, 0.6], [21.2, 2.2], [19.4, -1.8]],
  };
  // Pathing nodes: lane rows plus the gap mouths and site hearts.
  const nodes = [];
  for (const z of [-11, 0, 11]) for (const x of [-19, -13, -7, 0, 7, 13, 18]) nodes.push([x, z]);
  nodes.push([-7, -5.5], [5, -5.5], [-1, 5.5], [11, 5.5], [15, -10.5], [15, 10.5], [-19, 0], [19, 0]);

  return { colliders, shootables, sites, spawns, nodes, group };
}
