/* Семейная Гонка — симуляция заезда
 *
 * Принцип честности: порядок финиша выбирается в самом начале
 * криптостойким перемешиванием (у каждого равные шансы), и никто,
 * включая владельца телефона, его не знает. Всю гонку «режиссёр»
 * держит шарики плотной группой и устраивает обгоны, а в последние
 * ~40 секунд группа плавно выстраивается в выбранный порядок.
 */
(function (G) {
  'use strict';
  const FR = G.FR;
  const D = FR.D, R = FR.R, HALF = FR.TRACK_W / 2;
  const LIM = HALF - R - 3;

  class Race {
    constructor(players, opt) {
      opt = opt || {};
      this.players = players;
      const N = (this.N = players.length);
      this.T = opt.duration || 300 + FR.secureInt(46); // 5:00 … 5:45 до финиша победителя
      this.rng = FR.makeRng(opt.seed != null ? opt.seed : FR.secureU32());
      const rng = this.rng;
      this.vNom = 150;
      this.track = FR.buildTrack(rng, this.vNom * this.T);
      const tr = this.track;

      // ---- честный выбор итогового порядка ----
      this.finalOrder = FR.secureShuffle(players.map((_, i) => i));
      this.winner = this.finalOrder[0];
      this.photoFinish = rng() < 0.45;
      this.photoGap = this.photoFinish ? rng.range(0.12, 0.3) * D : rng.range(0.55, 1.1) * D;
      this.tw = rng.range(1.2, 7);
      this.wStart = N <= 2 ? 1 : rng.int(1, Math.max(1, Math.floor((N - 1) * 0.6)));

      const S = FR.clamp(0.6 * D * (N - 1), 1.0 * D, 5.0 * D);
      this.gap = N > 1 ? S / (N - 1) : 0;
      this.sp1 = rng() * 6.28;
      this.sp2 = rng() * 6.28;

      // ---- стартовая решётка ----
      const gridOrder = rng.shuffle(players.map((_, i) => i));
      this.order = gridOrder.slice();
      const perRow = Math.min(4, N);
      this.marbles = players.map((p, i) => ({
        id: i, p, s: 0, l: 0, v: 0, vl: 0, z: 0, vz: 0,
        spin: rng() * 6.28, offset: 0, slot: 0, boost: 0, fi: 0,
        finished: false, finishTime: 0, place: -1,
        laneT: 0, laneTimer: rng.range(1, 3), ph1: rng() * 6.28, ph2: rng() * 6.28,
        wash: false, hitCd: 0, x: 0, y: 0, h: 0,
      }));
      gridOrder.forEach((id, r) => {
        const row = Math.floor(r / perRow), col = r % perRow;
        const inRow = Math.min(perRow, N - row * perRow);
        const m = this.marbles[id];
        m.s = FR.START - 26 - row * 54;
        m.l = (col - (inRow - 1) / 2) * 45;
        m.laneT = m.l;
      });
      this.sc = this.marbles.reduce((a, m) => a + m.s, 0) / N;
      this.marbles.forEach((m) => (m.offset = m.s - this.sc));

      // ---- базовая скорость, чтобы победитель финишировал около T ----
      const endOffsets = this.slotOffsets(0.8, this.photoGap);
      const endC = tr.finish - (endOffsets[0] || 0);
      let I = 0;
      for (let s = this.sc; s < endC; s += FR.STEP) I += FR.STEP / tr.fAt(s);
      this.v0 = I / (this.T - 1.3);

      this.t = 0;
      this.swapTimer = 2;
      this.events = [];
      this.finishCount = 0;
      this.results = [];
      this.winnerDone = false;
      this.winnerTime = 0;
      this.ranking = this.order.slice();
      this.leader = this.ranking[0];
      this.leaderSince = 0;
      this.lastLeadChange = 0;
      this.sectionIdx = 0;
      this.milestones = {};
      this.maxSpread = 0;
    }

    // Позиции «слотов» относительно центра группы (индекс = место)
    slotOffsets(spread, photoGap) {
      const N = this.N;
      const pos = [0];
      for (let r = 0; r < N - 1; r++) {
        const g = r === 0 && photoGap != null ? photoGap : this.gap * spread;
        pos.push(pos[r] - g);
      }
      const c = pos.reduce((a, b) => a + b, 0) / N;
      return pos.map((p) => p - c);
    }

    finalTarget(t) {
      const others = this.finalOrder.slice(1);
      const t1 = this.T - 24, t2 = this.T - this.tw;
      let w = this.wStart;
      if (t >= t1) w = Math.round(FR.lerp(this.wStart, 0, FR.clamp((t - t1) / (t2 - t1), 0, 1)));
      w = Math.min(w, others.length);
      others.splice(w, 0, this.winner);
      return others;
    }

    swap(i) {
      const o = this.order;
      const t = o[i]; o[i] = o[i + 1]; o[i + 1] = t;
    }

    updateOrder(dt) {
      const N = this.N, t = this.t, T = this.T, rng = this.rng;
      if (N < 2) return;
      this.swapTimer -= dt;
      if (this.swapTimer > 0) return;
      const fStart = T - 42;
      if (t < fStart) {
        this.swapTimer = rng.range(1.8, 4.6) * Math.pow(6 / Math.max(3, N), 0.35);
        const o = this.order;
        if (t - this.leaderSince > 30) {
          this.swap(0);
          return;
        }
        const r = rng();
        if (r < 0.62) {
          this.swap(rng.int(0, N - 2));
        } else if (r < 0.87 && N >= 3) {
          const from = rng.int(2, N - 1);
          const to = Math.max(0, from - rng.int(2, 3));
          const id = o.splice(from, 1)[0];
          o.splice(to, 0, id);
          this.events.push({ type: 'rush', id });
        } else {
          const id = o.shift();
          o.splice(Math.min(N - 1, rng.int(1, 2)), 0, id);
          this.events.push({ type: 'stumble', id });
        }
      } else {
        const target = this.finalTarget(t);
        const rankIn = new Array(N);
        target.forEach((id, r) => (rankIn[id] = r));
        const o = this.order;
        const pairs = [];
        for (let i = 0; i < N - 1; i++) if (rankIn[o[i]] > rankIn[o[i + 1]]) pairs.push(i);
        if (pairs.length) this.swap(pairs[rng.int(0, pairs.length - 1)]);
        this.swapTimer = FR.clamp(9 / Math.max(1, pairs.length * 2), 0.35, 1.1);
      }
    }

    trigger(m, f) {
      if (m.finished) return;
      if (f.type === 'boost') {
        if (m.l >= f.l0 - 6 && m.l <= f.l1 + 6) {
          m.boost = 0.55 * this.v0;
          this.events.push({ type: 'boost', id: m.id });
        }
      } else if (f.type === 'jump') {
        m.pendingJump = f.s + f.len;
      } else if (f.type === 'gate') {
        if (this.ranking[0] === m.id || f.theme > this.sectionIdx) {
          if (f.theme > this.sectionIdx) {
            this.sectionIdx = f.theme;
            this.events.push({ type: 'section', theme: f.theme, id: m.id });
          }
        }
      }
    }

    step(dt) {
      const tr = this.track, rng = this.rng, N = this.N, T = this.T;
      this.t += dt;
      const t = this.t;
      const ramp = Math.min(1, t / 2.6);
      const v0 = this.v0;

      if (!this.winnerDone) this.sc += v0 * tr.fAt(this.sc) * ramp * dt;
      else this.sc += v0 * 0.5 * dt;

      this.updateOrder(dt);

      let spread = 0.85 + 0.32 * Math.sin(t * 0.11 + this.sp1) * Math.sin(t * 0.047 + this.sp2);
      let photoGap = null;
      const tf = t - (T - 9);
      if (tf > 0) {
        const k = FR.smooth(tf / 6);
        spread = FR.lerp(spread, 0.8, k);
        photoGap = FR.lerp(this.gap * spread, this.photoGap, k);
      }
      const offs = this.slotOffsets(spread, photoGap);
      for (let r = 0; r < N; r++) this.marbles[this.order[r]].slot = offs[r];

      const feats = tr.feats;
      const endGame = t > T - 6;
      for (const m of this.marbles) {
        const rate = 0.95 * D;
        m.offset += FR.clamp(m.slot - m.offset, -rate * dt, rate * dt);
        let vt;
        if (m.finished) {
          const past = m.s - tr.finish;
          vt = Math.max(0, v0 * 0.9 * (1 - past / 650));
        } else {
          const err = this.sc + m.offset - m.s;
          const noise = 0.035 * Math.sin(t * 0.83 + m.ph1) + 0.02 * Math.sin(t * 2.1 + m.ph2);
          const kp = endGame ? 2.2 : 0.9;
          vt = v0 * tr.fAt(m.s) * ramp * (1 + (endGame ? 0 : noise)) +
            FR.clamp(err * kp, -0.4 * v0, 0.55 * v0) + m.boost;
        }
        const up = 260, down = 380;
        m.v += FR.clamp(vt - m.v, -down * dt, up * dt);
        if (m.v < 0) m.v = 0;
        m.s += m.v * dt;
        m.boost *= Math.exp(-dt * 1.1);
        m.spin += (m.v * dt) / R;
        if (m.hitCd > 0) m.hitCd -= dt;

        // боковое движение
        const th = FR.THEMES[tr.themeAt(m.s)];
        const k = tr.kAt(m.s);
        m.laneTimer -= dt;
        if (m.laneTimer <= 0) {
          m.laneTimer = rng.range(1.5, 4);
          m.laneT = rng.range(-LIM * 0.85, LIM * 0.85);
        }
        const cf = th.ice ? 0.55 : 0.4;
        const steer = th.ice ? 0.8 : 2.0, damp = th.ice ? 0.7 : 1.7;
        const al = -m.v * m.v * k * cf + (m.laneT - m.l) * steer - m.vl * damp;
        m.vl += al * dt;
        m.l += m.vl * dt;
        this.wall(m);

        // прыжки
        if (m.pendingJump != null && m.s >= m.pendingJump) {
          m.pendingJump = null;
          if (m.z <= 0.5) {
            m.vz = rng.range(230, 320);
            m.z = 10;
            this.events.push({ type: 'jump', id: m.id });
          }
        }
        if (m.z > 0 || m.vz > 0) {
          m.vz -= 1100 * dt;
          m.z += m.vz * dt;
          if (m.z <= 0) {
            m.z = 0;
            if (m.vz < -140) {
              this.events.push({ type: 'land', id: m.id, power: -m.vz });
              m.vz = -m.vz * 0.28;
            } else m.vz = 0;
          }
        }
        m.wash = tr.washAt(m.s);

        while (m.fi < feats.length && feats[m.fi].s <= m.s) {
          this.trigger(m, feats[m.fi]);
          m.fi++;
        }
      }

      // объезд впереди идущих
      for (const m of this.marbles) {
        if (m.finished) continue;
        let ahead = null, best = 1e9;
        for (const o of this.marbles) {
          if (o === m) continue;
          const ds = o.s - m.s;
          if (ds > 0 && ds < D * 1.6 && Math.abs(o.l - m.l) < D * 0.95 && ds < best) {
            best = ds; ahead = o;
          }
        }
        if (ahead && this.sc + m.offset - m.s > D * 0.3) {
          const left = ahead.l - D * 1.1, right = ahead.l + D * 1.1;
          const toLeft = left > -LIM ? Math.abs(m.l - left) : 1e9;
          const toRight = right < LIM ? Math.abs(m.l - right) : 1e9;
          m.laneT = toLeft < toRight ? left : right;
          m.laneTimer = Math.max(m.laneTimer, 1.2);
        }
      }

      this.collide(endGame);
      this.pegs();

      // финиш
      for (const m of this.marbles) {
        if (!m.finished && m.s >= tr.finish) {
          m.finished = true;
          m.finishTime = this.t - (m.s - tr.finish) / Math.max(1, m.v);
          m.place = this.finishCount++;
          this.results.push(m.id);
          this.events.push({ type: 'finish', id: m.id, place: m.place });
          if (m.place === 0) {
            this.winnerDone = true;
            this.winnerTime = m.finishTime;
          }
        }
      }

      // рейтинг
      const rk = this.marbles.slice().sort((a, b) => {
        if (a.finished && b.finished) return a.place - b.place;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.s - a.s;
      }).map((m) => m.id);
      this.ranking = rk;
      if (rk[0] !== this.leader) {
        const prev = this.leader;
        this.leader = rk[0];
        this.leaderSince = t;
        if (t > 5 && t - this.lastLeadChange > 1.2 && !this.winnerDone) {
          this.events.push({ type: 'lead', id: rk[0], prev });
          this.lastLeadChange = t;
        }
      }
      const lead = this.marbles[rk[0]];
      this.leaderS = lead.s;
      this.progress = FR.clamp((lead.s - FR.START) / (tr.finish - FR.START), 0, 1);
      if (t > 8 && !this.winnerDone) {
        let mn = 1e9, mx = -1e9;
        for (const m of this.marbles) { mn = Math.min(mn, m.s); mx = Math.max(mx, m.s); }
        this.spreadNow = mx - mn;
        this.maxSpread = Math.max(this.maxSpread, mx - mn);
      }
      const ms = this.milestones;
      if (!ms.half && this.progress >= 0.5) { ms.half = 1; this.events.push({ type: 'half' }); }
      if (!ms.straight && lead.s > tr.finish - 1100) { ms.straight = 1; this.events.push({ type: 'straight' }); }
      if (!ms.minute && T - t < 60 && !this.winnerDone) { ms.minute = 1; this.events.push({ type: 'minute' }); }

      this.allDone = this.finishCount === N;
    }

    wall(m) {
      if (m.l > LIM) {
        m.l = LIM;
        if (m.vl > 0) {
          if (m.vl > 45) this.events.push({ type: 'rail', id: m.id, power: m.vl });
          m.vl = -m.vl * 0.45;
        }
      } else if (m.l < -LIM) {
        m.l = -LIM;
        if (m.vl < 0) {
          if (m.vl < -45) this.events.push({ type: 'rail', id: m.id, power: -m.vl });
          m.vl = -m.vl * 0.45;
        }
      }
    }

    collide(endGame) {
      const ms = this.marbles, N = ms.length;
      const sK = endGame ? 0.1 : 0.55;
      for (let it = 0; it < 2; it++) {
        for (let i = 0; i < N; i++) {
          const a = ms[i];
          for (let j = i + 1; j < N; j++) {
            const b = ms[j];
            const ds = b.s - a.s;
            if (ds > D || ds < -D) continue;
            if (Math.abs(a.z - b.z) > 24) continue;
            const dl = b.l - a.l;
            const d2 = ds * ds + dl * dl;
            if (d2 >= D * D) continue;
            let d = Math.sqrt(d2);
            let nx, nl;
            if (d < 0.01) { nx = 0; nl = this.rng() < 0.5 ? 1 : -1; d = 0.01; }
            else { nx = ds / d; nl = dl / d; }
            const ov = D - d;
            a.s -= nx * ov * 0.5 * sK; b.s += nx * ov * 0.5 * sK;
            a.l -= nl * ov * 0.5; b.l += nl * ov * 0.5;
            if (it === 0) {
              const rv = (b.v - a.v) * nx + (b.vl - a.vl) * nl;
              if (rv < 0) {
                const imp = -rv * 0.85;
                a.v -= imp * nx * 0.5 * sK; b.v += imp * nx * 0.5 * sK;
                a.vl -= imp * nl * 0.5; b.vl += imp * nl * 0.5;
                if (-rv > 22 && a.hitCd <= 0) {
                  a.hitCd = 0.25;
                  this.events.push({ type: 'clack', id: a.id, other: b.id, power: -rv });
                }
              }
            }
          }
        }
        for (const m of ms) this.wall(m);
      }
    }

    pegs() {
      const feats = this.track.feats;
      const PR = 10;
      for (const m of this.marbles) {
        for (let k = Math.max(0, m.fi - 2); k < Math.min(feats.length, m.fi + 2); k++) {
          const f = feats[k];
          if (f.type !== 'pegs') continue;
          for (const p of f.pegs) {
            const ds = m.s - p.s;
            if (ds > R + PR || ds < -(R + PR)) continue;
            const dl = m.l - p.l;
            const d = Math.sqrt(ds * ds + dl * dl);
            if (d >= R + PR) continue;
            let side = dl === 0 ? (this.rng() < 0.5 ? 1 : -1) : Math.sign(dl);
            // выталкиваем вбок, чтобы шарик объехал штырёк
            const need = Math.sqrt(Math.max(0, (R + PR) * (R + PR) - ds * ds));
            m.l = p.l + side * need;
            if (Math.abs(m.l) > LIM) {
              side = -side;
              m.l = p.l + side * need;
            }
            m.vl = side * Math.max(Math.abs(m.vl), 70);
            m.v *= 0.985;
            if (p.flash < 0.2) this.events.push({ type: 'peg', id: m.id });
            p.flash = 1;
          }
        }
      }
    }
  }

  FR.Race = Race;
})(typeof window !== 'undefined' ? window : globalThis);
