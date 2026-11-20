/* Семейная Гонка — отрисовка */
(function (G) {
  'use strict';
  const FR = G.FR;
  const D = FR.D, R = FR.R, HALF = FR.TRACK_W / 2, RAIL = FR.RAIL, STEP = FR.STEP;
  const TAU = Math.PI * 2;

  class Renderer {
    constructor(cv) {
      this.cv = cv;
      this.ctx = cv.getContext('2d', { alpha: false });
      this.cam = { x: 0, y: 0, z: 1 };
      this.parts = [];
      this.screenParts = [];
      this.time = 0;
      this.slowmo = 0;
      this.focus = null;
      this.celebrating = false;
      this.tmp = {};
      this.resize();
      G.addEventListener('resize', () => this.resize());
    }

    resize() {
      this.dpr = Math.min(3, G.devicePixelRatio || 1);
      this.w = G.innerWidth;
      this.h = G.innerHeight;
      this.cv.width = Math.round(this.w * this.dpr);
      this.cv.height = Math.round(this.h * this.dpr);
      this.landscape = this.w > this.h;
      this.baseZ = Math.min(this.w * 0.6, this.h * 0.45, 420) / (FR.TRACK_W + RAIL * 2);
    }

    setRace(race, faces) {
      FR.Sprites.build();
      this.race = race;
      this.tr = race.track;
      this.faces = faces; // [{face, ring, color, name}]
      this.parts.length = 0;
      this.screenParts.length = 0;
      this.celebrating = false;
      this.trails = race.marbles.map(() => []);
      const s0 = race.marbles.reduce((a, m) => a + m.s, 0) / race.marbles.length;
      const p = this.tr.pos(s0 - 40, 0, {});
      this.cam.x = p.x; this.cam.y = p.y; this.cam.z = this.baseZ * 1.25;
    }

    // --------- камера ---------
    updateCamera(dt) {
      const race = this.race, tr = this.tr, cam = this.cam;
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      let lead = null;
      const leadS = race.marbles[race.ranking[0]].s;
      for (const m of race.marbles) {
        tr.pos(m.s, m.l, m);
        if (m.finished && m.s > tr.finish + 300) continue;
        if (!m.finished && leadS - m.s > FR.LOST_DIST) continue;
        if (m.x < minX) minX = m.x; if (m.x > maxX) maxX = m.x;
        if (m.y < minY) minY = m.y; if (m.y > maxY) maxY = m.y;
      }
      lead = race.marbles[race.ranking[0]];
      const ahead = tr.pos(lead.s + 170, 0, this.tmp);
      minX = Math.min(minX, ahead.x); maxX = Math.max(maxX, ahead.x);
      minY = Math.min(minY, ahead.y); maxY = Math.max(maxY, ahead.y);
      if (minX > maxX) { minX = maxX = lead.x; minY = maxY = lead.y; }

      let tx = (minX + maxX) / 2, ty = (minY + maxY) / 2;
      const bw = maxX - minX + D * 5, bh = maxY - minY + D * 7;
      let tz = Math.min((this.w - (this.landscape ? 200 : 90)) / bw, (this.h - (this.landscape ? 130 : 230)) / bh);
      tz = FR.clamp(tz, this.baseZ * 0.72, this.baseZ * 1.25);
      if (this.focus) {
        tx = this.focus.x; ty = this.focus.y - 30;
        tz = this.baseZ * this.focus.z;
      }
      const k = 1 - Math.exp(-dt * (this.focus ? 2.2 : 3));
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
      cam.z += (tz - cam.z) * (1 - Math.exp(-dt * 1.6));
    }

    idxForY(y) {
      // Y убывает с ростом индекса: ищем первый индекс с Y <= y
      const Y = this.tr.Y;
      let lo = 0, hi = this.tr.n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (Y[mid] <= y) hi = mid; else lo = mid + 1;
      }
      return lo;
    }

    // --------- события → эффекты ---------
    fx(e) {
      const race = this.race;
      const m = e.id != null ? race.marbles[e.id] : null;
      if (m) this.tr.pos(m.s, m.l, m);
      const th = m ? FR.THEMES[this.tr.themeAt(m.s)] : null;
      switch (e.type) {
        case 'boost':
          for (let i = 0; i < 14; i++) this.spark(m.x, m.y, ['#fff3b0', '#ffc53d', '#ff8a2b'][i % 3], 160, 0.5);
          break;
        case 'land':
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU;
            this.parts.push({
              x: m.x + Math.cos(a) * R, y: m.y + Math.sin(a) * R,
              vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.6, max: 0.6, size: 7,
              color: th.ice ? '#ffffff' : th.candy ? ['#ff4d8d', '#3fa7ff', '#ffe066'][i % 3] : th.dark ? '#8fa0ff' : '#c9a777',
              kind: th.candy ? 'spark' : 'dust',
            });
          }
          break;
        case 'peg':
          for (let i = 0; i < 6; i++) this.spark(m.x, m.y, '#ffffff', 110, 0.3);
          break;
        case 'clack':
          for (let i = 0; i < 3; i++) this.spark(m.x, m.y, '#ffffff', 70, 0.2);
          break;
        case 'rail':
          for (let i = 0; i < 4; i++) this.spark(m.x, m.y, th.railHi, 90, 0.3);
          break;
        case 'finish':
          for (let i = 0; i < (e.place === 0 ? 60 : 12); i++) this.confettiWorld(m.x, m.y);
          if (e.place === 0) this.burstScreen(70);
          break;
      }
    }

    spark(x, y, color, sp, life) {
      const a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: 3 + Math.random() * 3, color, kind: 'spark' });
    }
    confettiWorld(x, y) {
      const a = Math.random() * TAU, v = 80 + Math.random() * 220;
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.6, max: 1.6, size: 6 + Math.random() * 4,
        color: FR.PLAYER_COLORS[(Math.random() * 10) | 0], kind: 'confetti', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
      });
    }
    burstScreen(n) {
      for (let i = 0; i < n; i++) {
        this.screenParts.push({
          x: Math.random() * this.w, y: -20 - Math.random() * this.h * 0.4,
          vx: (Math.random() - 0.5) * 80, vy: 80 + Math.random() * 160,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10,
          w: 7 + Math.random() * 7, h: 4 + Math.random() * 6, life: 6,
          color: FR.PLAYER_COLORS[(Math.random() * 12) | 0], ph: Math.random() * TAU,
        });
      }
    }
    firework() {
      const x = this.w * (0.15 + Math.random() * 0.7), y = this.h * (0.12 + Math.random() * 0.3);
      const col = FR.PLAYER_COLORS[(Math.random() * 12) | 0];
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * TAU, v = 120 + Math.random() * 90;
        this.screenParts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.3, max: 1.3, fw: true, color: i % 4 ? col : '#ffffff', size: 3 });
      }
    }

    update(dt, realDt) {
      this.time += realDt;
      this.updateCamera(realDt);
      // частицы мира
      const ps = this.parts;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        const drag = p.kind === 'confetti' ? 1.6 : 3;
        p.vx *= Math.exp(-dt * drag); p.vy *= Math.exp(-dt * drag);
        if (p.rot != null) p.rot += p.vr * dt;
      }
      // шлейф снега на льду и пыль
      const race = this.race;
      for (const m of race.marbles) {
        const th = FR.THEMES[this.tr.themeAt(m.s)];
        if (m.v > 40 && m.z === 0 && (th.ice || m.wash) && Math.random() < dt * 14) {
          this.parts.push({
            x: m.x + (Math.random() - 0.5) * 16, y: m.y + (Math.random() - 0.5) * 16,
            vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.7, max: 0.7, size: 5,
            color: th.ice ? '#ffffff' : '#d8b98a', kind: 'dust',
          });
        }
        if (m.rocket && Math.random() < dt * 40) {
          const b = this.tr.pos(m.s - R * 1.1, m.l + (Math.random() - 0.5) * 10, {});
          this.parts.push({
            x: b.x, y: b.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
            life: 0.45, max: 0.45, size: 5 + Math.random() * 4,
            color: ['#fff3b0', '#ffc53d', '#ff7a1a', '#ff3b3b'][(Math.random() * 4) | 0], kind: 'spark',
          });
        }
        const tr = this.trails[m.id];
        if (m.boost > 18 || m.rocket) {
          tr.push({ x: m.x, y: m.y });
          if (tr.length > 10) tr.shift();
        } else if (tr.length) tr.shift();
      }
      // экранные частицы
      const sp = this.screenParts;
      for (let i = sp.length - 1; i >= 0; i--) {
        const p = sp[i];
        p.life -= realDt;
        if (p.life <= 0 || p.y > this.h + 30) { sp.splice(i, 1); continue; }
        if (p.fw) {
          p.vy += 140 * realDt;
          p.vx *= Math.exp(-realDt * 1.5); p.vy *= Math.exp(-realDt * 1.2);
        } else {
          p.ph += realDt * 4;
          p.vx += Math.sin(p.ph) * 30 * realDt;
          p.rot += p.vr * realDt;
        }
        p.x += p.vx * realDt; p.y += p.vy * realDt;
      }
      if (this.celebrating) {
        this.fwTimer = (this.fwTimer || 0) - realDt;
        if (this.fwTimer <= 0) { this.firework(); this.fwTimer = 0.5 + Math.random() * 0.7; }
        if (Math.random() < realDt * 6) this.burstScreen(2);
      }
      // вспышки штырьков
      for (const f of this.tr.feats) if (f.pegs) for (const p of f.pegs) if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 3);
    }

    // --------- отрисовка ---------
    render() {
      const ctx = this.ctx, tr = this.tr, cam = this.cam, dpr = this.dpr;
      const w = this.w, h = this.h, z = cam.z;
      const cx = w / 2 + 22, cy = h / 2 + 18;

      // фон с плавной сменой этапов (по положению лидера)
      const race = this.race;
      const ls = race.marbles[race.ranking[0]].s;
      let ground = FR.THEMES[tr.themeAt(ls)].ground;
      for (let j = 1; j < tr.sections.length; j++) {
        const b = tr.sections[j];
        if (Math.abs(ls - b) < 600) {
          ground = FR.mixColor(FR.THEMES[j - 1].ground, FR.THEMES[j].ground, FR.smooth((ls - b + 600) / 1200));
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, w, h);

      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cx - cam.x * z), dpr * (cy - cam.y * z));
      const vx0 = cam.x - cx / z, vx1 = cam.x + (w - cx) / z;
      const vy0 = cam.y - cy / z, vy1 = cam.y + (h - cy) / z;
      this.view = { x0: vx0, x1: vx1, y0: vy0, y1: vy1 };

      // видимые участки трассы, разделённые по уровням (земля / мост)
      const blocks = tr.blocks;
      if (!this.vis || this.vis.length !== blocks.length) this.vis = new Uint8Array(blocks.length);
      const vis = this.vis;
      const runs = [];
      for (let q = 0; q < blocks.length; q++) {
        const B = blocks[q];
        const on = B.x1 > vx0 && B.x0 < vx1 && B.y1 > vy0 && B.y0 < vy1;
        vis[q] = on ? 1 : 0;
        if (!on) continue;
        const last = runs[runs.length - 1];
        if (last && last[1] >= B.a) last[1] = B.b; else runs.push([B.a, B.b]);
      }
      const E = tr.E;
      const lvl = [[], []];
      for (const [a, b] of runs) {
        let st = a, cur = E[a] > 0.5 ? 1 : 0;
        for (let i = a + 1; i <= b; i++) {
          const l = E[i] > 0.5 ? 1 : 0;
          if (l !== cur) { lvl[cur].push([st, i]); st = i; cur = l; }
        }
        lvl[cur].push([st, b]);
      }

      this.drawPatches(vy0, vy1);
      this.drawDecor(vy0, vy1, false);
      this.drawTrack(lvl[0], 0);
      this.drawFeatures(0, false);
      this.drawMarbles(0);
      if (lvl[1].length) {
        this.drawTrack(lvl[1], 1);
        this.drawFeatures(1, false);
      }
      this.drawMarbles(1);
      this.drawParts();
      this.drawFeatures(-1, true);
      this.drawDecor(vy0, vy1, true);

      // экранный слой
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawLabels(cx, cy);
      if (this.slowmo > 0.01) {
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(10,0,30,' + 0.55 * this.slowmo + ')');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      this.drawScreenParts();
    }

    drawPatches(y0, y1) {
      const ctx = this.ctx, P = this.tr.patches;
      let lo = lowerBound(P, y0 - 260);
      for (let i = lo; i < P.length; i++) {
        const p = P[i];
        if (p.y > y1 + 260) break;
        if (p.x + p.r < this.view.x0 || p.x - p.r > this.view.x1) continue;
        const th = FR.THEMES[p.th];
        ctx.globalAlpha = p.a;
        ctx.fillStyle = th.patch;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    path(a, b, off, stride, close, offB) {
      // offB: если задан — второй край (для полосы между off и offB)
      const { X, Y, H } = this.tr, ctx = this.ctx;
      ctx.beginPath();
      let first = true;
      for (let i = a; ; i += stride) {
        if (i > b) i = b;
        const c = Math.cos(H[i]), s = Math.sin(H[i]);
        const x = X[i] + c * off, y = Y[i] + s * off;
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        if (i === b) break;
      }
      if (close) {
        const o2 = offB != null ? offB : -off;
        for (let i = b; ; i -= stride) {
          if (i < a) i = a;
          const c = Math.cos(H[i]), s = Math.sin(H[i]);
          ctx.lineTo(X[i] + c * o2, Y[i] + s * o2);
          if (i === a) break;
        }
        ctx.closePath();
      }
    }

    drawTrack(ranges, level) {
      const ctx = this.ctx;
      const OUT = HALF + RAIL;
      const st = 2;
      // тени
      ctx.save();
      if (level) { ctx.translate(20, 28); ctx.fillStyle = 'rgba(0,0,0,0.3)'; }
      else { ctx.translate(7, 10); ctx.fillStyle = 'rgba(0,0,0,0.2)'; }
      for (const [a, b] of ranges) { this.path(a, b, OUT + (level ? 4 : 0), st, true); ctx.fill(); }
      ctx.restore();
      if (level) {
        // опоры и край моста
        ctx.fillStyle = '#3a3150';
        for (const [a, b] of ranges) { this.path(a, b, OUT + 5, st, true); ctx.fill(); }
      }
      for (const [a, b] of ranges) this.drawTrackBody(a, b);
    }

    drawTrackBody(i0, i1) {
      const ctx = this.ctx, tr = this.tr;
      const st = 2;
      const OUT = HALF + RAIL;
      for (const ch of tr.chunks) {
        const a = Math.max(i0, ch.a), b = Math.min(i1, ch.b + 1);
        if (b <= a) continue;
        const th = FR.THEMES[ch.theme];
        // бортики
        ctx.fillStyle = th.railLo;
        this.path(a, b, OUT, st, true); ctx.fill();
        ctx.fillStyle = th.rail;
        this.path(a, b, OUT - 3, st, true); ctx.fill();
        if (th.candy) {
          ctx.save();
          ctx.setLineDash([14, 14]);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = RAIL - 6;
          this.path(a, b, HALF + RAIL / 2, st); ctx.stroke();
          this.path(a, b, -HALF - RAIL / 2, st); ctx.stroke();
          ctx.restore();
        }
        ctx.strokeStyle = th.railHi; ctx.lineWidth = 3;
        this.path(a, b, HALF + RAIL * 0.62, st); ctx.stroke();
        this.path(a, b, -HALF - RAIL * 0.62, st); ctx.stroke();
        if (th.neon) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,63,208,0.35)'; ctx.lineWidth = 16;
          this.path(a, b, HALF + RAIL / 2, st); ctx.stroke();
          this.path(a, b, -HALF - RAIL / 2, st); ctx.stroke();
          ctx.restore();
        }
        // полотно
        ctx.fillStyle = th.track;
        this.path(a, b, HALF, st, true); ctx.fill();
        ctx.strokeStyle = th.track2; ctx.lineWidth = 14;
        this.path(a, b, HALF - 7, st); ctx.stroke();
        this.path(a, b, -HALF + 7, st); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
        this.path(a, b, HALF, st); ctx.stroke();
        this.path(a, b, -HALF, st); ctx.stroke();

        // фактура
        const { X, Y, H } = tr;
        if (th.wood) {
          ctx.strokeStyle = th.line; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = Math.ceil(a / 6) * 6; i <= b; i += 6) {
            const c = Math.cos(H[i]), s = Math.sin(H[i]);
            ctx.moveTo(X[i] - c * HALF, Y[i] - s * HALF);
            ctx.lineTo(X[i] + c * HALF, Y[i] + s * HALF);
          }
          ctx.stroke();
          ctx.save(); ctx.setLineDash([22, 18]); ctx.strokeStyle = th.line; ctx.lineWidth = 3;
          this.path(a, b, 0, st); ctx.stroke(); ctx.restore();
        } else if (th.ice) {
          ctx.strokeStyle = th.line; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = Math.ceil(a / 5) * 5; i <= b - 4; i += 5) {
            const hsh = (i * 2654435761) >>> 0;
            if (hsh % 3) continue;
            const l = ((hsh >>> 8) % 160) - 80;
            const c = Math.cos(H[i]), s = Math.sin(H[i]);
            const c2 = Math.cos(H[i + 4]), s2 = Math.sin(H[i + 4]);
            ctx.moveTo(X[i] + c * l, Y[i] + s * l);
            ctx.lineTo(X[i + 4] + c2 * (l + 8), Y[i + 4] + s2 * (l + 8));
          }
          ctx.stroke();
          ctx.lineCap = 'butt';
        } else if (th.candy) {
          ctx.save(); ctx.setLineDash([10, 16]); ctx.strokeStyle = th.line; ctx.lineWidth = 6;
          this.path(a, b, -HALF / 2, st); ctx.stroke();
          this.path(a, b, HALF / 2, st); ctx.stroke();
          ctx.restore();
        } else if (th.neon) {
          ctx.save(); ctx.setLineDash([26, 20]); ctx.strokeStyle = 'rgba(120,220,255,0.55)'; ctx.lineWidth = 3;
          this.path(a, b, 0, st); ctx.stroke(); ctx.restore();
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(80,200,255,0.25)'; ctx.lineWidth = 8;
          this.path(a, b, HALF - 2, st); ctx.stroke();
          this.path(a, b, -HALF + 2, st); ctx.stroke();
          ctx.restore();
        } else if (th.stadium) {
          ctx.strokeStyle = th.line; ctx.lineWidth = 2.5;
          for (const l of [-HALF / 2, 0, HALF / 2]) { this.path(a, b, l, st); ctx.stroke(); }
        }
      }
    }

    local(s, l) {
      const p = this.tr.pos(s, l, this.tmp);
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.h);
    }

    checker(s, rows, alpha) {
      const ctx = this.ctx;
      this.local(s, 0);
      const n = 12, sz = (HALF * 2) / n;
      ctx.globalAlpha = alpha || 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < n; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#1d1d2b' : '#ffffff';
          ctx.fillRect(-HALF + c * sz, -r * sz - sz, sz + 0.5, sz + 0.5);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    drawFeatures(level, overhead) {
      const ctx = this.ctx, tr = this.tr, t = this.time;
      const visS = (s) => this.vis[Math.floor(tr.idx(s) / 24)] === 1 || this.vis[Math.max(0, Math.floor(tr.idx(s) / 24) - 1)] === 1;
      const lv = (s) => (tr.eAt(s) > 0.5 ? 1 : 0);
      if (!overhead) {
        if (visS(FR.START) && lv(FR.START) === level) this.checker(FR.START, 2, 0.9);
        if (visS(tr.finish) && lv(tr.finish) === level) this.checker(tr.finish - (HALF * 2) / 12 * 1.5, 3, 1);
      }
      for (const f of tr.feats) {
        if (!visS(f.s) && !visS(f.s + f.len)) continue;
        if (!overhead && lv(f.s) !== level) continue;
        if (overhead) {
          if (f.type === 'gate') this.gate(f.s, FR.THEMES[f.theme]);
          continue;
        }
        if (f.type === 'boost') {
          this.local(f.s + f.len, 0);
          const L = f.len, l0 = f.l0, l1 = f.l1;
          const g = ctx.createLinearGradient(0, 0, 0, L);
          g.addColorStop(0, '#ffe45c'); g.addColorStop(1, '#ff8a1e');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.roundRect(l0, 0, l1 - l0, L, 12); ctx.fill();
          ctx.save();
          ctx.beginPath(); ctx.roundRect(l0, 0, l1 - l0, L, 12); ctx.clip();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
          const mid = (l0 + l1) / 2, half = (l1 - l0) / 2 - 10;
          for (let k = 0; k < 3; k++) {
            const y = L - ((t * 150 + (k * L) / 3) % L);
            ctx.globalAlpha = 0.35 + 0.65 * (1 - y / L);
            ctx.beginPath();
            ctx.moveTo(mid - half, y + 16); ctx.lineTo(mid, y); ctx.lineTo(mid + half, y + 16);
            ctx.stroke();
          }
          ctx.restore();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.roundRect(l0, 0, l1 - l0, L, 12); ctx.stroke();
          ctx.restore();
        } else if (f.type === 'jump') {
          this.local(f.s + f.len, 0);
          const L = f.len;
          const g = ctx.createLinearGradient(0, L, 0, 0);
          g.addColorStop(0, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.6)');
          ctx.fillStyle = '#7b61ff'; ctx.fillRect(-HALF, 0, HALF * 2, L);
          ctx.fillStyle = g; ctx.fillRect(-HALF, 0, HALF * 2, L);
          const n = 10, sw = (HALF * 2) / n;
          for (let i = 0; i < n; i++) {
            ctx.fillStyle = i % 2 ? '#222' : '#ffd43b';
            ctx.fillRect(-HALF + i * sw, 0, sw, 9);
          }
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          for (const x of [-HALF / 2, 0, HALF / 2]) {
            ctx.beginPath(); ctx.moveTo(x - 12, L - 14); ctx.lineTo(x, L - 34); ctx.lineTo(x + 12, L - 14); ctx.closePath(); ctx.fill();
          }
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-HALF, -10, HALF * 2, 10);
          ctx.restore();
        } else if (f.type === 'wash') {
          for (let k = 0; k < f.len; k += 18) {
            this.local(f.s + k, 0);
            ctx.fillStyle = (k / 18) % 2 ? '#ffffff' : '#ff4d6d';
            ctx.globalAlpha = 0.85;
            ctx.fillRect(-HALF, -9, HALF * 2, 9);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        } else if (f.type === 'pegs') {
          for (const p of f.pegs) {
            const q = tr.pos(p.s, p.l, this.tmp);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath(); ctx.arc(q.x + 4, q.y + 6, 11, 0, TAU); ctx.fill();
            const g = ctx.createRadialGradient(q.x - 3, q.y - 4, 1, q.x, q.y, 11);
            g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c6d2e0'); g.addColorStop(1, '#5f6f83');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(q.x, q.y, 10, 0, TAU); ctx.fill();
            if (p.flash > 0) {
              ctx.strokeStyle = 'rgba(255,230,90,' + p.flash + ')'; ctx.lineWidth = 4;
              ctx.beginPath(); ctx.arc(q.x, q.y, 12 + (1 - p.flash) * 14, 0, TAU); ctx.stroke();
            }
          }
        }
      }
      if (overhead) {
        if (visS(FR.START)) this.arch(FR.START - 10, 'СТАРТ', '#3fa7ff', false);
        if (visS(tr.finish)) this.arch(tr.finish, 'ФИНИШ', '#ff4d6d', true);
      }
    }

    gate(s, th) {
      this.arch(s, th.emoji + ' ' + th.name, th.rail === '#ffffff' ? '#ff4d6d' : th.rail, false);
    }

    arch(s, text, color, checker) {
      const ctx = this.ctx;
      this.local(s, 0);
      const X = HALF + RAIL + 10;
      // тень арки
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-X + 20, 6, X * 2, 30);
      // столбы
      for (const x of [-X, X]) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(x + 5, 6, 15, 0, TAU); ctx.fill();
        ctx.fillStyle = FR.shade(color, -0.3);
        ctx.beginPath(); ctx.arc(x, 0, 15, 0, TAU); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x - 2, -2, 11, 0, TAU); ctx.fill();
      }
      // полотнище
      ctx.globalAlpha = 0.93;
      if (checker) {
        const n = 16, sz = (X * 2) / n;
        for (let r = 0; r < 2; r++) for (let c = 0; c < n; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#1d1d2b' : '#ffffff';
          ctx.fillRect(-X + c * sz, -17 + r * 17, sz + 0.5, 17.5);
        }
        ctx.fillStyle = 'rgba(29,29,43,0.85)';
        ctx.beginPath(); ctx.roundRect(-70, -16, 140, 32, 10); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(25,18,60,0.88)';
        ctx.beginPath(); ctx.roundRect(-X, -16, X * 2, 32, 10); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(-X, -16, X * 2, 32, 10); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = '900 17px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 1, X * 2 - 20);
      ctx.restore();
    }

    drawDecor(y0, y1, glowPass) {
      const ctx = this.ctx, Dc = this.tr.decor, SP = FR.Sprites;
      const lo = lowerBound(Dc, y0 - 140);
      if (glowPass) ctx.globalCompositeOperation = 'lighter';
      for (let i = lo; i < Dc.length; i++) {
        const d = Dc[i];
        if (d.y > y1 + 140) break;
        if (d.x + d.size * 2 < this.view.x0 || d.x - d.size * 2 > this.view.x1) continue;
        if (glowPass) {
          if (d.glow) {
            const r = 80 + Math.sin(this.time * 3 + d.x) * 4;
            ctx.drawImage(SP.glow, d.x - r, d.y - r, r * 2, r * 2);
          }
          continue;
        }
        if (d.type === 'stand') {
          const img = SP.decor.stand[d.v];
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate(d.rot + (d.side > 0 ? Math.PI / 2 : -Math.PI / 2));
          ctx.drawImage(img, -64, -34, 128, 75);
          ctx.restore();
          continue;
        }
        const arr = SP.decor[d.type];
        const img = arr[d.v % arr.length];
        const r = d.size * 1.25;
        ctx.drawImage(img, d.x - r, d.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    drawMarbles(level) {
      const ctx = this.ctx, race = this.race, SP = FR.Sprites;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const list = race.marbles.filter((m) => (m.e > 0.5 ? 1 : 0) === level).sort((a, b) => a.z - b.z || b.y - a.y);
      // шлейфы
      for (const m of list) {
        const tr = this.trails[m.id];
        if (tr.length < 2) continue;
        const col = this.faces[m.id].color;
        for (let i = 1; i < tr.length; i++) {
          ctx.strokeStyle = FR.rgba(col, (i / tr.length) * 0.45);
          ctx.lineWidth = R * 1.6 * (i / tr.length);
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
      for (const m of list) {
        const f = this.faces[m.id];
        let x = m.x, y = m.y;
        const sc = 1 + m.z * 0.008 + m.e * 0.12;
        const r = R * sc;
        // тень
        ctx.fillStyle = 'rgba(0,0,0,' + (0.3 - Math.min(0.15, m.z * 0.002)) + ')';
        ctx.beginPath();
        ctx.ellipse(x + 5 + m.z * 0.45, y + 7 + m.z * 0.6, R * 0.98, R * 0.85, 0, 0, TAU);
        ctx.fill();
        ctx.drawImage(f.face, x - r, y - r, r * 2, r * 2);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(m.spin * 0.12);
        ctx.drawImage(f.ring, -r, -r, r * 2, r * 2);
        ctx.restore();
        ctx.drawImage(SP.shine, x - r, y - r, r * 2, r * 2);
      }
    }

    drawParts() {
      const ctx = this.ctx;
      for (const p of this.parts) {
        const a = p.life / p.max;
        if (p.kind === 'spark') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else if (p.kind === 'dust') {
          ctx.globalAlpha = a * 0.7;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU); ctx.fill();
        } else if (p.kind === 'confetti') {
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }

    drawLabels(cx, cy) {
      const ctx = this.ctx, race = this.race, cam = this.cam, z = cam.z;
      const leader = race.ranking[0];
      ctx.font = '800 12px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const showNames = z > this.baseZ * 0.7 || race.N <= 6;
      for (const m of race.marbles) {
        const sx = cx + (m.x - cam.x) * z, sy = cy + (m.y - cam.y) * z;
        if (sx < -10 || sx > this.w + 10 || sy < -10 || sy > this.h + 10) {
          if (!m.finished) this.offscreen(m, sx, sy, cx, cy);
          continue;
        }
        const r = R * (1 + m.z * 0.008) * z;
        const f = this.faces[m.id];
        if (showNames) {
          const tw = Math.min(90, ctx.measureText(f.name).width) + 14;
          const ly = sy - r - 13;
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.roundRect(sx - tw / 2, ly - 9, tw, 18, 9); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#fff';
          ctx.fillText(f.name, sx, ly + 0.5, 90);
        }
        if (m.id === leader) {
          ctx.font = '20px ' + EMOJI;
          ctx.fillText('👑', sx + r * 0.75, sy - r * 0.8);
          ctx.font = '800 12px ' + FONT;
        }
      }
    }

    offscreen(m, sx, sy, cx, cy) {
      // аватар у края экрана со стрелкой в сторону шарика
      const ctx = this.ctx, f = this.faces[m.id];
      const dx = sx - cx, dy = sy - cy;
      const mx = this.w / 2 - 34, myTop = cy - 110, myBot = this.h - cy - 90;
      let k = Math.min(Math.abs(mx / (dx || 1e-6)), dy < 0 ? Math.abs(myTop / dy) : Math.abs(myBot / (dy || 1e-6)));
      k = Math.min(k, 1);
      const px = cx + dx * k, py = cy + dy * k;
      const a = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(px, py);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
      ctx.lineTo(Math.cos(a + 0.5) * 18, Math.sin(a + 0.5) * 18);
      ctx.lineTo(Math.cos(a - 0.5) * 18, Math.sin(a - 0.5) * 18);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, TAU); ctx.fill();
      ctx.drawImage(f.face, -16, -16, 32, 32);
      if (m.rocket) {
        ctx.font = '16px ' + EMOJI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🚀', 16, 14);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    drawScreenParts() {
      const ctx = this.ctx;
      for (const p of this.screenParts) {
        if (p.fw) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.globalAlpha = Math.min(1, p.life);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.scale(1, Math.abs(Math.cos(p.ph)) * 0.8 + 0.2);
          ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  const FONT = "'Nunito', system-ui, Roboto, sans-serif";
  const EMOJI = "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";

  function lowerBound(arr, y) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].y < y) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  FR.Renderer = Renderer;
})(window);
