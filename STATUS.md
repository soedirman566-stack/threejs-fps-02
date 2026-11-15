# Status — CINDERLINE (threejs-fps-02 entry)

## What this is

An original round-based tactical FPS (Ember vs Slate, 5v5 with bots) on an
original map, the Kilnworks brickworks yard at dusk. Bomb plant/defuse,
elimination and timeout wins, per-round economy with a buy menu, four weapons
(P9 Sidearm, Raptor SMG, Kestrel Rifle, Longbow DMR with scope), frag and
flash grenades, armour, headshot multiplier, movement spread, crouch/walk/jump,
bot perception (vision cone + hearing), waypoint navigation, site anchors and
rotations, halftime side swap at round 7, first to 7. All sound is synthesised
WebAudio; no audio files.

## Built and verified

- Full game under `game/` (14 fresh modules in `game/src/`, ~106 KB of source),
  written for this entry from the kit starter + the fps design doc. Starter
  plumbing (`main.ts`, `serve.ts`, `vendor/makefun-threejs.ts`, LICENSE) kept;
  three.js 0.187.0 vendored byte-for-byte (sha256 checked against the kit).
- `.makefun/owner.json` names the entry wallet. `shots.json` matches the four
  screenshots. README.md documents controls and layout.
- Runs clean: driven over CDP in headless Chromium — boot, menu, staged scenes
  and a live click-through (play → buy phase → buy menu opens → Digit5 buys a
  frag, $800 → $500) all pass with **zero console errors**. (This VM's Chromium
  refuses loopback HTTP, so pages were served by CDP Fetch interception from
  disk; the game itself needs only a static server.)
- `main.ts` run twice outside the grader: `/output` = game + screenshots +
  dossier; the dossier is deterministic across runs (modulo `generated_at`),
  397 KB of the 1.5 MiB cap, source text 106 KB of the 163,840-byte cap,
  output 23 files / 2.9 MB of the 1,000-file / 64 MiB caps.
- Official kit check (worktree, no transcripts): 4 passed (competition open,
  snapshot, OSI license, entrypoint), 1 failed = transcripts_present only —
  bundling is the submitter's step. Everything else skipped or at-submission.

## Screenshots (1280×720 JPEG, all ≤ 256 KiB)

- `screenshots/1-fight.jpg` (49 KB) — mid-round firefight in the north lane:
  a Slate bot down, rifle in hand, kill pips and timer live.
- `screenshots/2-site.jpg` (58 KB) — charge planted on site A, a Slate bot
  crouched on the defuse, site ring and bomb timer showing.
- `screenshots/3-buy.jpg` (56 KB) — freeze-phase buy menu open at Ember spawn,
  Kestrel owned, $1,650 in hand.
- `screenshots/4-menu.jpg` (47 KB) — the start screen over the yard.

## Gaps / notes

- Not submitted (per instructions): the parent still needs the GitHub repo
  (created after the 2026-11-14T21:30Z open), the transcript bundle, and the
  submit itself, before 2026-11-16T21:30Z.
- Headless play is ~0.5 FPS under SwiftShader, so long live matches were
  verified by deterministic staged simulation (hundreds of fixed steps:
  shooting, kills, plant state) plus the click-through above, not by a full
  12-round headless match.
