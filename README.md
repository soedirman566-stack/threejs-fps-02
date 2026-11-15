# CINDERLINE

An original round-based tactical FPS for the browser, built on three.js 0.187.
Two five-player squads fight over the Kilnworks, a disused brickworks yard at
dusk: **Ember** (attack) plants a charge on one of two sites, **Slate**
(defence) stops them or defuses it. First to seven rounds wins; sides swap
after round six.

## Run it

Serve `game/` statically (for example `node serve.ts` from this repository,
then open http://localhost:8123/) and click **Click to play**. No build step,
no network calls: everything, including three.js, is vendored in the repo.

## Play

| Input | Action |
| --- | --- |
| Mouse / WASD | Look / move (Shift walks, Ctrl or C crouches, Space jumps) |
| Click / right-click | Fire / aim down sights |
| R | Reload |
| 1 / 2 | Sidearm / primary |
| 4 or G / 5 | Frag grenade / flash charge |
| B, then 1–6 | Buy menu (freeze phase): SMG, rifle, DMR, vest, frag, flash |
| E (hold) | Plant the charge on a site / defuse it |

Rounds run freeze (9s, buy) → live (115s) → planted (40s) if the charge goes
down. Kills pay $300; round wins pay $2,700 against $1,900 for a loss, so the
economy snowballs like the genre demands. Headshots deal 4× damage, armour
soaks 55% while it lasts, and moving spreads your fire — stop to shoot straight.

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output
  and writes the dossier with the vendored `vendor/makefun-threejs.ts`.
- `game/index.html` — the page and HUD shell (one import map: `three`).
- `game/src/` — the game itself, one job per module: `state` (the single
  store), `world` (the Kilnworks map), `nav` (waypoint graph), `actor` (body
  physics and soldier meshes), `weapons`, `combat`, `grenades`, `bots`
  (perception and tactics), `rounds` (match, economy, bomb), `audio`
  (synthesised WebAudio), `hud`, `input`, and `main` (fixed-step loop).
- `game/vendor/three/` — three.js 0.187.0, byte-for-byte from the kit.
- `screenshots/` — four renders of real staged scenes from this build.
