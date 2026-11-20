/* Семейная Гонка — звук (всё синтезируется, без файлов) */
(function (G) {
  'use strict';
  const FR = G.FR;

  const A = {
    ctx: null, master: null, sfx: null, music: null,
    musicOn: true, sfxOn: true,
    noise: null, roll: null, crowd: null,
    musicTimer: null, nextNote: 0, beat: 0, tempo: 118, intense: 0,
    last: {},
  };

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return;
    }
    const AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return;
    const ctx = (A.ctx = new AC());
    A.master = ctx.createGain();
    A.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    A.master.connect(comp);
    comp.connect(ctx.destination);
    A.sfx = ctx.createGain();
    A.sfx.gain.value = A.sfxOn ? 1 : 0;
    A.sfx.connect(A.master);
    A.music = ctx.createGain();
    A.music.gain.value = A.musicOn ? 0.55 : 0;
    A.music.connect(A.master);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.noise = buf;
  };

  A.setMusic = function (on) {
    A.musicOn = on;
    if (A.music) A.music.gain.setTargetAtTime(on ? 0.55 : 0, A.ctx.currentTime, 0.1);
  };
  A.setSfx = function (on) {
    A.sfxOn = on;
    if (A.sfx) A.sfx.gain.setTargetAtTime(on ? 1 : 0, A.ctx.currentTime, 0.05);
  };

  function rate(key, ms) {
    const now = performance.now();
    if (A.last[key] && now - A.last[key] < ms) return false;
    A.last[key] = now;
    return true;
  }

  function noiseSrc() {
    const s = A.ctx.createBufferSource();
    s.buffer = A.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  function tone(freq, type, t, a, peak, dec, dest, detune) {
    const ctx = A.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.value = detune;
    env(g, t, a, peak, dec);
    o.connect(g);
    g.connect(dest || A.sfx);
    o.start(t);
    o.stop(t + a + dec + 0.05);
    return o;
  }

  function burst(t, freq, q, peak, dec, type) {
    const ctx = A.ctx;
    const s = noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, 0.003, peak, dec);
    s.connect(f); f.connect(g); g.connect(A.sfx);
    s.start(t, Math.random());
    s.stop(t + dec + 0.05);
    return f;
  }

  // ---------- эффекты ----------
  A.clack = function (power) {
    if (!A.ctx || !rate('clack', 60)) return;
    const t = A.ctx.currentTime;
    const v = FR.clamp(power / 140, 0.15, 1);
    burst(t, 2600 + Math.random() * 1500, 3, 0.35 * v, 0.04);
    tone(1800 + Math.random() * 900, 'sine', t, 0.002, 0.18 * v, 0.06);
  };
  A.rail = function (power) {
    if (!A.ctx || !rate('rail', 90)) return;
    const t = A.ctx.currentTime;
    const v = FR.clamp(power / 150, 0.2, 1);
    burst(t, 500, 1.2, 0.4 * v, 0.09, 'lowpass');
    tone(170, 'sine', t, 0.003, 0.3 * v, 0.12);
  };
  A.peg = function () {
    if (!A.ctx || !rate('peg', 70)) return;
    const t = A.ctx.currentTime;
    const f = 1300 + Math.random() * 500;
    tone(f, 'sine', t, 0.002, 0.16, 0.35);
    tone(f * 1.5, 'sine', t, 0.002, 0.08, 0.25);
    tone(f * 2.76, 'sine', t, 0.002, 0.04, 0.15);
  };
  A.boost = function () {
    if (!A.ctx || !rate('boost', 180)) return;
    const ctx = A.ctx, t = ctx.currentTime;
    const f = burst(t, 400, 2, 0.35, 0.5);
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(3800, t + 0.4);
    const o = tone(300, 'sawtooth', t, 0.01, 0.05, 0.35);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.35);
  };
  A.jump = function () {
    if (!A.ctx || !rate('jump', 150)) return;
    const t = A.ctx.currentTime;
    const o = tone(320, 'triangle', t, 0.01, 0.12, 0.3);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.25);
  };
  A.land = function (power) {
    if (!A.ctx || !rate('land', 90)) return;
    const t = A.ctx.currentTime;
    const v = FR.clamp(power / 300, 0.2, 1);
    burst(t, 260, 0.8, 0.5 * v, 0.14, 'lowpass');
    const o = tone(120, 'sine', t, 0.004, 0.35 * v, 0.18);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  };
  A.whoosh = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const f = burst(t, 900, 1, 0.25, 0.7);
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.7);
  };
  A.beep = function (high) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    tone(high ? 988 : 659, 'square', t, 0.005, 0.12, high ? 0.6 : 0.25);
    tone(high ? 1976 : 1318, 'sine', t, 0.005, 0.06, high ? 0.5 : 0.2);
  };
  A.ding = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    [880, 1320].forEach((f, i) => tone(f, 'sine', t + i * 0.09, 0.005, 0.15, 0.4));
  };
  A.fanfare = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime + 0.05;
    const notes = [[523, 0, 0.18], [659, 0.16, 0.18], [784, 0.32, 0.18], [1047, 0.5, 0.9], [784, 0.95, 0.15], [1047, 1.1, 1.2]];
    for (const [f, dt, d] of notes) {
      tone(f, 'sawtooth', t + dt, 0.02, 0.08, d, null, -6);
      tone(f, 'sawtooth', t + dt, 0.02, 0.08, d, null, 6);
      tone(f / 2, 'triangle', t + dt, 0.02, 0.12, d);
    }
  };
  A.cheer = function () {
    if (!A.ctx) return;
    const ctx = A.ctx, t = ctx.currentTime;
    const s = noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    s.connect(f); f.connect(g); g.connect(A.sfx);
    s.start(t); s.stop(t + 4.1);
    for (let i = 0; i < 6; i++) {
      const o = tone(1800 + Math.random() * 900, 'sine', t + 0.2 + Math.random() * 1.5, 0.05, 0.05, 0.35);
      o.frequency.exponentialRampToValueAtTime(2600 + Math.random() * 600, t + 2);
    }
  };

  // ---------- постоянные звуки: шорох качения и трибуны ----------
  A.startAmbient = function () {
    if (!A.ctx || A.roll) return;
    const ctx = A.ctx;
    const mk = (type, freq, q) => {
      const s = noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(A.sfx);
      s.start();
      return { s, f, g };
    };
    A.roll = mk('lowpass', 420, 0.7);
    A.crowd = mk('bandpass', 950, 0.5);
  };
  A.setAmbient = function (speed, ice, crowd) {
    if (!A.roll) return;
    const t = A.ctx.currentTime;
    A.roll.g.gain.setTargetAtTime(0.1 * FR.clamp(speed, 0, 1.6), t, 0.15);
    A.roll.f.frequency.setTargetAtTime(ice ? 1600 : 420, t, 0.3);
    A.crowd.g.gain.setTargetAtTime(0.22 * FR.clamp(crowd, 0, 1), t, 0.4);
  };
  A.stopAmbient = function () {
    if (!A.roll) return;
    for (const n of [A.roll, A.crowd]) {
      try { n.s.stop(); } catch (e) { /* уже остановлен */ }
    }
    A.roll = A.crowd = null;
  };

  // ---------- музыка ----------
  // Весёлая петля: C – G – Am – F
  const CHORDS = [
    [48, 52, 55, 60, 64, 67],
    [43, 50, 55, 59, 62, 67],
    [45, 52, 57, 60, 64, 69],
    [41, 48, 53, 57, 60, 65],
  ];
  const MELODY = [
    72, -1, 76, 79, 77, 76, 74, -1, 74, 71, 74, 79, 77, 74, 71, -1,
    72, 76, 72, 69, 72, 76, 81, 79, 77, -1, 76, 74, 72, -1, -1, -1,
  ];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  A.startMusic = function () {
    if (!A.ctx || A.musicTimer) return;
    A.nextNote = A.ctx.currentTime + 0.1;
    A.beat = 0;
    A.musicTimer = setInterval(schedule, 25);
  };
  A.stopMusic = function () {
    if (A.musicTimer) clearInterval(A.musicTimer);
    A.musicTimer = null;
  };
  A.setIntensity = function (k) { A.intense = k; };

  function schedule() {
    const ctx = A.ctx;
    while (A.nextNote < ctx.currentTime + 0.12) {
      playStep(A.beat, A.nextNote);
      const tempo = A.tempo + A.intense * 22;
      A.nextNote += 60 / tempo / 4; // шестнадцатые
      A.beat++;
    }
  }

  function playStep(b, t) {
    const step = b % 16;
    const bar = Math.floor(b / 16);
    const chord = CHORDS[bar % 4];
    const out = A.music;
    // бочка
    if (step % 4 === 0) {
      const o = tone(110, 'sine', t, 0.002, 0.55, 0.16, out);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    }
    // хэт
    if (step % 2 === 1 || A.intense > 0.5) {
      const s = noiseSrc();
      const f = A.ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 7000;
      const g = A.ctx.createGain();
      env(g, t, 0.001, step % 4 === 2 ? 0.09 : 0.05, 0.04);
      s.connect(f); f.connect(g); g.connect(out);
      s.start(t); s.stop(t + 0.06);
    }
    // хлопок
    if (step === 4 || step === 12) {
      const s = noiseSrc();
      const f = A.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
      const g = A.ctx.createGain();
      env(g, t, 0.002, 0.2, 0.12);
      s.connect(f); f.connect(g); g.connect(out);
      s.start(t); s.stop(t + 0.15);
    }
    // бас
    if (step === 0 || step === 6 || step === 8 || step === 14) {
      tone(mtof(chord[0] - 12 + (step === 14 ? 7 : 0)), 'triangle', t, 0.005, 0.3, 0.2, out);
    }
    // арпеджио
    if (step % 2 === 0) {
      const n = chord[1 + ((step / 2) % 5)];
      const o = tone(mtof(n), 'square', t, 0.004, 0.035, 0.12, out);
      o.detune.value = 4;
    }
    // мелодия (каждый второй цикл)
    if (bar % 8 >= 4) {
      const m = MELODY[(bar % 2) * 16 + step];
      if (m > 0 && step % 2 === 0) {
        tone(mtof(m), 'triangle', t, 0.01, 0.09, 0.22, out);
        tone(mtof(m + 12), 'sine', t, 0.01, 0.025, 0.18, out);
      }
    }
  }

  FR.Audio = A;
})(window);
