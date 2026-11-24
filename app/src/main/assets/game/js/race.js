/* Семейная Гонка — симуляция заезда
 *
 * Шарики едут свободно: у каждого своя «форма», которая случайно
 * меняется по ходу гонки, плюс ускорители, столбики, трамплины и
 * столкновения. Правила для всех одинаковые, стартовая решётка
 * перемешивается криптослучайно, поэтому шансы на победу равные.
 *
 * Если шарик отстал и пропал из кадра дольше 2 секунд,
 * он получает «ракету-догонялку» и возвращается к группе.
 */
(function (G) {
  'use strict';
  const FR = G.FR;
  const D = FR.D, R = FR.R, HALF = FR.TRACK_W / 2;
  const LIM = HALF - R - 3;
  const LOST = (FR.LOST_DIST = 470);   // отставание, при котором шарик пропадает из кадра
  const RESCUE_DELAY = 2.0;            // через сколько секунд дать ракету
  const RESCUE_UNTIL = 170;            // ракета работает, пока не догонит до этого отставания

  function gauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v);
  }

  class Race {
    constructor(players, opt) {
      opt = opt || {};
      this.players = players;
      const N = (this.N = players.length);
      this.T = opt.duration || 300 + FR.secureInt(46);
      this.rng = FR.makeRng(opt.seed != null ? opt.seed : FR.secureU32());
      const rng = this.rng;
      this.vNom = 150;
      this.track = FR.buildTrack(rng, this.vNom * this.T);
      const tr = this.track;
      // дальше — только «живой» криптослучай: исход заранее не определён
      this.rng = FR.trueRng();
      this.shots = [];
      this.hazards = [];
      this.itemFeats = tr.feats.filter((f) => f.type === 'items');
      for (const f of this.itemFeats) for (const b of f.boxes) b.cd = 0;

      // ---- стартовая решётка: честное перемешивание ----
      const gridOrder = FR.secureShuffle(players.map((_, i) => i));
      const rng2 = this.rng;
      const perRow = Math.min(4, N);
      this.marbles = players.map((p, i) => ({
        id: i, p, s: 0, l: 0, v: 0, vl: 0, z: 0, vz: 0,
        spin: rng() * 6.28, boost: 0, fi: 0, form: gauss(rng) * 0.03,
        finished: false, finishTime: 0, place: -1,
        laneT: 0, laneTimer: rng.range(1, 3), ph1: rng() * 6.28, ph2: rng() * 6.28,
        wash: false, hitCd: 0, x: 0, y: 0, h: 0, e: 0,
        lostT: 0, rocket: false, rockets: 0,
        item: null, itemT: 0, shield: 0, stun: 0, magnet: 0, ps: 0, turbo: 0,
      }));
      gridOrder.forEach((id, r) => {
        const row = Math.floor(r / perRow), col = r % perRow;
        const inRow = Math.min(perRow, N - row * perRow);
        const m = this.marbles[id];
        m.s = FR.START - 26 - row * 54;
        m.l = (col - (inRow - 1) / 2) * 45;
        m.laneT = m.l;
      });

      // ---- базовая скорость: средний шарик проходит трассу за T ----
      let I = 0;
      const s0 = this.marbles.reduce((a, m) => a + m.s, 0) / N;
      for (let s = s0; s < tr.finish; s += FR.STEP) I += FR.STEP / tr.fAt(s);
      this.v0 = I / (this.T * 1.065 - 1.3); // лидер обычно чуть быстрее среднего

      this.t = 0;
      this.events = [];
      this.finishCount = 0;
      this.results = [];
      this.winnerDone = false;
      this.winnerTime = 0;
      this.ranking = gridOrder.slice();
      this.leader = this.ranking[0];
      this.lastLeadChange = 0;
      this.sectionIdx = 0;
      this.milestones = {};
      this.photoFinish = false;
      this.maxSpread = 0;
      this.rescues = 0;
    }

    trigger(m, f) {
      if (m.finished) return;
      if (f.type === 'boost') {
        if (m.l >= f.l0 - 6 && m.l <= f.l1 + 6) {
          m.boost = 0.5 * this.v0;
          this.events.push({ type: 'boost', id: m.id });
        }
      } else if (f.type === 'brake') {
        if (m.l >= f.l0 - 6 && m.l <= f.l1 + 6) {
          if (m.turbo > 0) { this.events.push({ type: 'immune', id: m.id, what: 'brake' }); }
          else if (m.shield > 0) { m.shield = 0; this.events.push({ type: 'block', id: m.id }); }
          else {
            m.boost = Math.min(m.boost, -0.5 * this.v0);
            this.events.push({ type: 'brake', id: m.id });
          }
        }
      } else if (f.type === 'items') {
        if (m.item) return;
        for (const b of f.boxes) {
          if (b.cd > 0 || Math.abs(m.l - b.l) > R + 14) continue;
          b.cd = 2.5;
          m.item = this.pickItem(m);
          m.itemT = this.rng.range(0.8, 2.2);
          this.events.push({ type: 'item', id: m.id, item: m.item });
          break;
        }
      } else if (f.type === 'jump') {
        m.pendingJump = f.s + f.len;
      } else if (f.type === 'gate') {
        if (f.theme > this.sectionIdx) {
          this.sectionIdx = f.theme;
          this.events.push({ type: 'section', theme: f.theme, id: m.id });
        }
      }
    }

    step(dt) {
      const tr = this.track, rng = this.rng;
      this.t += dt;
      const t = this.t;
      const ramp = Math.min(1, t / 2.6);
      const v0 = this.v0;
      const feats = tr.feats;
      const leadS = this.marbles[this.ranking[0]].s;
      const sq = Math.sqrt(dt);

      for (const m of this.marbles) {
        // «форма» шарика: медленно и случайно меняется (процесс Орнштейна—Уленбека)
        const tau = 6, sigma = 0.085;
        m.form += (-m.form / tau) * dt + sigma * Math.sqrt(2 / tau) * gauss(rng) * sq;

        // ракета-догонялка
        if (!m.finished) {
          const gap = leadS - m.s;
          if (m.rocket) {
            if (gap < RESCUE_UNTIL) m.rocket = false;
          } else if (gap > LOST && t > 6 && m.stun <= 0) {
            m.lostT += dt;
            if (m.lostT > RESCUE_DELAY) {
              m.rocket = true;
              m.rockets++;
              m.lostT = 0;
              this.rescues++;
              this.events.push({ type: 'rescue', id: m.id });
            }
          } else m.lostT = 0;
        } else m.rocket = false;

        let vt;
        if (m.finished) {
          const past = m.s - tr.finish;
          vt = Math.max(0, v0 * 0.9 * (1 - past / 650));
        } else {
          const wob = 0.025 * Math.sin(t * 1.7 + m.ph1);
          let mag = 0;
          if (m.magnet > 0) {
            for (const o of this.marbles) {
              const ds = o.s - m.s;
              if (o !== m && ds > 0 && ds < D * 7) { mag = 0.45 * v0; break; }
            }
          }
          vt = v0 * tr.fAt(m.s) * ramp * (1 + m.form + wob) + m.boost + mag + (m.rocket ? 1.1 * v0 : 0);
          if (m.stun > 0) vt *= m.stunK || 0.3;
          else vt = Math.max(vt, 0.2 * v0);
        }
        const up = m.rocket ? 420 : 240, down = 380;
        m.v += FR.clamp(vt - m.v, -down * dt, up * dt);
        if (m.v < 0) m.v = 0;
        m.ps = m.s;
        m.s += m.v * dt;
        m.boost *= Math.exp(-dt * 1.1);
        m.spin += (m.v * dt) / R + (m.stun > 0 ? dt * 14 : 0);
        if (m.shield > 0) m.shield -= dt;
        if (m.stun > 0) { m.stun -= dt; if (m.stun <= 0) m.stunK = 0.3; }
        if (m.magnet > 0) m.magnet -= dt;
        if (m.turbo > 0) {
          m.turbo -= dt;
          m.boost = Math.max(m.boost, 0.45 * v0);
        }
        if (m.item && !m.finished) {
          m.itemT -= dt;
          if (m.itemT <= 0) this.useItem(m);
        }
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

      // объезд более медленных впереди
      for (const m of this.marbles) {
        if (m.finished) continue;
        let ahead = null, best = 1e9;
        for (const o of this.marbles) {
          if (o === m) continue;
          const ds = o.s - m.s;
          if (ds > 0 && ds < D * 1.7 && Math.abs(o.l - m.l) < D * 0.95 && ds < best) { best = ds; ahead = o; }
        }
        if (ahead && m.v > ahead.v + 4) {
          const left = ahead.l - D * 1.1, right = ahead.l + D * 1.1;
          const toLeft = left > -LIM ? Math.abs(m.l - left) : 1e9;
          const toRight = right < LIM ? Math.abs(m.l - right) : 1e9;
          m.laneT = toLeft < toRight ? left : right;
          m.laneTimer = Math.max(m.laneTimer, 1.2);
        }
      }

      this.collide();
      this.pegs();
      this.updateItems(dt);

      // финиш
      for (const m of this.marbles) {
        if (!m.finished && m.s >= tr.finish) {
          m.finished = true;
          m.finishTime = this.t - (m.s - tr.finish) / Math.max(1, m.v);
          m.place = this.finishCount++;
          this.results.push(m.id);
          if (m.place === 0) {
            this.winnerDone = true;
            this.winnerTime = m.finishTime;
            let second = -1e9;
            for (const o of this.marbles) if (o !== m) second = Math.max(second, o.s);
            this.photoFinish = m.s - second < D * 0.8;
          }
          this.events.push({ type: 'finish', id: m.id, place: m.place });
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
      // скоро фотофиниш?
      if (!this.winnerDone && tr.finish - lead.s < D * 4) {
        const sec = this.marbles[rk[1]];
        this.closeFinish = sec && lead.s - sec.s < D * 1.2;
      }
      const ms = this.milestones;
      if (!ms.half && this.progress >= 0.5) { ms.half = 1; this.events.push({ type: 'half' }); }
      if (!ms.straight && lead.s > tr.finish - 1100) { ms.straight = 1; this.events.push({ type: 'straight' }); }
      if (!ms.minute && this.T > 100 && this.progress > 1 - 60 / this.T && !this.winnerDone) {
        ms.minute = 1; this.events.push({ type: 'minute' });
      }

      this.allDone = this.finishCount === this.N;
    }

    // ---------- бонусы ----------
    pickItem(m) {
      const N = this.N;
      const rank = this.ranking.indexOf(m.id);
      const p = N > 1 ? rank / (N - 1) : 0;
      let table;
      if (rank === 0) table = [['shield', 35], ['banana', 40], ['turbo', 15], ['magnet', 10]];
      else if (p < 0.7) table = [['rocket', 30], ['banana', 20], ['turbo', 25], ['shield', 10], ['magnet', 15]];
      else table = [['rocket', 35], ['turbo', 28], ['magnet', 15], ['zap', 10], ['shield', 12]];
      let sum = 0;
      for (const t of table) sum += t[1];
      let r = this.rng() * sum;
      for (const t of table) { r -= t[1]; if (r <= 0) return t[0]; }
      return table[0][0];
    }

    useItem(m) {
      const it = m.item, v0 = this.v0;
      m.item = null;
      switch (it) {
        case 'rocket': {
          const rk = this.ranking.filter((id) => !this.marbles[id].finished);
          const target = rk[0] === m.id ? rk[1] : rk[0];
          if (target == null) { m.boost = 0.85 * v0; this.events.push({ type: 'turbo', id: m.id }); break; }
          // чем дальше позади стрелок, тем сильнее ракета
          const pos = rk.indexOf(m.id);
          const p = rk.length > 1 ? pos / (rk.length - 1) : 0;
          this.shots.push({ from: m.id, target, s: m.s + R, l: m.l, life: 14, power: 1.3 + 2.2 * p, big: p >= 0.6 });
          this.events.push({ type: 'shoot', id: m.id, target });
          break;
        }
        case 'banana':
          this.hazards.push({ s: m.s - D * 1.3, l: m.l, owner: m.id, t: 0 });
          this.events.push({ type: 'drop', id: m.id });
          break;
        case 'shield':
          m.shield = 9;
          this.events.push({ type: 'shield', id: m.id });
          break;
        case 'turbo':
          // супер-сила: 3.5 секунды разгона и неуязвимости к тормозам, бананам и столбикам
          m.turbo = 3.5;
          m.stun = 0;
          m.boost = Math.max(m.boost, 0.85 * v0);
          this.events.push({ type: 'turbo', id: m.id });
          break;
        case 'magnet':
          m.magnet = 3.5;
          this.events.push({ type: 'magnet', id: m.id });
          break;
        case 'zap': {
          const hit = [];
          for (const o of this.marbles) {
            if (o === m || o.finished || o.s <= m.s) continue;
            if (o.shield > 0) { o.shield = 0; this.events.push({ type: 'block', id: o.id }); }
            else { o.stun = Math.max(o.stun, 0.8); hit.push(o.id); }
          }
          this.events.push({ type: 'zap', id: m.id, hit });
          break;
        }
      }
    }

    hitMarble(o, power, by, kind, slow) {
      if (o.shield > 0) {
        o.shield = 0;
        this.events.push({ type: 'block', id: o.id });
        return;
      }
      o.stun = Math.max(o.stun, power);
      o.stunK = slow || 0.3;
      if (kind === 'bighit') { o.boost = Math.min(o.boost, -0.4 * this.v0); o.v *= 0.4; }
      if (o.z <= 0.5) { o.vz = 170; o.z = 4; }
      o.vl += (this.rng() < 0.5 ? -1 : 1) * 90;
      this.events.push({ type: kind, id: o.id, by });
    }

    updateItems(dt) {
      for (const f of this.itemFeats) for (const b of f.boxes) if (b.cd > 0) b.cd -= dt;
      // ракеты
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const sh = this.shots[i];
        const tg = this.marbles[sh.target];
        sh.life -= dt;
        if (tg.finished || sh.life <= 0) { this.shots.splice(i, 1); continue; }
        const sp = Math.max(2.4 * this.v0, tg.v + 140);
        sh.s += sp * dt;
        sh.l += FR.clamp(tg.l - sh.l, -260 * dt, 260 * dt);
        if (sh.s >= tg.s - R) {
          this.shots.splice(i, 1);
          this.hitMarble(tg, sh.power || 1.3, sh.from, sh.big ? 'bighit' : 'hit', sh.big ? 0.1 : 0.3);
        }
      }
      // бананы
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i];
        h.t += dt;
        if (h.t > 45) { this.hazards.splice(i, 1); continue; }
        for (const m of this.marbles) {
          if (m.finished || m.z > 15) continue;
          if (m.id === h.owner && h.t < 1.5) continue;
          if (m.ps < h.s && m.s >= h.s && Math.abs(m.l - h.l) < R + 10) {
            if (m.turbo > 0) {
              if (!h.jumped) { h.jumped = true; this.events.push({ type: 'immune', id: m.id, what: 'banana' }); }
              continue;
            }
            this.hazards.splice(i, 1);
            this.hitMarble(m, 0.9, h.owner, 'slip');
            break;
          }
        }
      }
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

    collide() {
      const ms = this.marbles, N = ms.length;
      const sK = 0.55;
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
        if (m.turbo > 0) continue; // в турбо столбики не мешают
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
            const need = Math.sqrt(Math.max(0, (R + PR) * (R + PR) - ds * ds));
            m.l = p.l + side * need;
            if (Math.abs(m.l) > LIM) { side = -side; m.l = p.l + side * need; }
            m.vl = side * Math.max(Math.abs(m.vl), 70);
            m.v *= 0.98;
            if (p.flash < 0.2) this.events.push({ type: 'peg', id: m.id });
            p.flash = 1;
          }
        }
      }
    }
  }

  FR.Race = Race;
})(typeof window !== 'undefined' ? window : globalThis);
