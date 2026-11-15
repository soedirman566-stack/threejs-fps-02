// All sound is synthesised with WebAudio: no audio files, nothing to load. Gun
// reports are filtered noise bursts whose brightness and volume fall with
// distance, hits and kills are short ticks and dings, the charge beeps faster
// as it runs down, and round stingers are two-note figures. The module only
// plays; main.js feeds it the drained simulation events and local actions.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function noise(dur, { freq = 1800, q = 0.8, gain = 0.5, type = 'bandpass', slide = 0 } = {}) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slide) filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq + slide), t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, { gain = 0.25, type = 'sine', slide = 0, delay = 0 } = {}) {
    if (!ensure()) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function shot(weaponId, dist) {
    const near = 1 / (1 + dist * 0.055);
    if (near < 0.04) return;
    const bright = 2600 - Math.min(1800, dist * 30);
    if (weaponId === 'longbow') { noise(0.22, { freq: bright, gain: 0.85 * near, slide: -1600 }); tone(120, 0.16, { gain: 0.4 * near, type: 'triangle', slide: -60 }); }
    else if (weaponId === 'p9') { noise(0.09, { freq: bright + 500, gain: 0.5 * near, slide: -900 }); }
    else if (weaponId === 'raptor') { noise(0.07, { freq: bright + 300, gain: 0.55 * near, slide: -800 }); }
    else { noise(0.13, { freq: bright, gain: 0.7 * near, slide: -1200 }); tone(160, 0.08, { gain: 0.25 * near, type: 'triangle', slide: -70 }); }
  }

  return {
    unlock() { ensure(); },
    shot,
    dryFire() { tone(1400, 0.03, { gain: 0.12, type: 'square' }); },
    reload() { noise(0.05, { freq: 900, gain: 0.2 }); tone(500, 0.05, { gain: 0.15, type: 'square', delay: 0.12 }); tone(760, 0.05, { gain: 0.18, type: 'square', delay: 0.3 }); },
    hit(killed) { tone(killed ? 1560 : 1180, killed ? 0.14 : 0.06, { gain: 0.22, type: 'sine' }); if (killed) tone(2093, 0.18, { gain: 0.16, delay: 0.05 }); },
    hurt() { noise(0.12, { freq: 300, gain: 0.4, type: 'lowpass' }); },
    throwIt() { noise(0.16, { freq: 700, gain: 0.12, slide: 500 }); },
    explosion(dist) {
      const near = 1 / (1 + dist * 0.04);
      noise(0.7, { freq: 220, gain: 0.9 * near, type: 'lowpass', slide: -120 });
      tone(58, 0.6, { gain: 0.7 * near, type: 'sine', slide: -24 });
    },
    flashPop(dist) { const near = 1 / (1 + dist * 0.05); noise(0.05, { freq: 3400, gain: 0.4 * near }); tone(5200, 0.3, { gain: 0.1 * near, slide: -2400 }); },
    beep(final) { tone(final ? 1760 : 1174, final ? 0.16 : 0.07, { gain: 0.2, type: 'square' }); },
    defuseTick() { tone(880, 0.04, { gain: 0.12, type: 'square' }); },
    buy() { tone(1320, 0.06, { gain: 0.16, type: 'square' }); tone(1760, 0.09, { gain: 0.14, type: 'square', delay: 0.06 }); },
    roundSting(won) {
      if (won) { tone(523, 0.16, { gain: 0.2, type: 'triangle' }); tone(784, 0.26, { gain: 0.2, type: 'triangle', delay: 0.13 }); }
      else { tone(392, 0.16, { gain: 0.2, type: 'triangle' }); tone(311, 0.3, { gain: 0.2, type: 'triangle', delay: 0.13 }); }
    },
    plantStart() { tone(660, 0.08, { gain: 0.16, type: 'square' }); },
  };
}
