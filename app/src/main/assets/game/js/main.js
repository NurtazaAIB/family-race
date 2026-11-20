/* Семейная Гонка — меню, ход гонки, комментатор, результаты */
(function (G) {
  'use strict';
  const FR = G.FR;
  const $ = (id) => document.getElementById(id);
  const AND = G.Android && G.Android.isAndroid ? G.Android : null;
  const Q = new URLSearchParams(location.search);
  const AU = FR.Audio;

  // ---------------- хранилище ----------------
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('fr_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) { try { localStorage.setItem('fr_' + k, JSON.stringify(v)); } catch (e) { /* нет места */ } },
  };
  const IS_TV = !!(AND && AND.isTv && AND.isTv()) || Q.get('tv') === '1';
  const settings = Object.assign({ music: true, sfx: true, voice: true, mode: 'full', lite: IS_TV, liteManual: false }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);
  AU.musicOn = settings.music;
  AU.sfxOn = settings.sfx;

  let players = [];               // {id, name, src, img, color}
  let disabled = new Set(store.get('disabled', []));
  let stats = store.get('stats', {});

  // ---------------- UI helpers ----------------
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id || (id === 'countdown' && s.id === 'hud'));
  }
  let toastT = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
  G.onToast = toast;

  function modal(html, onMount) {
    $('modalCard').innerHTML = html;
    $('modal').classList.remove('hidden');
    if (onMount) onMount($('modalCard'));
    setTimeout(() => {
      const f = $('modalCard').querySelector('input, .btn.primary, .btn.secondary, .btn');
      if (f) f.focus();
    }, 60);
  }
  function closeModal() {
    $('modal').classList.add('hidden');
    const t = state && state.mode === 'menu' ? $('btnStart') : state && state.mode === 'results' ? $('btnAgain') : null;
    if (t) setTimeout(() => t.focus(), 60);
  }
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal') && !state.paused) closeModal();
  });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function colorFor(name, i) {
    return FR.PLAYER_COLORS[(FR.hashStr(name) + i * 0) % FR.PLAYER_COLORS.length];
  }
  function assignColors(list) {
    const used = new Set();
    for (const p of list) {
      let idx = FR.hashStr(p.name) % FR.PLAYER_COLORS.length;
      for (let k = 0; k < FR.PLAYER_COLORS.length && used.has(idx); k++) idx = (idx + 1) % FR.PLAYER_COLORS.length;
      used.add(idx);
      p.color = FR.PLAYER_COLORS[idx];
    }
  }

  function loadImg(src) {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }

  // ---------------- игроки ----------------
  async function setPlayers(list) {
    for (const p of list) p.img = p.img || (await loadImg(p.src));
    players = list.filter((p) => p.img);
    players.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    assignColors(players);
    renderPlayers();
  }

  G.onPlayers = function (json, access) {
    let arr = [];
    try { arr = JSON.parse(json); } catch (e) { arr = []; }
    $('accessNote').classList.toggle('hidden', access !== false);
    setPlayers(arr.map((o) => ({ id: o.id, name: o.name, src: o.src })));
  };
  G.onPlayerAdded = function (ok) {
    closeModal();
    toast(ok ? 'Игрок добавлен! 🎉' : 'Фото не выбрано');
  };

  function demoPlayers() {
    const names = ['Мама', 'Папа', 'Бабушка', 'Дедушка', 'Алия', 'Тимур'];
    return names.map((n, i) => {
      const c = FR.PLAYER_COLORS[i * 2 % FR.PLAYER_COLORS.length];
      const cv = FR.Sprites.demoAvatar(i * 7 + 3, c);
      return { id: 'demo' + i, name: n, src: cv.toDataURL('image/png'), img: cv };
    });
  }

  function requestPlayers() {
    if (AND) AND.requestPlayers();
    else if (!players.length) setPlayers(demoPlayers());
    else renderPlayers();
  }

  function renderPlayers() {
    const grid = $('playerGrid');
    grid.innerHTML = '';
    if (!players.length) {
      grid.innerHTML = '<div class="empty">Пока нет игроков 🙂<br>Добавьте фото членов семьи — и в путь!</div>';
    }
    for (const p of players) {
      const el = document.createElement('div');
      el.className = 'ptile' + (disabled.has(p.name) ? ' off' : '');
      el.tabIndex = 0;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 23) { e.preventDefault(); el.click(); }
        if (e.key === 'ContextMenu' || e.keyCode === 82) { e.preventDefault(); askDelete(p); }
      });
      el.innerHTML = '<div class="av" style="--c:' + p.color + ';background-image:url(' + p.src + ')"></div>' +
        '<div class="nm">' + esc(p.name) + '</div><div class="chk">' + (disabled.has(p.name) ? '' : '✓') + '</div>';
      let pressT = 0, long = false;
      const start = () => {
        long = false;
        pressT = setTimeout(() => { long = true; askDelete(p); }, 650);
      };
      const end = () => clearTimeout(pressT);
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('mousedown', start);
      el.addEventListener('touchend', end);
      el.addEventListener('mouseup', end);
      el.addEventListener('touchmove', end, { passive: true });
      el.addEventListener('mouseleave', end);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('click', () => {
        if (long) return;
        if (disabled.has(p.name)) disabled.delete(p.name); else disabled.add(p.name);
        store.set('disabled', [...disabled]);
        AU.init(); AU.ding();
        renderPlayers();
      });
      grid.appendChild(el);
    }
    const active = activePlayers().length;
    $('pcount').textContent = active + ' / ' + players.length;
    $('btnStart').disabled = active < 2;
  }

  const activePlayers = () => players.filter((p) => !disabled.has(p.name));

  function askDelete(p) {
    modal(
      '<h3>Удалить игрока?</h3>' +
      '<div style="display:grid;place-items:center;margin-bottom:12px"><div style="width:96px;height:96px;border-radius:50%;background:url(' + p.src + ') center/cover;border:5px solid ' + p.color + '"></div></div>' +
      '<p>' + esc(p.name) + ' будет удалён(а) из папки FamilyRace.</p>' +
      '<button class="btn danger" id="mDel">Удалить</button><button class="btn ghost" id="mCancel">Отмена</button>',
      (c) => {
        c.querySelector('#mCancel').onclick = closeModal;
        c.querySelector('#mDel').onclick = () => {
          closeModal();
          if (AND) AND.deletePlayer(p.id);
          else { players = players.filter((x) => x !== p); renderPlayers(); }
        };
      }
    );
  }

  function addPlayerDialog() {
    modal(
      '<h3>Новый игрок</h3>' +
      '<p>Как зовут участника?</p>' +
      '<input id="mName" class="field" maxlength="20" placeholder="Например, Мама" autocomplete="off">' +
      '<button class="btn secondary" id="mPick">📷 Выбрать фото</button>' +
      '<button class="btn ghost" id="mCancel">Отмена</button>' +
      '<input id="mFile" type="file" accept="image/*" class="hidden">',
      (c) => {
        const inp = c.querySelector('#mName');
        setTimeout(() => inp.focus(), 250);
        c.querySelector('#mCancel').onclick = closeModal;
        c.querySelector('#mPick').onclick = () => {
          const name = inp.value.trim();
          if (!name) { inp.focus(); toast('Сначала введите имя'); return; }
          if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) { toast('Такое имя уже есть'); return; }
          if (AND) AND.addPlayer(name);
          else c.querySelector('#mFile').click();
        };
        c.querySelector('#mFile').onchange = (e) => {
          const f = e.target.files[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = async () => {
            const name = inp.value.trim();
            players.push({ id: 'local' + Date.now(), name, src: rd.result });
            await setPlayers(players);
            G.onPlayerAdded(true);
          };
          rd.readAsDataURL(f);
        };
      }
    );
  }

  function toggleHtml(id, on, label) {
    return '<div class="set-row"><span>' + label + '</span><button class="toggle' + (on ? ' on' : '') + '" data-k="' + id + '"></button></div>';
  }
  function settingsDialog(inRace) {
    const mode = settings.mode;
    modal(
      '<h3>' + (inRace ? '⏸ Пауза' : '⚙️ Настройки') + '</h3>' +
      toggleHtml('music', settings.music, '🎵 Музыка') +
      toggleHtml('sfx', settings.sfx, '🔊 Звуки') +
      toggleHtml('voice', settings.voice, '🎙️ Голос комментатора') +
      toggleHtml('lite', settings.lite, '⚡ Облегчённая графика') +
      (inRace ? '' :
        '<div class="set-row" style="flex-direction:column;align-items:stretch;gap:8px"><span>⏱ Длительность гонки</span>' +
        '<div class="seg" id="mMode">' +
        '<button data-m="quick" class="' + (mode === 'quick' ? 'on' : '') + '">~1 мин</button>' +
        '<button data-m="mid" class="' + (mode === 'mid' ? 'on' : '') + '">~3 мин</button>' +
        '<button data-m="full" class="' + (mode === 'full' ? 'on' : '') + '">5–6 мин</button>' +
        '</div></div>') +
      (inRace
        ? '<button class="btn primary" id="mResume" style="margin-top:10px">▶ Продолжить</button>' +
          '<button class="btn ghost" id="mRestart">🔁 Начать заново</button>' +
          '<button class="btn ghost" id="mMenu">🏠 В меню</button>'
        : '<button class="btn secondary" id="mClose" style="margin-top:10px">Готово</button>'),
      (c) => {
        for (const t of c.querySelectorAll('.toggle')) {
          t.onclick = () => {
            const k = t.dataset.k;
            settings[k] = !settings[k];
            t.classList.toggle('on', settings[k]);
            saveSettings();
            AU.init();
            if (k === 'music') AU.setMusic(settings.music);
            if (k === 'sfx') AU.setSfx(settings.sfx);
            if (k === 'voice' && !settings.voice && AND) AND.stopSpeak();
            if (k === 'lite') { settings.liteManual = true; saveSettings(); applyLite(); }
          };
        }
        const seg = c.querySelector('#mMode');
        if (seg) for (const b of seg.querySelectorAll('button')) {
          b.onclick = () => {
            settings.mode = b.dataset.m; saveSettings();
            for (const x of seg.querySelectorAll('button')) x.classList.toggle('on', x === b);
          };
        }
        const on = (id, fn) => { const el = c.querySelector(id); if (el) el.onclick = fn; };
        on('#mClose', closeModal);
        on('#mResume', resume);
        on('#mRestart', () => { closeModal(); state.paused = false; startRace(state.racers); });
        on('#mMenu', () => { closeModal(); toMenu(); });
      }
    );
  }

  function statsDialog() {
    const rows = Object.keys(stats).map((n) => ({ n, ...stats[n] })).sort((a, b) => b.wins - a.wins || b.podiums - a.podiums);
    const byName = {};
    for (const p of players) byName[p.name] = p;
    let html = '<h3>🏆 Таблица побед</h3>';
    if (!rows.length) html += '<p>Ещё не было ни одного заезда.<br>Самое время начать!</p>';
    for (const r of rows) {
      const p = byName[r.n];
      html += '<div class="stat-row"><div class="sa" style="--c:' + (p ? p.color : '#ccc') + ';background-image:url(' + (p ? p.src : '') + ')"></div>' +
        '<div class="sn">' + esc(r.n) + '<div class="sm">заездов: ' + r.races + ' · в тройке: ' + r.podiums + '</div></div>' +
        '<div class="sw">' + r.wins + ' 🥇</div></div>';
    }
    html += '<button class="btn secondary" id="mClose" style="margin-top:12px">Закрыть</button>';
    if (rows.length) html += '<button class="btn ghost" id="mReset">Сбросить статистику</button>';
    modal(html, (c) => {
      c.querySelector('#mClose').onclick = closeModal;
      const rs = c.querySelector('#mReset');
      if (rs) rs.onclick = () => { stats = {}; store.set('stats', stats); closeModal(); toast('Статистика сброшена'); };
    });
  }

  // ---------------- комментатор ----------------
  const PH = {
    lead: ['{n} выходит вперёд!', '{n} — новый лидер!', '{n} обгоняет {p}!', 'Смена лидера! Впереди {n}!', '{n} вырывается в лидеры!', 'Вот это манёвр! {n} первым!'],
    rush: ['{n} делает мощный рывок!', '{n} прорывается вперёд!', 'Смотрите, как едет {n}!', '{n} обходит соперников!'],
    stumble: ['{n} теряет темп!', 'Ой! {n} уступает позицию!'],
    boost: ['{n} ловит ускорение!', 'Турбо для {n}!', '{n} летит на ускорителе!'],
    jump: ['{n} в полёте!', 'Какой прыжок у {n}!', '{n} взлетает на трамплине!'],
    peg: ['{n} задевает столбик!', 'Дзынь! {n} отскакивает!'],
    filler: ['Плотная борьба!', 'Все идут почти рядом!', 'Никто не хочет уступать!', 'Какая интрига!', 'Болельщики в восторге!', 'Расклад может поменяться в любой момент!'],
    last: ['{n} пока сзади, но всё ещё впереди!', '{n} готовит атаку из конца группы!'],
    rescue: ['🚀 {n} получает ракету-догонялку!', '🚀 Ракета для {n}! Догоняем!', '🚀 {n} возвращается в гонку!'],
  };
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  let cmT = 0, lastSay = 0, lastSpeak = 0;
  function say(text, opt) {
    opt = opt || {};
    const now = performance.now();
    if (!opt.force && now - lastSay < (opt.gap || 2600)) return false;
    lastSay = now;
    $('commentText').textContent = text;
    const c = $('comment');
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
    clearTimeout(cmT);
    cmT = setTimeout(() => c.classList.remove('show'), opt.dur || 3200);
    if (opt.speak && settings.voice && AND && (opt.force || now - lastSpeak > 3500)) {
      lastSpeak = now;
      AND.speak(text.replace(/[^\p{L}\p{N}\s!?,.\-—:]/gu, ''));
    }
    return true;
  }
  let bannerT = 0;
  function banner(html, dur) {
    const b = $('banner');
    b.innerHTML = html;
    b.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => b.classList.remove('show'), dur || 2200);
  }
  const nm = (id) => state.racers[id].name;
  const fill = (s, e) => s.replace('{n}', e.id != null ? nm(e.id) : '').replace('{p}', e.prev != null ? nm(e.prev) : 'соперника');

  function commentEvent(e) {
    const race = state.race;
    switch (e.type) {
      case 'lead': say(fill(pick(PH.lead), e), { speak: true }); break;
      case 'rush': if (Math.random() < 0.6) say(fill(pick(PH.rush), e), { speak: Math.random() < 0.4 }); break;
      case 'stumble': if (race.ranking[0] !== e.id) say(fill(pick(PH.stumble), e)); break;
      case 'boost': if (Math.random() < 0.18) say(fill(pick(PH.boost), e), { gap: 5000 }); break;
      case 'jump': if (Math.random() < 0.12) say(fill(pick(PH.jump), e), { gap: 5000 }); break;
      case 'rescue': say(fill(pick(PH.rescue), e), { gap: 3500, speak: Math.random() < 0.3 }); break;
      case 'peg': if (Math.random() < 0.06) say(fill(pick(PH.peg), e), { gap: 6000 }); break;
      case 'section': {
        const th = FR.THEMES[e.theme];
        banner('<small>Этап ' + (e.theme + 1) + ' из 6</small>' + th.emoji + ' ' + th.name, 2600);
        say('Этап ' + (e.theme + 1) + ': ' + th.name + '!', { force: true, speak: true });
        AU.whoosh();
        break;
      }
      case 'half': say('Половина дистанции позади!', { force: true, speak: true }); break;
      case 'minute': say('Осталась последняя минута!', { force: true, speak: true }); banner('<small>осталось</small>1 минута', 2000); break;
      case 'straight': say('Финишная прямая! Кто же победит?!', { force: true, speak: true }); break;
      case 'finish':
        if (e.place === 0) {
          const photo = race.photoFinish;
          say((photo ? 'Фотофиниш! ' : '') + nm(e.id) + ' побеждает!!!', { force: true, speak: true, dur: 6000 });
          AU.cheer();
          if (AND) AND.vibrate(400);
        }
        break;
    }
  }

  // ---------------- гонка ----------------
  const state = { mode: 'menu', race: null, racers: null, paused: false, acc: 0, ts: 1, slowHold: 0, endTimer: 0 };
  const renderer = new FR.Renderer($('game'));
  renderer.tv = IS_TV;
  function applyLite() {
    document.body.classList.toggle('lite', !!settings.lite);
    renderer.setLite(settings.lite);
    AU.lite = !!settings.lite;
  }
  applyLite();
  // Автоопределение: если кадров мало — включаем облегчённую графику
  const perf = { sum: 0, n: 0 };
  function watchPerf(realDt) {
    if (settings.lite || settings.liteManual || state.mode !== 'race' || state.paused) { perf.sum = perf.n = 0; return; }
    perf.sum += realDt; perf.n++;
    if (perf.sum > 4) {
      const fps = perf.n / perf.sum;
      perf.sum = perf.n = 0;
      if (fps < 32) {
        settings.lite = true; saveSettings(); applyLite();
        toast('⚡ Включена облегчённая графика');
      }
    }
  }
  const warp = +Q.get('warp') || 1;

  function durationFor() {
    if (Q.get('dur')) return +Q.get('dur');
    if (settings.mode === 'quick') return 55 + FR.secureInt(16);
    if (settings.mode === 'mid') return 170 + FR.secureInt(21);
    return null; // 5:00–5:45
  }

  function startRace(list) {
    AU.init();
    closeModal();
    const racers = list.map((p) => ({
      name: p.name, color: p.color, src: p.src,
      face: FR.Sprites.face(p.img, p.color), ring: FR.Sprites.ring(p.color),
    }));
    FR.Sprites.build();
    state.racers = racers;
    state.list = list;
    const race = (state.race = new FR.Race(racers, { duration: durationFor() }));
    renderer.setRace(race, racers);
    renderer.focus = null;
    renderer.slowmo = 0;
    state.paused = false;
    state.acc = 0; state.ts = 1; state.slowHold = 0; state.endTimer = 0; state.winnerShown = false;
    state.lastFill = performance.now();
    buildStandings();
    $('slowmo').classList.remove('show');
    $('comment').classList.remove('show');
    show('countdown');
    state.mode = 'countdown';
    AU.startAmbient();
    AU.setIntensity(0);
    if (settings.music) AU.startMusic();
    countdown();
  }

  function countdown() {
    const lights = document.querySelectorAll('.lights i');
    lights.forEach((l) => (l.className = ''));
    $('countdown').querySelector('.lights').style.display = '';
    const txt = $('cdText');
    let n = 0;
    const tick = () => {
      if (state.mode !== 'countdown') return;
      if (n < 3) {
        lights[n].className = 'red';
        txt.className = 'cd-text';
        txt.textContent = String(3 - n);
        void txt.offsetWidth;
        txt.className = 'cd-text pop';
        AU.beep(false);
        n++;
        setTimeout(tick, Q.get('fast') ? 100 : 1000);
      } else {
        lights.forEach((l) => (l.className = 'green'));
        txt.textContent = 'ПОЕХАЛИ!';
        txt.className = 'cd-text go pop';
        AU.beep(true);
        state.mode = 'race';
        const th = FR.THEMES[0];
        setTimeout(() => say('Этап 1 из 6: ' + th.name + '! Гонка началась!', { force: true, speak: true }), 600);
        setTimeout(() => {
          txt.textContent = '';
          $('countdown').querySelector('.lights').style.display = 'none';
        }, 1100);
      }
    };
    setTimeout(tick, 500);
  }

  function buildStandings() {
    const box = $('standings');
    box.innerHTML = '';
    const N = state.racers.length;
    const avail = G.innerHeight - 200;
    const ih = Math.max(26, Math.min(50, Math.floor(avail / N)));
    state.itemH = ih;
    state.stEls = state.racers.map((r) => {
      const el = document.createElement('div');
      el.className = 'st-item';
      el.style.setProperty('--sz', ih - 6 + 'px');
      el.innerHTML = '<span class="rank"></span><div class="sav" style="--c:' + r.color + ';background-image:url(' + r.src + ')"></div>';
      box.appendChild(el);
      return el;
    });
  }

  let hudT = 0;
  function updateHud(force) {
    const now = performance.now();
    if (!force && now - hudT < 120) return;
    hudT = now;
    const race = state.race;
    $('hudTime').textContent = FR.fmtTime(race.winnerDone ? race.winnerTime : race.t);
    const lead = race.marbles[race.ranking[0]];
    const th = FR.THEMES[race.track.themeAt(lead.s)];
    $('hudStage').textContent = th.emoji + ' ' + th.name + ' · ' + (race.track.themeAt(lead.s) + 1) + '/6';
    const pct = (race.progress * 100).toFixed(1) + '%';
    $('hudBar').style.width = pct;
    const tip = $('hudTip');
    tip.style.left = pct;
    tip.style.backgroundImage = 'url(' + state.racers[race.ranking[0]].src + ')';
    race.ranking.forEach((id, r) => {
      const el = state.stEls[id];
      el.style.transform = 'translateY(' + r * state.itemH + 'px)';
      el.querySelector('.rank').textContent = r + 1;
      el.classList.toggle('first', r === 0);
      el.classList.toggle('fin', race.marbles[id].finished);
      el.style.zIndex = 100 - r;
    });
  }

  function handleEvents() {
    const race = state.race;
    for (const e of race.events) {
      renderer.fx(e);
      if (state.mode === 'race') commentEvent(e);
      switch (e.type) {
        case 'clack': AU.clack(e.power); break;
        case 'rail': AU.rail(e.power); break;
        case 'peg': AU.peg(); break;
        case 'boost': AU.boost(); break;
        case 'rescue': AU.boost(); break;
        case 'jump': AU.jump(); break;
        case 'land': AU.land(e.power); break;
      }
    }
    race.events.length = 0;
  }

  function simulate(realDt) {
    const race = state.race, tr = race.track;
    const lead = race.marbles[race.ranking[0]];
    const dist = tr.finish - lead.s;
    let want = 1;
    if (!race.winnerDone && dist < 3.4 * FR.D && dist > -FR.D) want = 0.28;
    if (race.winnerDone && state.slowHold < 1.5) { want = 0.28; state.slowHold += realDt; }
    state.ts += (want - state.ts) * (1 - Math.exp(-realDt * 6));
    renderer.slowmo = FR.clamp((1 - state.ts) / 0.72, 0, 1);
    $('slowmo').classList.toggle('show', renderer.slowmo > 0.5 && race.closeFinish && !race.winnerDone);
    if (renderer.slowmo > 0.3 && !race.winnerDone) {
      const p = tr.pos(tr.finish - 20, 0, {});
      renderer.focus = { x: p.x, y: p.y + 40, z: 1.45 };
    } else if (race.winnerDone) {
      const w = race.marbles[race.results[0]];
      renderer.focus = { x: w.x, y: w.y, z: 1.6 };
    }

    // шаг симуляции точно равен времени кадра (делится на подшаги ≤ 1/60 с) —
    // движение без рывков при любой частоте кадров
    let sim = 0;
    if (warp > 1) {
      const dt = 1 / 60;
      state.acc += realDt * state.ts * warp;
      while (state.acc >= dt) { race.step(dt); handleEvents(); state.acc -= dt; sim += dt; }
    } else {
      const total = realDt * state.ts;
      const n = Math.max(1, Math.ceil(total * 60 - 1e-6));
      const dt = total / n;
      for (let i = 0; i < n; i++) { race.step(dt); handleEvents(); sim += dt; }
    }

    // атмосфера
    let vs = 0;
    for (const m of race.marbles) vs += m.v;
    vs /= race.N * race.v0;
    const theme = FR.THEMES[tr.themeAt(lead.s)];
    const crowd = theme.stadium ? 0.4 + 0.6 * FR.clamp(1 - dist / 2500, 0, 1) : 0;
    AU.setAmbient(vs * state.ts, theme.ice, race.winnerDone ? 1 : crowd);
    AU.setIntensity(race.t > race.T - 45 ? 1 : 0);

    // реплики-заполнители
    const now = performance.now();
    if (now - lastSay > 11000 && !race.winnerDone) {
      if (Math.random() < 0.5) say(pick(PH.filler));
      else say(fill(pick(PH.last), { id: race.ranking[race.N - 1] }));
    }

    if (race.winnerDone) {
      state.endTimer += realDt;
      if ((state.endTimer > 4.2 && race.allDone) || state.endTimer > 9) { if (!state.winnerShown) showResults(); }
    }
    return sim;
  }

  function showResults() {
    const race = state.race;
    state.winnerShown = true;
    state.mode = 'results';
    // порядок: финишировавшие + остальные по дистанции
    const order = race.ranking.slice();
    const winner = state.racers[order[0]];
    // статистика
    order.forEach((id, place) => {
      const n = state.racers[id].name;
      const s = (stats[n] = stats[n] || { wins: 0, races: 0, podiums: 0 });
      s.races++;
      if (place === 0) s.wins++;
      if (place < 3) s.podiums++;
    });
    store.set('stats', stats);

    $('winnerName').textContent = winner.name;
    const pods = { 1: '.p1', 2: '.p2', 3: '.p3' };
    for (let k = 1; k <= 3; k++) {
      const el = document.querySelector(pods[k]);
      const id = order[k - 1];
      if (id == null) { el.classList.add('empty-slot'); continue; }
      el.classList.remove('empty-slot');
      const r = state.racers[id];
      el.querySelector('.pav').style.backgroundImage = 'url(' + r.src + ')';
      el.querySelector('.pname').textContent = r.name;
      const b = el.querySelector('.block');
      b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    }
    let html = '';
    order.forEach((id, i) => {
      const r = state.racers[id], m = race.marbles[id];
      const gap = i === 0 ? FR.fmtTime(race.winnerTime) : m.finished ? '+' + (m.finishTime - race.winnerTime).toFixed(2) + ' с' : '';
      html += '<div class="res-row"><span class="rn">' + (i + 1) + '</span><div class="ra" style="--c:' + r.color + ';background-image:url(' + r.src + ')"></div><span class="rname">' + esc(r.name) + '</span><span class="rgap">' + gap + '</span></div>';
    });
    $('resList').innerHTML = html;
    show('results');
    setTimeout(() => $('btnAgain').focus(), 300);
    renderer.celebrating = true;
    renderer.burstScreen(90);
    AU.fanfare();
    AU.setAmbient(0, false, 0.6);
    if (settings.voice && AND) setTimeout(() => AND.speak('Поздравляем! Побеждает ' + winner.name + '!'), 700);
  }

  function toMenu() {
    state.mode = 'menu';
    state.paused = false;
    renderer.celebrating = false;
    AU.stopMusic();
    AU.stopAmbient();
    if (AND) AND.stopSpeak();
    show('menu');
    requestPlayers();
    setTimeout(() => $('btnStart').focus(), 200);
  }

  function pause() {
    if (state.mode !== 'race' && state.mode !== 'countdown') return;
    state.paused = true;
    if (AU.ctx) AU.ctx.suspend();
    settingsDialog(true);
  }
  function resume() {
    closeModal();
    state.paused = false;
    if (AU.ctx) AU.ctx.resume();
  }

  // ---------------- главный цикл ----------------
  let lastTs = 0, frameNo = 0;
  const pace = { sum: 0, n: 0, lock30: false };
  function frame(ts) {
    frameNo++;
    // Ровные 30 кадров/с лучше, чем «плавающие» 40–50: на слабом ТВ включаем фиксированный темп
    if (pace.lock30 && (frameNo & 1)) { requestAnimationFrame(frame); return; }
    const rawDt = lastTs ? (ts - lastTs) / 1000 : 0.016;
    const realDt = Math.min(0.05, pace.lock30 ? Math.round(rawDt * 30) / 30 || 1 / 30 : rawDt);
    lastTs = ts;
    if (settings.lite && !pace.lock30 && state.mode === 'race' && !state.paused) {
      pace.sum += rawDt; pace.n++;
      if (pace.sum > 3) {
        if (pace.n / pace.sum < 50) pace.lock30 = true;
        pace.sum = pace.n = 0;
      }
    }
    watchPerf(realDt);
    if (state.race && state.mode !== 'menu') {
      let sim = 0;
      if (!state.paused) {
        if (state.mode === 'race') sim = simulate(realDt);
        else if (state.mode === 'results') {
          state.race.step(realDt);
          handleEvents();
          sim = realDt;
          const w = state.race.marbles[state.race.results[0]];
          if (w) renderer.focus = { x: w.x, y: w.y + 60, z: 1.25 };
        }
        renderer.update(sim, realDt);
      }
      renderer.render();
      if (state.mode === 'race' || state.mode === 'countdown') updateHud();
    }
    requestAnimationFrame(frame);
  }

  // ---------------- кнопки ----------------
  $('btnStart').onclick = () => {
    const list = activePlayers();
    if (list.length < 2) { toast('Нужно минимум 2 игрока'); return; }
    startRace(list);
  };
  $('btnAdd').onclick = () => { AU.init(); addPlayerDialog(); };
  $('btnRefresh').onclick = () => { requestPlayers(); toast('Список обновлён'); };
  $('btnAccess').onclick = () => AND && AND.requestAccess();
  $('btnStats').onclick = statsDialog;
  $('btnSettings').onclick = () => settingsDialog(false);
  $('btnPause').onclick = pause;
  $('btnAgain').onclick = () => startRace(state.list);
  $('btnToMenu').onclick = toMenu;

  G.onBack = function () {
    if (!$('modal').classList.contains('hidden')) {
      if (state.paused) resume(); else closeModal();
      return true;
    }
    if (state.mode === 'race' || state.mode === 'countdown') { pause(); return true; }
    if (state.mode === 'results') { toMenu(); return true; }
    return false;
  };
  G.onAppPause = function () {
    if (state.mode === 'race' || state.mode === 'countdown') { if (!state.paused) pause(); }
    else if (AU.ctx) AU.ctx.suspend();
  };
  G.onAppResume = function () {
    if (!state.paused && AU.ctx) AU.ctx.resume();
    if (state.mode === 'menu') requestPlayers();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !AND) G.onAppPause();
  });

  // ---------------- старт ----------------
  FR.Sprites.build();
  if (AND && AND.isTv && AND.isTv()) document.body.classList.add('tv');
  requestPlayers();
  setTimeout(() => $('btnStart').focus(), 400);
  // Пульт: «ОК» в паузе/модалке, кнопка меню на пульте = пауза
  document.addEventListener('keydown', (e) => {
    if ((e.keyCode === 82 || e.key === 'ContextMenu' || e.key === 'MediaPlayPause' || e.keyCode === 85) &&
        (state.mode === 'race' || state.mode === 'countdown')) {
      e.preventDefault();
      if (state.paused) resume(); else pause();
    }
  });
  requestAnimationFrame(frame);

  // Режимы для проверки в браузере: ?auto=1&seek=300&warp=10
  if (Q.get('auto')) {
    const go = () => {
      if (!players.length) return setTimeout(go, 100);
      startRace(activePlayers());
      const seek = +Q.get('seek') || 0;
      if (seek) {
        state.mode = 'race';
        const race = state.race;
        while (race.t < seek && !race.winnerDone) { race.step(1 / 60); race.events.length = 0; }
        for (let i = 0; i < 60; i++) renderer.updateCamera(0.1);
        $('countdown').querySelector('.lights').style.display = 'none';
        $('cdText').textContent = '';
      }
    };
    go();
  }
  FR.App = { state, renderer, startRace, showResults };
})(window);
