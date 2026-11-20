/* Семейная Гонка — генерация трассы */
(function (G) {
  'use strict';
  const FR = G.FR;

  const D = (FR.D = 40);          // диаметр шарика
  const R = (FR.R = D / 2);
  const W = (FR.TRACK_W = 196);   // ширина трассы
  const HALF = W / 2;
  const RAIL = (FR.RAIL = 16);    // ширина бортика
  const STEP = (FR.STEP = 6);     // шаг дискретизации
  const START = (FR.START = 340); // линия старта

  FR.THEMES = [
    {
      key: 'meadow', name: 'Солнечная долина', emoji: '🌻',
      ground: '#93d86e', ground2: '#84cb60', patch: '#7cc257',
      track: '#f7e2b5', track2: '#ecd19c', line: 'rgba(170,115,50,0.16)',
      rail: '#ff7b54', railHi: '#ffb592', railLo: '#c94f2c', wood: true,
      decor: [['tree', 4], ['bush', 3], ['flowers', 4], ['rock', 1]],
    },
    {
      key: 'forest', name: 'Сказочный лес', emoji: '🍄',
      ground: '#3f9c61', ground2: '#378e57', patch: '#2f8150',
      track: '#ecc893', track2: '#dfb67d', line: 'rgba(120,70,30,0.18)',
      rail: '#9a6338', railHi: '#c99466', railLo: '#5f3a1d', wood: true,
      decor: [['pine', 6], ['mushroom', 3], ['bush', 2], ['log', 1]],
    },
    {
      key: 'ice', name: 'Ледяной спуск', emoji: '❄️',
      ground: '#edf6ff', ground2: '#dcedfc', patch: '#cfe5fa',
      track: '#c3e6ff', track2: '#a8d7fb', line: 'rgba(255,255,255,0.55)',
      rail: '#3d9bff', railHi: '#a5d3ff', railLo: '#1f6fd1', ice: true,
      decor: [['snowpine', 6], ['snowman', 1], ['iceblock', 2], ['penguin', 1]],
    },
    {
      key: 'candy', name: 'Конфетная страна', emoji: '🍭',
      ground: '#ffd6ec', ground2: '#ffc8e4', patch: '#ffbfe0',
      track: '#fff7ec', track2: '#ffe9d6', line: 'rgba(255,120,180,0.22)',
      rail: '#ff5fa2', railHi: '#ffb0d2', railLo: '#d13a7c', candy: true,
      decor: [['lollipop', 4], ['donut', 3], ['candy', 3], ['cupcake', 2]],
    },
    {
      key: 'night', name: 'Ночной город', emoji: '🌃',
      ground: '#1d2346', ground2: '#181d3c', patch: '#232a55',
      track: '#383f73', track2: '#2f3666', line: 'rgba(130,210,255,0.28)',
      rail: '#ff3fd0', railHi: '#ffb0f0', railLo: '#8f1c74', neon: true, dark: true,
      decor: [['building', 6], ['ntree', 2]],
    },
    {
      key: 'stadium', name: 'Финишный стадион', emoji: '🏟️',
      ground: '#4fb85c', ground2: '#45a852', patch: '#55c063',
      track: '#e9694c', track2: '#d95b40', line: 'rgba(255,255,255,0.85)',
      rail: '#ffffff', railHi: '#ffffff', railLo: '#bfc6cf', stadium: true,
      decor: [['flag', 2], ['bush', 2], ['tree', 2]],
    },
  ];

  // Доли дистанции по этапам
  const SECTION_FRAC = [0.17, 0.17, 0.17, 0.17, 0.17, 0.15];

  FR.buildTrack = function (rng, raceLen) {
    const finish = START + raceLen;
    const total = finish + 1700;
    const HMAX = 1.0; // максимальный угол отклонения от «вверх» (рад)

    // ---- сегменты ----
    const segs = [];
    let len = 0, h = 0;
    const push = (s) => {
      if (s.len <= 0) return;
      segs.push(s);
      len += s.len;
      if (s.type === 'arc') h += s.ang;
    };
    const arc = (ang, radius) => push({ type: 'arc', len: Math.abs(ang) * radius, ang });
    const clampAng = (ang) => {
      if (h + ang > HMAX) ang = HMAX - h;
      if (h + ang < -HMAX) ang = -HMAX - h;
      return ang;
    };

    push({ type: 'straight', len: START + 520 });
    while (len < finish - 2900) {
      if (rng() < 0.26) {
        push({ type: 'straight', len: rng.range(220, 650) });
        continue;
      }
      const radius = rng.range(290, 720);
      const mag = rng.range(0.35, 1.45);
      let dir;
      if (h > 0.25) dir = rng() < 0.8 ? -1 : 1;
      else if (h < -0.25) dir = rng() < 0.8 ? 1 : -1;
      else dir = rng() < 0.5 ? -1 : 1;
      let ang = clampAng(dir * mag);
      if (Math.abs(ang) < 0.25) ang = clampAng(-dir * mag);
      arc(ang, radius);
      if (rng() < 0.3) {
        // S-образная связка
        const a2 = clampAng(-Math.sign(ang) * rng.range(0.4, 1.2));
        if (Math.abs(a2) > 0.2) arc(a2, rng.range(300, 600));
      }
    }
    if (Math.abs(h) > 0.001) arc(-h, 520);
    push({ type: 'straight', len: total - len + 60 });

    // ---- дискретизация ----
    const n = Math.ceil(total / STEP) + 2;
    const X = new Float32Array(n), Y = new Float32Array(n);
    const H = new Float32Array(n), K = new Float32Array(n);
    let x = 0, y = 0, hh = 0, si = 0, segPos = 0;
    for (let i = 0; i < n; i++) {
      X[i] = x; Y[i] = y; H[i] = hh;
      const seg = segs[si];
      const k = seg.type === 'arc' ? seg.ang / seg.len : 0;
      K[i] = k;
      const hm = hh + (k * STEP) / 2;
      x += Math.sin(hm) * STEP;
      y -= Math.cos(hm) * STEP;
      hh += k * STEP;
      segPos += STEP;
      while (si < segs.length - 1 && segPos >= segs[si].len) {
        segPos -= segs[si].len;
        si++;
      }
    }
    // сглаженная кривизна (для физики)
    const KS = new Float32Array(n);
    const win = 12;
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = i - win; j <= i + win; j++) {
        if (j >= 0 && j < n) { s += K[j]; c++; }
      }
      KS[i] = s / c;
    }

    // ---- этапы ----
    const sec = [0];
    let acc = 0;
    for (let j = 0; j < SECTION_FRAC.length - 1; j++) {
      acc += SECTION_FRAC[j];
      sec.push(START + raceLen * acc);
    }
    const TH = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      let t = 0;
      for (let j = 1; j < sec.length; j++) if (s >= sec[j]) t = j;
      TH[i] = t;
    }
    const chunks = [];
    for (let j = 0; j < sec.length; j++) {
      const a = Math.floor(sec[j] / STEP);
      const b = j + 1 < sec.length ? Math.ceil(sec[j + 1] / STEP) : n - 1;
      chunks.push({ theme: j, a, b });
    }

    const track = { X, Y, H, K, KS, TH, n, total, finish, start: START, sections: sec, chunks };

    track.idx = (s) => FR.clamp(Math.round(s / STEP), 0, n - 1);
    track.pos = function (s, l, out) {
      let f = s / STEP;
      if (f < 0) f = 0;
      if (f > n - 2) f = n - 2;
      const i = f | 0, t = f - i;
      const px = X[i] + (X[i + 1] - X[i]) * t;
      const py = Y[i] + (Y[i + 1] - Y[i]) * t;
      const ph = H[i] + (H[i + 1] - H[i]) * t;
      out = out || {};
      out.x = px + Math.cos(ph) * l;
      out.y = py + Math.sin(ph) * l;
      out.h = ph;
      return out;
    };
    track.kAt = (s) => KS[track.idx(s)];
    track.themeAt = (s) => TH[track.idx(s)];

    // ---- препятствия и бонусы ----
    const feats = [];
    const busy = [];
    const isFree = (a, b, gap) => !busy.some((q) => a < q[1] + gap && b > q[0] - gap);
    const maxK = (a, b) => {
      let m = 0;
      for (let i = track.idx(a); i <= track.idx(b); i++) m = Math.max(m, Math.abs(K[i]));
      return m;
    };
    const place = (type, flen, s0, s1, extra) => {
      for (let tries = 0; tries < 40; tries++) {
        const s = rng.range(s0, s1 - flen);
        if (s1 - flen <= s0) return;
        if (type === 'jump' && maxK(s - 60, s + flen + 260) > 1 / 1400) continue;
        if (type === 'pegs' && maxK(s, s + flen) > 1 / 500) continue;
        if (!isFree(s, s + flen, 260)) continue;
        busy.push([s, s + flen]);
        const f = { type, s, len: flen };
        if (extra) extra(f);
        feats.push(f);
        return;
      }
    };
    const PEG_ROWS = [[-62, 21], [-21, 62], [-62, 62], [0], [-40, 40]];
    for (let j = 0; j < sec.length; j++) {
      const s0 = (j === 0 ? START : sec[j]) + 380;
      const s1 = j + 1 < sec.length ? sec[j + 1] - 260 : finish - 950;
      const last = j === sec.length - 1;
      const nBoost = last ? 3 : 4;
      for (let k = 0; k < (last ? 1 : 2); k++) place('jump', 70, s0, s1);
      if (!last) place('wash', 210, s0, s1);
      if (!last) {
        for (let k = 0; k < 2; k++) {
          const rows = rng.int(3, 4);
          place('pegs', rows * 115, s0, s1, (f) => {
            f.pegs = [];
            for (let r = 0; r < rows; r++) {
              const row = rng.pick(PEG_ROWS);
              for (const l of row) f.pegs.push({ s: f.s + 40 + r * 115, l, flash: 0 });
            }
          });
        }
      }
      for (let k = 0; k < nBoost; k++) {
        place('boost', 95, s0, s1, (f) => {
          const opt = rng.int(0, 2);
          if (opt === 0) { f.l0 = -HALF + 10; f.l1 = 4; }
          else if (opt === 1) { f.l0 = -4; f.l1 = HALF - 10; }
          else { f.l0 = -HALF * 0.55; f.l1 = HALF * 0.55; }
        });
      }
      if (j > 0) feats.push({ type: 'gate', s: sec[j], len: 0, theme: j });
    }
    feats.sort((a, b) => a.s - b.s);
    track.feats = feats;

    // ---- профиль скорости «стаи» ----
    const F = new Float32Array(n);
    const WASH = new Uint8Array(n);
    for (const f of feats) {
      if (f.type !== 'wash') continue;
      for (let i = track.idx(f.s); i <= track.idx(f.s + f.len); i++) WASH[i] = 1;
    }
    for (let i = 0; i < n; i++) {
      let f = 1 - 0.16 * Math.min(1, Math.abs(KS[i]) * 330);
      if (FR.THEMES[TH[i]].ice) f *= 1.1;
      if (WASH[i]) f *= 0.86;
      F[i] = f;
    }
    const FS = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = i - 15; j <= i + 15; j++) if (j >= 0 && j < n) { s += F[j]; c++; }
      FS[i] = s / c;
    }
    track.F = FS;
    track.WASH = WASH;
    track.fAt = (s) => FS[track.idx(s)];
    track.washAt = (s) => WASH[track.idx(s)] === 1;

    // ---- декорации ----
    buildDecor(track, rng);
    return track;
  };

  // Ближайшее расстояние от точки до осевой линии трассы (в окрестности индекса)
  function distToTrack(track, x, y, i) {
    const { X, Y, n } = track;
    let best = 1e9;
    const a = Math.max(0, i - 320), b = Math.min(n - 1, i + 320);
    for (let j = a; j <= b; j += 2) {
      const dx = X[j] - x, dy = Y[j] - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  function pickWeighted(rng, list) {
    let sum = 0;
    for (const it of list) sum += it[1];
    let r = rng() * sum;
    for (const it of list) {
      r -= it[1];
      if (r <= 0) return it[0];
    }
    return list[0][0];
  }

  const DECOR_SIZE = {
    tree: [34, 58], bush: [16, 26], flowers: [18, 28], rock: [10, 20],
    pine: [30, 52], mushroom: [10, 16], log: [16, 24],
    snowpine: [30, 50], snowman: [16, 22], iceblock: [14, 24], penguin: [12, 16],
    lollipop: [18, 30], donut: [16, 26], candy: [12, 18], cupcake: [14, 20],
    building: [50, 90], ntree: [20, 30],
    flag: [14, 18], stand: [60, 60], lamp: [8, 8],
  };

  function buildDecor(track, rng) {
    const decor = [], patches = [];
    const { X, Y, H, TH, n } = track;
    const p = {};
    const edge = HALF + RAIL;
    // объекты
    for (let s = 0; s < track.total; s += rng.range(16, 34)) {
      const i = track.idx(s);
      const theme = FR.THEMES[TH[i]];
      for (const side of [-1, 1]) {
        if (rng() < 0.12) continue;
        const type = pickWeighted(rng, theme.decor);
        const sz = DECOR_SIZE[type];
        const size = rng.range(sz[0], sz[1]);
        const dist = edge + 8 + size * 0.9 + Math.pow(rng(), 2.2) * 620;
        track.pos(s, side * dist, p);
        if (distToTrack(track, p.x, p.y, i) < edge + size * 0.95) continue;
        decor.push({ x: p.x, y: p.y, type, size, v: rng.int(0, 3), th: TH[i] });
      }
    }
    // фонари вдоль трассы в ночном городе
    for (let s = 0; s < track.total; s += 230) {
      const i = track.idx(s);
      if (!FR.THEMES[TH[i]].neon) continue;
      for (const side of [-1, 1]) {
        track.pos(s + (side > 0 ? 115 : 0), side * (edge + 16), p);
        decor.push({ x: p.x, y: p.y, type: 'lamp', size: 8, v: 0, th: TH[i], glow: true });
      }
    }
    // трибуны стадиона
    for (let s = track.finish - 1050; s < track.finish + 700; s += 118) {
      for (const side of [-1, 1]) {
        track.pos(s, side * (edge + 58), p);
        decor.push({ x: p.x, y: p.y, type: 'stand', size: 60, v: rng.int(0, 3), th: 5, rot: p.h, side });
      }
    }
    // пятна на земле
    for (let s = 0; s < track.total; s += rng.range(90, 170)) {
      const i = track.idx(s);
      for (const side of [-1, 1]) {
        const dist = rng.range(0, 900);
        track.pos(s, side * dist, p);
        patches.push({ x: p.x, y: p.y, r: rng.range(80, 220), th: TH[i], a: rng.range(0.35, 0.8) });
      }
    }
    decor.sort((a, b) => a.y - b.y);
    patches.sort((a, b) => a.y - b.y);
    track.decor = decor;
    track.patches = patches;
  }
})(typeof window !== 'undefined' ? window : globalThis);
