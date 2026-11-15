// The DOM HUD: health and armour, ammunition, money, the round clock and score,
// alive pips for both teams, a killfeed, centre banners, the plant/defuse
// progress bar, the buy menu, and the damage and flash overlays. It reads the
// state store once a frame and takes the drained events for the feed and the
// banners; it never writes simulation state except through the buy callback.
import { BUY_ITEMS } from './rounds.js';
import { WEAPONS, GRENADES } from './weapons.js';

const el = (id) => document.getElementById(id);

export function createHud() {
  const nodes = {
    overlay: el('overlay'), title: el('overlay-title'), copy: el('overlay-copy'), play: el('play'),
    healthFill: el('health-fill'), healthNum: el('health-num'), armorNum: el('armor-num'),
    ammoMag: el('ammo-mag'), ammoReserve: el('ammo-reserve'), weaponName: el('weapon-name'),
    money: el('money'), timer: el('timer'), phase: el('phase-label'),
    scoreEmber: el('score-ember'), scoreSlate: el('score-slate'),
    pipsEmber: el('pips-ember'), pipsSlate: el('pips-slate'),
    feed: el('killfeed'), banner: el('banner'), bannerSub: el('banner-sub'),
    action: el('action'), actionLabel: el('action-label'), actionFill: el('action-fill'),
    hitmarker: el('hitmarker'), crosshair: el('crosshair'),
    vignette: el('vignette'), flash: el('flash'), scope: el('scope'),
    buyMenu: el('buy-menu'), buyItems: el('buy-items'), buyMoney: el('buy-money'),
    bombTag: el('bomb-tag'),
  };
  let bannerT = 0;
  let vignetteT = 0;
  let flashA = 0;
  let buyOpen = false;
  let buyHandler = null;
  const feedTimers = [];

  function banner(main, sub = '', hold = 2.6) {
    nodes.banner.textContent = main;
    nodes.bannerSub.textContent = sub;
    nodes.banner.style.opacity = '1';
    nodes.bannerSub.style.opacity = '1';
    bannerT = hold;
  }

  function feed(html) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = html;
    nodes.feed.appendChild(row);
    while (nodes.feed.children.length > 5) nodes.feed.removeChild(nodes.feed.firstChild);
    feedTimers.push(setTimeout(() => { row.style.opacity = '0'; setTimeout(() => row.remove(), 400); }, 4600));
  }

  function teamName(team) { return team === 'ember' ? 'Ember' : 'Slate'; }
  function nameHtml(a) { return `<span class="${a.team}">${a.name}</span>`; }

  function events(G, list) {
    for (const e of list) {
      if (e.type === 'kill') {
        const w = e.weaponId === 'frag' ? 'Frag' : (WEAPONS[e.weaponId]?.name || 'Rifle');
        feed(`${e.attacker ? nameHtml(e.attacker) : '<span>—</span>'} <i>${w}${e.headshot ? ' ⌖' : ''}</i> ${nameHtml(e.victim)}`);
      } else if (e.type === 'roundStart') {
        banner(`ROUND ${e.round}`, G.player.team === 'ember' ? 'Plant the charge, or eliminate Slate' : 'Hold the sites');
      } else if (e.type === 'live') {
        banner('LIVE', '', 1.1);
      } else if (e.type === 'planted') {
        banner('CHARGE PLANTED', '40 seconds to detonation', 3);
      } else if (e.type === 'defused') {
        banner('CHARGE DEFUSED', '', 2);
      } else if (e.type === 'roundEnd') {
        const won = e.winner === G.player.team;
        banner(won ? 'ROUND WON' : 'ROUND LOST', `${teamName(e.winner)} — ${e.reason}`, 3.6);
      } else if (e.type === 'halfSwap') {
        banner('SIDES SWAP', 'Pistols again — money reset', 3);
      } else if (e.type === 'matchEnd') {
        showOverlay('match', G);
      } else if (e.type === 'hurt' && e.victim.isPlayer) {
        vignetteT = 0.55;
      } else if (e.type === 'flashed') {
        flashA = Math.max(flashA, e.strength);
      }
    }
  }

  function pips(node, actors, team) {
    const alive = actors.filter((a) => a.team === team).map((a) => (a.alive ? '●' : '○')).join(' ');
    if (node.textContent !== alive) node.textContent = alive;
  }

  function frame(G, dt) {
    const p = G.player;
    if (!p) return;
    const pct = Math.max(0, Math.round(p.health));
    nodes.healthFill.style.width = `${pct}%`;
    nodes.healthNum.textContent = String(pct);
    nodes.armorNum.textContent = p.armor > 0 ? `🛡 ${Math.round(p.armor)}` : '';
    const def = WEAPONS[p.loadout.current];
    nodes.ammoMag.textContent = String(p.loadout.mags[p.loadout.current]);
    nodes.ammoReserve.textContent = `/ ${p.loadout.reserves[p.loadout.current]}`;
    nodes.ammoMag.parentElement.classList.toggle('empty', p.loadout.mags[p.loadout.current] === 0);
    const nades = `${p.loadout.grenades.frag ? ' ✸frag' : ''}${p.loadout.grenades.flash ? ' ✸flash' : ''}`;
    nodes.weaponName.textContent = def.name + nades;
    nodes.money.textContent = `$${p.money}`;
    const t = Math.max(0, Math.ceil(G.phaseT));
    nodes.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    nodes.timer.classList.toggle('low', (G.phase === 'live' || G.phase === 'planted') && t <= 10);
    nodes.phase.textContent = { freeze: 'BUY PHASE', live: 'ROUND LIVE', planted: 'CHARGE PLANTED', roundover: 'ROUND OVER', menu: '', matchover: 'MATCH OVER' }[G.phase] || '';
    nodes.scoreEmber.textContent = String(G.wins.ember);
    nodes.scoreSlate.textContent = String(G.wins.slate);
    pips(nodes.pipsEmber, G.actors, 'ember');
    pips(nodes.pipsSlate, G.actors, 'slate');

    const bomb = G.bomb;
    if ((bomb.state === 'planting' || bomb.state === 'defusing') && bomb.actor) {
      nodes.action.hidden = false;
      nodes.actionLabel.textContent = bomb.state === 'planting' ? 'PLANTING' : 'DEFUSING';
      nodes.actionFill.style.width = `${Math.round(bomb.progress * 100)}%`;
    } else {
      nodes.action.hidden = true;
    }
    nodes.bombTag.hidden = !(bomb.state === 'planted' || bomb.state === 'defusing');
    if (!nodes.bombTag.hidden) nodes.bombTag.textContent = `✸ CHARGE DOWN — ${Math.max(0, Math.ceil(bomb.timer))}s`;

    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) { nodes.banner.style.opacity = '0'; nodes.bannerSub.style.opacity = '0'; }
    }
    if (vignetteT > 0) vignetteT = Math.max(0, vignetteT - dt);
    nodes.vignette.style.opacity = String(Math.min(0.85, vignetteT * 1.6));
    if (flashA > 0) flashA = Math.max(0, flashA - dt * 0.45);
    nodes.flash.style.opacity = String(flashA * 0.96);
    if (buyOpen) renderBuy(p);
  }

  function renderBuy(p) {
    nodes.buyMoney.textContent = `$${p.money}`;
    let html = '';
    for (const item of BUY_ITEMS) {
      const owned = item.id === 'armor' ? p.armor > 40 : GRENADES[item.id] ? p.loadout.grenades[item.id] >= 1 : p.loadout.owned[item.id];
      const afford = p.money >= item.price;
      html += `<div class="buy-row ${owned ? 'owned' : ''} ${afford ? '' : 'poor'}"><kbd>${item.key}</kbd><span>${item.label}</span><b>${owned ? 'OWNED' : `$${item.price}`}</b></div>`;
    }
    if (nodes.buyItems.dataset.html !== html) {
      nodes.buyItems.innerHTML = html;
      nodes.buyItems.dataset.html = html;
    }
  }

  function showOverlay(mode, G) {
    const p = G.player;
    if (mode === 'start') {
      nodes.title.textContent = 'CINDERLINE';
      nodes.copy.textContent = 'A tactical shooter at the Kilnworks yard. You lead Ember: plant the charge on a site, or wipe out Slate. First to seven rounds; sides swap at six. Click to play.';
      nodes.play.textContent = 'Click to play';
    } else if (mode === 'paused') {
      nodes.title.textContent = 'Paused';
      nodes.copy.textContent = `Round ${G.round} — Ember ${G.wins.ember} · Slate ${G.wins.slate}. Click to resume.`;
      nodes.play.textContent = 'Click to resume';
    } else if (mode === 'dead') {
      nodes.title.textContent = 'You are down';
      nodes.copy.textContent = 'Your team plays on. The next round revives you.';
      nodes.play.textContent = 'Spectate';
    } else if (mode === 'match') {
      const won = G.winner === p.team;
      nodes.title.textContent = G.winner === null ? 'Match drawn' : won ? 'MATCH WON' : 'MATCH LOST';
      nodes.copy.textContent = `Final score — Ember ${G.wins.ember} · Slate ${G.wins.slate}. Your line: ${p.kills} kills, ${p.deaths} deaths.`;
      nodes.play.textContent = 'Play again';
    }
    nodes.overlay.hidden = false;
  }

  return {
    events,
    frame,
    banner,
    clearBanner() {
      bannerT = 0;
      nodes.banner.style.opacity = '0';
      nodes.bannerSub.style.opacity = '0';
    },
    hitMarker(killed) {
      nodes.hitmarker.classList.add('on');
      nodes.hitmarker.style.transform = `translate(-50%, -50%) rotate(45deg) scale(${killed ? 1.3 : 1})`;
      clearTimeout(nodes.hitmarker._t);
      nodes.hitmarker._t = setTimeout(() => nodes.hitmarker.classList.remove('on'), killed ? 160 : 95);
    },
    setCrosshairSpread(px) { nodes.crosshair.style.setProperty('--gap', `${px}px`); },
    setScope(on) { nodes.scope.hidden = !on; },
    setBuyOpen(open, handler) {
      buyOpen = open;
      buyHandler = handler || buyHandler;
      nodes.buyMenu.hidden = !open;
    },
    isBuyOpen: () => buyOpen,
    showOverlay,
    hideOverlay() { nodes.overlay.hidden = true; },
    onPlay(cb) { nodes.play.addEventListener('click', cb); },
    isOverlayShown: () => !nodes.overlay.hidden,
  };
}
