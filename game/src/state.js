// The one state store. Every module reads and writes this object; nothing keeps a
// second copy of match facts. It also owns the seeded random source (so screenshot
// staging and bot behaviour are reproducible) and the event queue the HUD and the
// audio synth drain each frame: the simulation emits facts, presentation reacts.

export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createState(seed) {
  return {
    rng: mulberry32(seed * 2654435761),
    time: 0,               // simulation seconds since boot
    phase: 'menu',         // menu | freeze | live | planted | roundover | matchover
    phaseT: 0,             // seconds left in the current timed phase
    round: 1,
    half: 1,               // sides swap after round 6
    wins: { ember: 0, slate: 0 },
    actors: [],            // every combatant, the player first
    player: null,
    sites: null,           // filled by world.js: { A: {x,z,r}, B: {x,z,r} }
    bomb: {
      state: 'carried',    // carried | dropped | planting | planted | defusing | detonated | defused
      carrier: null,
      pos: null,           // THREE.Vector3 once on the ground
      timer: 0,            // seconds to detonation while planted
      progress: 0,         // plant/defuse progress 0..1
      actor: null,         // who is planting or defusing
    },
    events: [],            // {type, ...} for HUD + audio, drained every frame
    winner: null,          // team that took the round, once decided
    winReason: '',
    mvpNote: '',
  };
}

export function emit(G, type, data = {}) {
  G.events.push({ type, ...data });
}
