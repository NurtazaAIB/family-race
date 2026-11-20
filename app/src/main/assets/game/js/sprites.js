/* Семейная Гонка — рисованные спрайты (деревья, конфеты, дома, шарики) */
(function (G) {
  'use strict';
  const FR = G.FR;
  const SP = {};
  // Полифил для старых WebView
  const P = G.CanvasRenderingContext2D && G.CanvasRenderingContext2D.prototype;
  if (P && !P.roundRect) {
    P.roundRect = function (x, y, w, h, r) {
      r = Math.min(typeof r === 'number' ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
    };
  }
  const S = 160;   // размер холста спрайта
  const C = 80;    // центр
  const RAD = 64;  // «радиус» объекта в спрайте

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }
  function circle(x, y, r, fill, ctx) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  }
  function shadow(ctx, r, dx, dy, a) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + (a || 0.2) + ')';
    ctx.beginPath(); ctx.ellipse(C + (dx || 10), C + (dy || 12), r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function star(ctx, x, y, n, r1, r2, rot, fill) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1;
      const a = rot + (i / (n * 2)) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function rng(seed) { return FR.makeRng(seed); }

  const ART = {
    tree(ctx, v) {
      const r = rng(11 + v);
      shadow(ctx, 56, 12, 14, 0.2);
      const greens = [['#4caf50', '#66c466', '#8fdc7a'], ['#43a047', '#5cbf5c', '#9be07f'], ['#5aa83c', '#77c455', '#a8e07a'], ['#3e9b50', '#58b868', '#86d48e']][v];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + r() * 0.4;
        circle(C + Math.cos(a) * 28, C + Math.sin(a) * 28, 30 + r() * 6, greens[0], ctx);
      }
      circle(C, C, 40, greens[0], ctx);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + r();
        circle(C - 8 + Math.cos(a) * 20, C - 8 + Math.sin(a) * 20, 18 + r() * 6, greens[1], ctx);
      }
      circle(C - 16, C - 18, 16, greens[2], ctx);
      circle(C + 8, C - 26, 9, greens[2], ctx);
      if (v === 1 || v === 3) {
        for (let i = 0; i < 7; i++) {
          const a = r() * Math.PI * 2, d = 14 + r() * 34;
          circle(C + Math.cos(a) * d, C + Math.sin(a) * d, 5, v === 1 ? '#ff4d4d' : '#ffb000', ctx);
          circle(C + Math.cos(a) * d - 1.5, C + Math.sin(a) * d - 1.5, 1.6, 'rgba(255,255,255,.8)', ctx);
        }
      }
    },
    bush(ctx, v) {
      const r = rng(21 + v);
      shadow(ctx, 50, 8, 10, 0.18);
      const c = ['#5fbf4f', '#4fae5f', '#72c94a', '#63b86d'][v];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        circle(C + Math.cos(a) * 26, C + Math.sin(a) * 26, 30, c, ctx);
      }
      circle(C, C, 36, c, ctx);
      circle(C - 14, C - 14, 20, FR.shade(c, 0.25), ctx);
      if (v % 2 === 0) for (let i = 0; i < 6; i++) {
        const a = r() * 6.28, d = r() * 40;
        circle(C + Math.cos(a) * d, C + Math.sin(a) * d, 5, ['#ff6fae', '#fff', '#ffd43b'][i % 3], ctx);
      }
    },
    flowers(ctx, v) {
      const r = rng(31 + v);
      circle(C, C, 56, 'rgba(60,140,40,0.25)', ctx);
      const cols = [['#ffffff', '#ff6fae'], ['#ffd43b', '#ff8a3d'], ['#b07cff', '#ffffff'], ['#ff5c7a', '#ffd43b']][v];
      for (let i = 0; i < 9; i++) {
        const a = r() * 6.28, d = r() * 42;
        const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d;
        const col = cols[i % 2];
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * 6.28;
          circle(x + Math.cos(pa) * 7, y + Math.sin(pa) * 7, 6, col, ctx);
        }
        circle(x, y, 4.5, '#ffcf3d', ctx);
      }
    },
    rock(ctx, v) {
      const r = rng(41 + v);
      shadow(ctx, 50, 8, 10, 0.22);
      ctx.beginPath();
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28, d = 46 + r() * 16;
        const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d * 0.85;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(C - 50, C - 50, C + 50, C + 50);
      g.addColorStop(0, '#d5d9de'); g.addColorStop(1, '#8a929c');
      ctx.fillStyle = g; ctx.fill();
      circle(C - 14, C - 16, 14, 'rgba(255,255,255,0.35)', ctx);
    },
    pine(ctx, v, snow) {
      shadow(ctx, 58, 14, 16, 0.25);
      const cols = snow
        ? ['#2f6f58', '#3e8a6c', '#55a582']
        : [['#1f6b3e', '#2b8a50', '#3fa864'], ['#245f3a', '#2f7d4c', '#46a066'], ['#1d6648', '#2a845d', '#3da474'], ['#2a6a35', '#38884a', '#4ea65e']][v];
      star(ctx, C, C, 9, 64, 44, v * 0.3, cols[0]);
      star(ctx, C, C, 8, 46, 30, v * 0.3 + 0.2, cols[1]);
      star(ctx, C, C, 7, 28, 17, v * 0.3 + 0.4, cols[2]);
      if (snow) {
        star(ctx, C - 4, C - 4, 9, 56, 34, v * 0.3 + 0.17, 'rgba(255,255,255,0.75)');
        star(ctx, C - 3, C - 3, 7, 22, 12, v * 0.3 + 0.4, '#ffffff');
      } else {
        circle(C, C, 6, '#7a4a25', ctx);
      }
    },
    snowpine(ctx, v) { ART.pine(ctx, v, true); },
    mushroom(ctx, v) {
      shadow(ctx, 52, 8, 12, 0.25);
      const cap = ['#ff4d4d', '#ff7a2f', '#e8455e', '#c85cff'][v];
      const g = ctx.createRadialGradient(C - 18, C - 20, 6, C, C, 62);
      g.addColorStop(0, FR.shade(cap, 0.35)); g.addColorStop(1, FR.shade(cap, -0.2));
      circle(C, C, 60, g, ctx);
      const r = rng(51 + v);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 6.28 + r(), d = i === 0 ? 0 : 34;
        circle(C + Math.cos(a) * d, C + Math.sin(a) * d, 9 + r() * 4, '#fff8ef', ctx);
      }
    },
    log(ctx, v) {
      shadow(ctx, 50, 8, 10, 0.2);
      ctx.save(); ctx.translate(C, C); ctx.rotate(v * 0.7);
      ctx.fillStyle = '#8a5a35';
      ctx.beginPath(); ctx.roundRect(-60, -22, 120, 44, 20); ctx.fill();
      ctx.fillStyle = '#a7703f'; ctx.fillRect(-56, -14, 112, 6);
      ctx.beginPath(); ctx.ellipse(54, 0, 10, 22, 0, 0, 6.28); ctx.fillStyle = '#e2b07a'; ctx.fill();
      ctx.strokeStyle = '#b9824f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(54, 0, 5, 12, 0, 0, 6.28); ctx.stroke();
      ctx.restore();
    },
    snowman(ctx, v) {
      shadow(ctx, 50, 10, 14, 0.18);
      circle(C, C + 14, 46, '#ffffff', ctx);
      circle(C, C - 26, 30, '#ffffff', ctx);
      ctx.strokeStyle = '#d7e6f5'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(C, C + 14, 46, 0.2, 2.9); ctx.stroke();
      ctx.fillStyle = ['#ff4d4d', '#3fa7ff', '#3ccf6e', '#b45cf0'][v];
      ctx.fillRect(C - 30, C - 6, 60, 10);
      circle(C - 10, C - 32, 4, '#222', ctx);
      circle(C + 10, C - 32, 4, '#222', ctx);
      ctx.beginPath(); ctx.moveTo(C - 4, C - 24); ctx.lineTo(C + 22, C - 20); ctx.lineTo(C - 4, C - 18);
      ctx.fillStyle = '#ff8a2b'; ctx.fill();
      circle(C, C + 8, 4, '#333', ctx); circle(C, C + 24, 4, '#333', ctx);
    },
    iceblock(ctx, v) {
      shadow(ctx, 50, 8, 10, 0.12);
      ctx.save(); ctx.translate(C, C); ctx.rotate(v * 0.5);
      const g = ctx.createLinearGradient(-50, -50, 50, 50);
      g.addColorStop(0, '#e8f7ff'); g.addColorStop(1, '#8fcdf5');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(-48, -48, 96, 96, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-36, -20); ctx.lineTo(-20, -36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(0, -30); ctx.stroke();
      ctx.restore();
    },
    penguin(ctx, v) {
      shadow(ctx, 44, 8, 12, 0.18);
      ctx.fillStyle = '#23263a';
      ctx.beginPath(); ctx.ellipse(C, C + 4, 44, 56, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(C, C + 14, 30, 42, 0, 0, 6.28); ctx.fill();
      circle(C - 13, C - 26, 9, '#fff', ctx); circle(C + 13, C - 26, 9, '#fff', ctx);
      circle(C - 11, C - 26, 5, '#111', ctx); circle(C + 11, C - 26, 5, '#111', ctx);
      ctx.beginPath(); ctx.moveTo(C - 9, C - 14); ctx.lineTo(C + 9, C - 14); ctx.lineTo(C, C - 2);
      ctx.fillStyle = '#ffa31a'; ctx.fill();
      ctx.fillStyle = ['#ff4d6d', '#3fa7ff', '#3ccf6e', '#ffc53d'][v];
      ctx.fillRect(C - 34, C - 6, 68, 9);
    },
    lollipop(ctx, v) {
      shadow(ctx, 54, 10, 14, 0.18);
      ctx.fillStyle = '#fff'; ctx.fillRect(C - 5, C + 20, 10, 60);
      const cols = [['#ff4d8d', '#fff'], ['#7b61ff', '#ffe066'], ['#3ccf6e', '#fff'], ['#ff8a2b', '#3fa7ff']][v];
      circle(C, C, 58, cols[1], ctx);
      ctx.save(); ctx.translate(C, C);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath(); ctx.moveTo(0, 0);
        for (let t = 0; t <= 1.001; t += 0.1) {
          const a = t * 2.4, rr = t * 58;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        for (let t = 1; t >= 0; t -= 0.1) {
          const a = t * 2.4 + 0.5, rr = t * 58;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.fillStyle = cols[0]; ctx.fill();
      }
      ctx.restore();
      circle(C - 20, C - 22, 12, 'rgba(255,255,255,0.55)', ctx);
    },
    donut(ctx, v) {
      shadow(ctx, 56, 10, 12, 0.18);
      circle(C, C, 60, '#d9a066', ctx);
      const icing = ['#ff8fc3', '#7b4a2a', '#b8a1ff', '#ffe066'][v];
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * 6.28, d = 52 + Math.sin(i * 2.3) * 4;
        const x = C + Math.cos(a) * d, y = C + Math.sin(a) * d;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.fillStyle = icing; ctx.fill();
      circle(C, C, 20, '#d9a066', ctx);
      circle(C, C, 15, 'rgba(0,0,0,0)', ctx);
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; circle(C, C, 15, '#000', ctx); ctx.restore();
      const r = rng(61 + v);
      const sp = ['#fff', '#3fa7ff', '#ffd43b', '#3ccf6e', '#ff4d6d'];
      for (let i = 0; i < 22; i++) {
        const a = r() * 6.28, d = 26 + r() * 22;
        ctx.save(); ctx.translate(C + Math.cos(a) * d, C + Math.sin(a) * d); ctx.rotate(r() * 6.28);
        ctx.fillStyle = sp[i % sp.length]; ctx.fillRect(-5, -1.6, 10, 3.2); ctx.restore();
      }
      circle(C - 26, C - 24, 8, 'rgba(255,255,255,0.45)', ctx);
    },
    candy(ctx, v) {
      shadow(ctx, 44, 8, 10, 0.18);
      ctx.save(); ctx.translate(C, C); ctx.rotate(v * 0.8 - 0.6);
      const col = ['#ff4d6d', '#3fa7ff', '#3ccf6e', '#b45cf0'][v];
      ctx.fillStyle = FR.shade(col, 0.2);
      ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-66, -26); ctx.lineTo(-66, 26); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(66, -26); ctx.lineTo(66, 26); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, 40, 28, 0, 0, 6.28); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 6;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 14 - 8, -26); ctx.lineTo(i * 14 + 8, 26); ctx.stroke(); }
      ctx.restore();
    },
    cupcake(ctx, v) {
      shadow(ctx, 52, 8, 12, 0.18);
      ctx.fillStyle = '#f2a65a';
      ctx.beginPath(); ctx.arc(C, C, 58, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#d98a3f'; ctx.lineWidth = 4;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * 6.28;
        ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * 44, C + Math.sin(a) * 44); ctx.lineTo(C + Math.cos(a) * 58, C + Math.sin(a) * 58); ctx.stroke();
      }
      const cr = ['#fff0f6', '#ffd6e7', '#e0d4ff', '#d3f9d8'][v];
      for (let i = 0; i < 3; i++) circle(C, C, 44 - i * 13, i % 2 ? FR.shade(cr.length === 7 ? cr : '#ffffff', -0.06) : cr, ctx);
      circle(C, C, 10, '#ff2d55', ctx);
      circle(C - 3, C - 3, 3, 'rgba(255,255,255,.8)', ctx);
    },
    building(ctx, v) {
      const r = rng(71 + v);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(C - 54 + 12, C - 54 + 14, 108, 108);
      const roof = ['#2b335f', '#33305a', '#283f5c', '#3a2d55'][v];
      ctx.fillStyle = roof;
      ctx.fillRect(C - 56, C - 56, 112, 112);
      ctx.strokeStyle = FR.shade(roof, 0.25); ctx.lineWidth = 4;
      ctx.strokeRect(C - 54, C - 54, 108, 108);
      // окна-огоньки по периметру
      const lit = ['#ffe28a', '#8fe3ff', '#ffb3ec'];
      for (let i = 0; i < 9; i++) {
        for (const side of [0, 1, 2, 3]) {
          if (r() < 0.35) continue;
          const tpos = -46 + i * 11.5;
          let x, y;
          if (side === 0) { x = tpos; y = -54; } else if (side === 1) { x = 50; y = tpos; } else if (side === 2) { x = tpos; y = 50; } else { x = -54; y = tpos; }
          ctx.fillStyle = lit[(r() * 3) | 0];
          ctx.fillRect(C + x, C + y, 6, 5);
        }
      }
      // крыша
      ctx.fillStyle = FR.shade(roof, -0.25);
      ctx.fillRect(C - 30 + r() * 20, C - 30 + r() * 10, 26, 18);
      ctx.fillRect(C + r() * 10, C + 8 + r() * 10, 18, 26);
      if (v % 2 === 0) {
        circle(C + 22, C - 22, 10, '#ff3fd0', ctx);
        circle(C + 22, C - 22, 5, '#ffd0f5', ctx);
      }
    },
    ntree(ctx, v) {
      shadow(ctx, 50, 10, 12, 0.3);
      circle(C, C, 52, '#1f4d4a', ctx);
      circle(C - 12, C - 12, 30, '#2a6460', ctx);
      const r = rng(81 + v);
      for (let i = 0; i < 8; i++) {
        const a = r() * 6.28, d = r() * 44;
        circle(C + Math.cos(a) * d, C + Math.sin(a) * d, 3.5, ['#ffe28a', '#8fe3ff', '#ffb3ec'][i % 3], ctx);
      }
    },
    flag(ctx, v) {
      shadow(ctx, 20, 6, 8, 0.25);
      circle(C, C, 8, '#ddd', ctx);
      const col = ['#ff4d6d', '#3fa7ff', '#ffc53d', '#3ccf6e'][v];
      ctx.beginPath(); ctx.moveTo(C, C - 4); ctx.lineTo(C + 64, C - 24); ctx.lineTo(C + 6, C - 52); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    },
    lamp(ctx) {
      circle(C, C, 40, '#2a2f4a', ctx);
      circle(C, C, 26, '#fff6d6', ctx);
    },
  };

  // Трибуны рисуются отдельно (прямоугольник, повёрнутый вдоль трассы)
  function buildStand(v) {
    const w = 256, h = 150;
    const c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(10, 14, w - 10, h - 14);
    ctx.fillStyle = '#4a5068'; ctx.fillRect(0, 0, w - 8, h - 12);
    const r = rng(91 + v);
    const cols = ['#ff4d6d', '#3fa7ff', '#ffc53d', '#3ccf6e', '#b45cf0', '#ff8a2b', '#ffffff', '#f45fa8'];
    for (let row = 0; row < 6; row++) {
      ctx.fillStyle = row % 2 ? '#5b627e' : '#555c78';
      ctx.fillRect(0, row * 23, w - 8, 23);
      for (let x = 8; x < w - 14; x += 12) {
        if (r() < 0.12) continue;
        const cx = x + r() * 3, cy = row * 23 + 12;
        circle(cx, cy, 6, cols[(r() * cols.length) | 0], ctx);
        circle(cx, cy - 3, 3.6, ['#ffd7b0', '#e8b48a', '#c98d62', '#f2c9a0'][(r() * 4) | 0], ctx);
      }
    }
    return c;
  }

  SP.build = function () {
    if (SP.ready) return;
    SP.decor = {};
    for (const key of Object.keys(ART)) {
      SP.decor[key] = [];
      for (let v = 0; v < 4; v++) {
        const c = canvas(S), ctx = c.getContext('2d');
        ART[key](ctx, v);
        SP.decor[key].push(c);
        if (key === 'lamp') break;
      }
    }
    SP.decor.stand = [0, 1, 2, 3].map(buildStand);

    // мягкое свечение
    const glow = canvas(128), g = glow.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,220,140,0.55)');
    gr.addColorStop(0.4, 'rgba(255,190,110,0.2)');
    gr.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    SP.glow = glow;

    // блик для шариков: только у края и маленький блик, лицо не замутняется
    const sh = canvas(256), s = sh.getContext('2d');
    let gg = s.createRadialGradient(128, 128, 100, 128, 128, 128);
    gg.addColorStop(0, 'rgba(255,255,255,0)');
    gg.addColorStop(1, 'rgba(255,255,255,0.28)');
    s.fillStyle = gg; s.beginPath(); s.arc(128, 128, 128, 0, 6.29); s.fill();
    s.save();
    s.translate(78, 66); s.rotate(-0.6);
    gg = s.createRadialGradient(0, 0, 0, 0, 0, 34);
    gg.addColorStop(0, 'rgba(255,255,255,0.85)');
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    s.fillStyle = gg; s.beginPath(); s.ellipse(0, 0, 34, 18, 0, 0, 6.29); s.fill();
    s.restore();
    SP.shine = sh;

    SP.ready = true;
  };

  // Лицо игрока внутри шарика (256 px — чётко даже на плотных экранах)
  SP.face = function (img, color) {
    const c = canvas(256), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.beginPath(); ctx.arc(128, 128, 112, 0, 6.29); ctx.clip();
    ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 256);
    if (img) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const k = Math.max(224 / iw, 224 / ih);
      ctx.drawImage(img, 128 - (iw * k) / 2, 128 - (ih * k) / 2, iw * k, ih * k);
    }
    const g = ctx.createRadialGradient(128, 128, 80, 128, 128, 114);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    ctx.restore();
    return c;
  };

  // Цветное кольцо-оправа: мягкие широкие сегменты, без мелькания
  SP.ring = function (color) {
    const c = canvas(256), ctx = c.getContext('2d');
    const n = 4;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(128, 128, 124, (i / n) * 6.2832, ((i + 1) / n) * 6.2832);
      ctx.arc(128, 128, 108, ((i + 1) / n) * 6.2832, (i / n) * 6.2832, true);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? FR.shade(color, 0.3) : color;
      ctx.fill();
    }
    ctx.strokeStyle = FR.shade(color, -0.35); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(128, 128, 125, 0, 6.29); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(128, 128, 108, 0, 6.29); ctx.stroke();
    return c;
  };

  // Аватар-заглушка: мультяшное лицо (для демо и тестов в браузере)
  SP.demoAvatar = function (seed, color) {
    const r = FR.makeRng(seed);
    const c = canvas(256), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, FR.shade(color, 0.55)); g.addColorStop(1, FR.shade(color, 0.1));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    const skin = ['#ffd9b8', '#f2c29b', '#e0a87e', '#c98d62'][r.int(0, 3)];
    const hair = ['#3b2314', '#6b4423', '#e8c26a', '#1f1f1f', '#a0522d', '#d9d9d9'][r.int(0, 5)];
    const long = r() < 0.5;
    if (long) { ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(128, 150, 86, 100, 0, 0, 6.28); ctx.fill(); }
    circle(128, 140, 72, skin, ctx);
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.ellipse(128, 92, 76, 40, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(110, 80, 50, 26, -0.4, 0, 6.28); ctx.fill();
    circle(100, 140, 9, '#2b1e2e', ctx); circle(156, 140, 9, '#2b1e2e', ctx);
    circle(103, 137, 3, '#fff', ctx); circle(159, 137, 3, '#fff', ctx);
    circle(88, 166, 11, 'rgba(255,110,120,0.35)', ctx); circle(168, 166, 11, 'rgba(255,110,120,0.35)', ctx);
    ctx.strokeStyle = '#7a2e2e'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(128, 162, 24, 0.25, Math.PI - 0.25); ctx.stroke();
    if (r() < 0.3) {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(100, 140, 18, 0, 6.28); ctx.stroke();
      ctx.beginPath(); ctx.arc(156, 140, 18, 0, 6.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(118, 140); ctx.lineTo(138, 140); ctx.stroke();
    }
    return c;
  };

  FR.Sprites = SP;
})(window);
