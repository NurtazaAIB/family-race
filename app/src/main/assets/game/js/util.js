/* Семейная Гонка — утилиты */
(function (G) {
  'use strict';
  const FR = (G.FR = G.FR || {});

  FR.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  FR.lerp = (a, b, t) => a + (b - a) * t;
  FR.smooth = (t) => {
    t = FR.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Криптостойкий генератор: используется для выбора победителя,
  // чтобы у всех были абсолютно равные шансы.
  FR.secureU32 = function () {
    const a = new Uint32Array(1);
    G.crypto.getRandomValues(a);
    return a[0];
  };
  FR.secureInt = function (n) {
    const lim = Math.floor(4294967296 / n) * n;
    let x;
    do { x = FR.secureU32(); } while (x >= lim);
    return x % n;
  };
  FR.secureShuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = FR.secureInt(i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  // Быстрый детерминированный ГПСЧ для трассы и «характера» гонки
  FR.makeRng = function (seed) {
    let s = seed >>> 0;
    const r = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (a, b) => a + (b - a) * r();
    r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    r.shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    };
    return r;
  };

  FR.hexToRgb = function (hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  FR.mixColor = function (a, b, t) {
    const x = FR.hexToRgb(a), y = FR.hexToRgb(b);
    const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  };
  FR.rgba = function (hex, a) {
    const c = FR.hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  };
  FR.shade = function (hex, k) {
    // k>0 — светлее, k<0 — темнее
    const c = FR.hexToRgb(hex).map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  };

  FR.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  FR.hashStr = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  FR.PLAYER_COLORS = [
    '#ff4d6d', '#3fa7ff', '#ffc53d', '#3ccf6e', '#b45cf0', '#ff8a2b',
    '#14c4d9', '#f45fa8', '#8fd12a', '#7b61ff', '#e8b100', '#1fc9a0',
    '#e64980', '#2f88ea', '#fd7e14', '#5fd38a',
  ];
})(typeof window !== 'undefined' ? window : globalThis);
