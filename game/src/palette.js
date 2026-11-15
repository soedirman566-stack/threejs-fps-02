// CINDERLINE look plan, in one place: a brickworks yard at dusk. Warm sand and
// terracotta against charcoal structures, with one teal accent for the defending
// team and a hot ember orange for the attackers. The CSS custom properties in
// index.html carry the same names, so the HUD and the world agree.
export const PALETTE = {
  sky: '#2e3444',      // dusk blue over the yard
  fog: '#4a4038',      // warm haze at distance
  sand: '#b9906a',     // yard ground, packed earth and dust
  sandDark: '#96754f', // worn paths and apron slabs
  brick: '#9a4a32',    // terracotta brick walls
  brickDark: '#703623',// kiln brick, scorched
  charcoal: '#37332e', // sheds, kiln roof, steelwork
  steel: '#5a6068',    // doors, pipes, crate bands
  ember: '#ff7a33',    // attacker team colour
  slate: '#37b8a2',    // defender team colour (teal)
  ink: '#f2ead9',      // warm white: text, light
  muted: '#9c917d',    // secondary text, worn paint
  danger: '#e5484d',   // damage, bomb light
};

export const TEAM_COLORS = {
  ember: PALETTE.ember,
  slate: PALETTE.slate,
};
