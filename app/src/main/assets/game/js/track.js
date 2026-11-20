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

  const CELL = 140;
  const gkey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------- геометрия: петли, развороты и мосты ----------
  function generatePath(rng, finish, total) {
    const CLEAR = W + 2 * RAIL + 54;   // ближе этого — трассы касаются
    const RS = Math.round(300 / STEP); // длина подъёма/спуска моста
    const RECENT = 75;
    const X = [], Y = [], H = [], K = [], E = [], UNDER = [];
    const grid = new Map();
    const bridges = [];
    const segs = [];
    let lastDir = 1;

    const gAdd = (i) => {
      const k = gkey(Math.floor(X[i] / CELL), Math.floor(Y[i] / CELL));
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(i);
    };
    const gDel = (i) => {
      const a = grid.get(gkey(Math.floor(X[i] / CELL), Math.floor(Y[i] / CELL)));
      if (!a) return;
      const p = a.lastIndexOf(i);
      if (p >= 0) a.splice(p, 1);
    };
    const nearest = (px, py, maxI) => {
      let best = -1, bd = CLEAR * CLEAR;
      const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const a = grid.get(gkey(cx + dx, cy + dy));
        if (!a) continue;
        for (const j of a) {
          if (j >= maxI) continue;
          const ex = X[j] - px, ey = Y[j] - py, d2 = ex * ex + ey * ey;
          if (d2 < bd) { bd = d2; best = j; }
        }
      }
      return best;
    };
    const eAt = (i) => {
      let e = 0;
      for (let q = bridges.length - 1; q >= 0 && q >= bridges.length - 2; q--) {
        const B = bridges[q];
        if (i < B.start || i > B.end) continue;
        let v;
        if (i < B.a) v = FR.smooth((i - B.start) / (B.a - B.start));
        else if (i <= B.b) v = 1;
        else v = FR.smooth(1 - (i - B.b) / (B.end - B.b));
        e = Math.max(e, v);
      }
      return e;
    };

    function sim(c) {
      const n = Math.max(1, Math.round(c.len / STEP));
      const k = c.ang ? c.ang / (n * STEP) : 0;
      const out = { x: [], y: [], h: [], k };
      let x = X.length ? X[X.length - 1] : 0, y = Y.length ? Y[Y.length - 1] : 0;
      let h = H.length ? H[H.length - 1] + K[K.length - 1] * STEP : 0;
      if (!X.length) { out.x.push(0); out.y.push(0); out.h.push(0); }
      for (let i = X.length ? 0 : 1; i < n; i++) {
        const hm = h + (k * STEP) / 2;
        x += Math.sin(hm) * STEP; y -= Math.cos(hm) * STEP;
        h += k * STEP;
        out.x.push(x); out.y.push(y); out.h.push(h);
      }
      return out;
    }

    function tryAppend(c, allowCross) {
      const p = sim(c);
      const n0 = X.length, n = p.x.length;
      const close = [];
      for (let k = 0; k < n; k++) {
        const j = nearest(p.x[k], p.y[k], n0 + k - RECENT);
        if (j >= 0) close.push([k, j]);
      }
      let bridge = null;
      if (close.length) {
        if (!allowCross) return false;
        // ровно один участок пересечения
        for (let q = 1; q < close.length; q++) if (close[q][0] !== close[q - 1][0] + 1) return false;
        const k0 = close[0][0], k1 = close[close.length - 1][0];
        if (k0 < 8 || (k1 - k0 + 1) * STEP > 900) return false;
        const km = close[(close.length / 2) | 0];
        let ang = Math.abs(wrap(p.h[km[0]] - H[km[1]]));
        ang = Math.min(ang, Math.PI - ang);
        if (ang < 0.8) return false;
        for (const [, j] of close) {
          for (let t = Math.max(0, j - RS - 4); t <= Math.min(n0 - 1, j + RS + 4); t++) if (E[t] > 0 || UNDER[t]) return false;
        }
        const g0 = n0 + k0 - 10, g1 = n0 + k1 + 10;
        const start = g0 - RS;
        if (start < 200) return false;
        const lastB = bridges[bridges.length - 1];
        if (lastB && start < lastB.end + 30) return false;
        for (let t = start; t < n0; t++) if (UNDER[t] || E[t] > 0) return false;
        bridge = { start, a: g0, b: g1, end: g1 + RS, under: [], old: [] };
        const js = new Set();
        for (const [, j] of close) for (let t = j - 28; t <= j + 28; t++) if (t >= 0 && t < n0) js.add(t);
        bridge.under = [...js];
      } else {
        // в зоне спуска моста нельзя приближаться к другим трассам — проверено выше (close пуст)
      }
      // принимаем
      const seg = { n0, n, bridge };
      if (bridge) {
        bridges.push(bridge);
        for (let t = bridge.start; t < n0; t++) { bridge.old.push(E[t]); E[t] = eAt(t); }
        for (const t of bridge.under) UNDER[t] = (UNDER[t] || 0) + 1;
      }
      for (let k = 0; k < n; k++) {
        X.push(p.x[k]); Y.push(p.y[k]); H.push(p.h[k]); K.push(p.k);
        const i = X.length - 1;
        E.push(eAt(i)); UNDER.push(0);
        gAdd(i);
      }
      segs.push(seg);
      return true;
    }

    function pop() {
      const seg = segs.pop();
      for (let i = X.length - 1; i >= seg.n0; i--) gDel(i);
      X.length = Y.length = H.length = K.length = E.length = UNDER.length = seg.n0;
      if (seg.bridge) {
        const B = seg.bridge;
        bridges.pop();
        B.old.forEach((v, q) => (E[B.start + q] = v));
        for (const t of B.under) UNDER[t]--;
      }
    }

    const len = () => X.length * STEP;
    tryAppend({ len: START + 560, ang: 0 }, false);
    let fails = 0, steps = 0;
    while (len() < total) {
      if (++steps > 6000) return null;
      const L = len();
      const nearFinish = L > finish - 700 && L < finish + 450;
      let ok = false;
      // развязка: прямая → разворот на 270° → мост над своей же трассой
      const lastB = bridges[bridges.length - 1];
      const sinceB = lastB ? L - lastB.end * STEP : L;
      if (!nearFinish && L > START + 700 && L < finish - 4200 && sinceB > 1500 && rng() < 0.45) {
        const r = rng.range(330, 420), dir = rng() < 0.5 ? 1 : -1;
        const before = segs.length;
        if (tryAppend({ len: r + 430, ang: 0 }, false) &&
            tryAppend({ len: 1.5 * Math.PI * r, ang: 1.5 * Math.PI * dir }, false) &&
            tryAppend({ len: r + 470, ang: 0 }, true) &&
            bridges.length && bridges[bridges.length - 1] !== lastB) {
          lastDir = -dir;
          continue;
        }
        while (segs.length > before) pop();
      }
      for (let t = 0; t < 30 && !ok; t++) {
        let c;
        if (nearFinish) c = { len: Math.max(300, finish + 480 - L), ang: 0 };
        else {
          const r = rng();
          const dir = rng() < 0.62 ? lastDir : -lastDir;
          if (r < 0.2) c = { len: rng.range(180, 480), ang: 0 };
          else if (r < 0.62) { const a = rng.range(0.6, 1.7) * dir, rad = rng.range(250, 560); c = { len: Math.abs(a) * rad, ang: a }; }
          else { const a = rng.range(1.9, 2.9) * dir, rad = rng.range(240, 360); c = { len: Math.abs(a) * rad, ang: a }; }
        }
        ok = tryAppend(c, !nearFinish && L > START + 900 && L < finish - 700);
        if (ok && c.ang) lastDir = Math.sign(c.ang);
        if (nearFinish) break;
      }
      if (!ok) {
        fails++;
        if (fails > 900) return null;
        const back = Math.min(segs.length - 1, 1 + (fails % 3));
        for (let q = 0; q < back; q++) pop();
      }
    }
    return { X, Y, H, K, E, UNDER, bridges };
  }

  FR.buildTrack = function (rng, raceLen) {
    const finish = START + raceLen;
    const total = finish + 1500;
    let g = null;
    for (let attempt = 0; attempt < 12 && !g; attempt++) g = generatePath(rng, finish, total);
    if (!g) throw new Error('track generation failed');

    const n = g.X.length;
    const X = Float32Array.from(g.X), Y = Float32Array.from(g.Y);
    const H = Float32Array.from(g.H), K = Float32Array.from(g.K);
    const E = Float32Array.from(g.E);
    const UNDER = Uint8Array.from(g.UNDER.map((v) => (v > 0 ? 1 : 0)));
    const KS = new Float32Array(n);
    const win = 12;
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = i - win; j <= i + win; j++) if (j >= 0 && j < n) { s += K[j]; c++; }
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

    const track = { X, Y, H, K, KS, TH, E, UNDER, n, total: n * STEP, finish, start: START, sections: sec, chunks, bridges: g.bridges };
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
      out.e = E[i] + (E[i + 1] - E[i]) * t;
      return out;
    };
    track.kAt = (s) => KS[track.idx(s)];
    track.themeAt = (s) => TH[track.idx(s)];
    track.eAt = (s) => E[track.idx(s)];

    // сетка для поиска расстояния до трассы
    const grid = new Map();
    for (let i = 0; i < n; i += 2) {
      const k = gkey(Math.floor(X[i] / CELL), Math.floor(Y[i] / CELL));
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(i);
    }
    track.dist = function (px, py) {
      let bd = 1e12;
      const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const a = grid.get(gkey(cx + dx, cy + dy));
        if (!a) continue;
        for (const j of a) {
          const ex = X[j] - px, ey = Y[j] - py, d2 = ex * ex + ey * ey;
          if (d2 < bd) bd = d2;
        }
      }
      return Math.sqrt(bd);
    };

    // блоки для быстрого отсечения при отрисовке
    const BL = 24, blocks = [];
    const pad = HALF + RAIL + 40;
    for (let a = 0; a < n - 1; a += BL) {
      const b = Math.min(n - 1, a + BL);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = a; i <= b; i++) {
        if (X[i] < x0) x0 = X[i]; if (X[i] > x1) x1 = X[i];
        if (Y[i] < y0) y0 = Y[i]; if (Y[i] > y1) y1 = Y[i];
      }
      blocks.push({ a, b, x0: x0 - pad, x1: x1 + pad + 30, y0: y0 - pad, y1: y1 + pad + 30 });
    }
    track.blocks = blocks;

    // ---- препятствия и бонусы ----
    const feats = [];
    const busy = [];
    const isFree = (a, b, gap) => !busy.some((q) => a < q[1] + gap && b > q[0] - gap);
    const flatGround = (a, b) => {
      for (let i = track.idx(a); i <= track.idx(b); i++) if (E[i] > 0 || UNDER[i]) return false;
      return true;
    };
    const maxK = (a, b) => {
      let m = 0;
      for (let i = track.idx(a); i <= track.idx(b); i++) m = Math.max(m, Math.abs(K[i]));
      return m;
    };
    const place = (type, flen, s0, s1, extra) => {
      for (let tries = 0; tries < 50; tries++) {
        if (s1 - flen <= s0) return;
        const s = rng.range(s0, s1 - flen);
        if (type === 'jump' && maxK(s - 60, s + flen + 260) > 1 / 1400) continue;
        if (type === 'pegs' && maxK(s, s + flen) > 1 / 450) continue;
        if (type !== 'boost' && type !== 'brake' && !flatGround(s - 120, s + flen + 260)) continue;
        if (!isFree(s, s + flen, 240)) continue;
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
      // бонусные ячейки
      for (let k = 0; k < (last ? 1 : 2); k++) {
        place('items', 40, s0, last ? s1 - 300 : s1, (f) => {
          const lanes = [-66, -22, 22, 66];
          const skip = rng() < 0.5 ? rng.int(0, 3) : -1;
          f.boxes = lanes.filter((_, q) => q !== skip).map((l) => ({ l, cd: 0 }));
        });
      }
      // тормоза
      for (let k = 0; k < (last ? 1 : 2); k++) {
        place('brake', 80, s0, s1, (f) => {
          const opt = rng.int(0, 2);
          if (opt === 0) { f.l0 = -HALF + 10; f.l1 = 4; }
          else if (opt === 1) { f.l0 = -4; f.l1 = HALF - 10; }
          else { f.l0 = -HALF * 0.5; f.l1 = HALF * 0.5; }
        });
      }
      for (let k = 0; k < (last ? 3 : 4); k++) {
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
    for (const f of feats) f.e = E[track.idx(f.s)];
    track.feats = feats;

    // ---- профиль скорости ----
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

    buildDecor(track, rng);
    return track;
  };

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
        if (track.dist(p.x, p.y) < edge + size * 0.95) continue;
        decor.push({ x: p.x, y: p.y, type, size, v: rng.int(0, 3), th: TH[i] });
      }
    }
    // фонари вдоль трассы в ночном городе
    for (let s = 0; s < track.total; s += 230) {
      const i = track.idx(s);
      if (!FR.THEMES[TH[i]].neon) continue;
      for (const side of [-1, 1]) {
        track.pos(s + (side > 0 ? 115 : 0), side * (edge + 16), p);
        if (track.dist(p.x, p.y) < edge + 10) continue;
        decor.push({ x: p.x, y: p.y, type: 'lamp', size: 8, v: 0, th: TH[i], glow: true });
      }
    }
    // трибуны стадиона
    for (let s = track.finish - 1050; s < track.finish + 700; s += 118) {
      for (const side of [-1, 1]) {
        track.pos(s, side * (edge + 58), p);
        if (track.dist(p.x, p.y) < edge + 50) continue;
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
