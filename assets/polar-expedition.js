(() => {
  'use strict';

  const instances = new WeakMap();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const damp = (from, to, speed, dt) => lerp(from, to, 1 - Math.exp(-speed * dt));
  const hash = value => { const n = Math.sin(value * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  const REGIONS = [
    { name: '푸른 만', at: 0, sky: '#67c8ee', water: '#3998c0', light: '#f3fcff', accent: '#118bb9' },
    { name: '빙하 평원', at: 350, sky: '#75c9e7', water: '#3286ba', light: '#f5ffff', accent: '#4c8bd5' },
    { name: '수정 협곡', at: 800, sky: '#93b5e7', water: '#3b77aa', light: '#f3f7ff', accent: '#8c78ce' },
    { name: '오로라 해안', at: 1400, sky: '#487ba9', water: '#2c6e94', light: '#e5f6ff', accent: '#55c8ba' }
  ];
  const SUBJECTS = {
    civil: { label: '민사', color: '#af624a', flag: '#f27a53' },
    criminal: { label: '형사', color: '#7656a2', flag: '#a783df' },
    public: { label: '공법', color: '#267875', flag: '#53bda8' }
  };
  const CAMERA = 28, PLAYER_Z = 8, FAR = 360, MAX_LIVES = 3;

  function mount(options = {}) {
    const root = options.root;
    if (!root?.querySelector) throw new TypeError('A polar game panel is required.');
    if (instances.has(root)) return instances.get(root);
    const stage = root.querySelector('#polarStage');
    if (!stage) throw new TypeError('The polar stage is required.');
    let canvas = stage.querySelector('#polarCanvas');
    if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'polarCanvas'; stage.prepend(canvas); }
    canvas.setAttribute('aria-hidden', 'true'); canvas.style.touchAction = 'none';
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) { root.querySelector('#polarFeed').textContent = '화면을 준비하지 못했습니다. 다시 열어 주세요.'; return null; }
    const backdrop = document.createElement('canvas'), bg = backdrop.getContext('2d', { alpha: false });
    const el = id => root.querySelector('#' + id);
    const fields = {
      score: el('polarScore'), time: el('polarTime'), lives: el('polarLives'), combo: el('polarCombo'),
      feed: el('polarFeed'), region: el('polarRegion'), distance: el('polarDistance'), fish: el('polarFish'),
      best: el('polarBest'), overlay: el('polarOverlay'), title: el('polarOverlayTitle'), text: el('polarOverlayText'),
      pause: el('polarPause'), sound: el('polarSound'), start: el('polarStart'), stop: el('polarStop'), progress: el('polarProgress')
    };
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motion.matches, width = 0, height = 0, dpr = 1, raf = 0, previousTime = 0, destroyed = false;
    let pointer = null, words = [], audio = null, sound = false, hudAge = 1, lastRegion = -1;
    let frameCount = 0, fps = 60, drawMs = 0;
    let bestScore = 0;
    try { bestScore = Math.max(0, Number(localStorage.getItem('lawinus_polar_best_v1')) || 0); } catch (_) {}
    const removers = [];
    const on = (target, event, handler, settings) => { if (target) { target.addEventListener(event, handler, settings); removers.push(() => target.removeEventListener(event, handler, settings)); } };
    const visible = () => !document.hidden && !root.hidden && root.getClientRects().length > 0 && (!options.isVisible || options.isVisible(root));
    const fresh = () => ({
      phase: 'ready', elapsed: 0, duration: 60, distance: 0, speed: 24, lane: 0, x: 0, lean: 0,
      jump: 0, velocity: 0, step: 0, lives: MAX_LIVES, score: 0, bonus: 0, fish: 0, flags: 0,
      combo: 0, maxCombo: 0, invulnerable: 0, flash: 0, shake: 0, region: 0,
      nextRow: 100, objects: [], particles: [], floats: [], footprint: 0, saved: false, pauseReason: ''
    });
    let state = fresh();

    function subject(value) {
      if (/형|criminal/i.test(value || '')) return 'criminal';
      if (/헌|행정|공법|public/i.test(value || '')) return 'public';
      return 'civil';
    }
    function readWords() {
      let values;
      try { values = options.getWords?.(); } catch (_) { values = []; }
      const seen = new Set();
      words = (Array.isArray(values) ? values : []).map(item => ({
        text: String(typeof item === 'string' ? item : item?.text || '').replace(/\s+/gu, ' ').trim(),
        subject: subject(typeof item === 'string' ? '' : item?.subject)
      })).filter(item => { if (!item.text || seen.has(item.text)) return false; seen.add(item.text); return true; });
    }
    const message = text => { if (fields.feed) fields.feed.textContent = text; };
    const setText = (element, value) => { if (element && element.textContent !== String(value)) element.textContent = value; };

    function syncHud(force = false) {
      if (!force && hudAge < .09) return;
      hudAge = 0;
      setText(fields.score, Math.floor(state.score).toLocaleString('ko-KR'));
      setText(fields.time, Math.max(0, Math.ceil(state.duration - state.elapsed)));
      setText(fields.lives, state.lives); setText(fields.combo, state.combo);
      setText(fields.region, REGIONS[state.region].name); setText(fields.distance, Math.floor(state.distance));
      setText(fields.fish, state.fish); setText(fields.best, Math.max(bestScore, Math.floor(state.score)).toLocaleString('ko-KR'));
      if (fields.progress) fields.progress.style.width = Math.min(100, state.elapsed / state.duration * 100) + '%';
      stage.dataset.state = state.phase;
      if (fields.start) {
        fields.start.disabled = ['running', 'paused'].includes(state.phase);
        fields.start.textContent = state.phase === 'finished' ? '다시 탐험' : '탐험 시작';
      }
      if (fields.pause) {
        fields.pause.disabled = !['running', 'paused'].includes(state.phase);
        fields.pause.textContent = state.phase === 'paused' ? '계속하기' : '일시정지';
        fields.pause.setAttribute('aria-label', state.phase === 'paused' ? '남극 탐험 계속하기' : '남극 탐험 일시정지');
      }
      if (fields.stop) fields.stop.disabled = !['running', 'paused'].includes(state.phase);
      root.querySelectorAll('[data-polar-action]').forEach(button => {
        const action = button.dataset.polarAction;
        if (['left', 'right', 'jump'].includes(action)) button.disabled = state.phase !== 'running';
        if (button.closest('#polarOverlay')) {
          button.hidden = action === 'resume' ? state.phase !== 'paused' : action === 'start' ? state.phase !== 'ready' : action === 'restart' ? state.phase !== 'finished' : false;
        }
      });
      if (fields.overlay) fields.overlay.hidden = state.phase === 'running';
    }
    function overlay(title, text) { setText(fields.title, title); setText(fields.text, text); syncHud(true); }
    function requestFrame() { if (!raf && !destroyed && state.phase === 'running' && visible()) raf = requestAnimationFrame(frame); }
    function focusStage() { stage.focus({ preventScroll: true }); }

    function start() {
      if (destroyed || !visible()) return false;
      cancelAnimationFrame(raf); raf = 0; previousTime = 0;
      state = fresh(); state.phase = 'running';
      if (sound && audio?.state === 'suspended') audio.resume().catch(() => {});
      state.duration = clamp(Number(el('polarDuration')?.value) || 60, 15, 600);
      readWords(); seedCourse(); lastRegion = -1; rebuildBackdrop();
      message('푸른 만에서 출발! 깃발과 물고기를 모으고 얼음과 갈라진 길을 피하세요.');
      syncHud(true); focusStage(); requestFrame(); return true;
    }
    function pause(reason = 'manual') {
      if (state.phase !== 'running') return false;
      state.phase = 'paused'; state.pauseReason = reason;
      cancelAnimationFrame(raf); raf = 0; previousTime = 0;
      if (audio?.state === 'running') audio.suspend().catch(() => {});
      overlay('잠깐, 숨 고르기', reason === 'hidden' ? '준비되면 탐험을 계속하세요.' : '같은 자리에서 이어 달릴 수 있어요.');
      message('탐험을 잠시 멈췄어요. 계속하기를 누르면 이어집니다.'); render(); return true;
    }
    function resume() {
      if (state.phase !== 'paused' || !visible()) return false;
      state.phase = 'running'; state.pauseReason = ''; previousTime = 0;
      if (sound && audio?.state === 'suspended') audio.resume().catch(() => {});
      message('다시 출발! 앞에 놓인 길을 살펴보세요.'); syncHud(true); focusStage(); requestFrame(); return true;
    }
    function finish(reason = 'stop') {
      if (!['running', 'paused'].includes(state.phase)) return false;
      state.score = state.bonus + state.distance * .22;
      bestScore = Math.max(bestScore, Math.floor(state.score));
      try { localStorage.setItem('lawinus_polar_best_v1', String(bestScore)); } catch (_) {}
      state.phase = 'finished'; cancelAnimationFrame(raf); raf = 0; previousTime = 0;
      const meters = Math.floor(state.distance), title = reason === 'time' ? '남극 탐험 완료!' : reason === 'collision' ? '다음 길에서 다시 만나요' : '탐험을 마쳤어요';
      const summary = `${REGIONS[state.region].name} · ${meters} m · 물고기 ${state.fish}마리 · 깃발 ${state.flags}개`;
      message(summary); overlay(title, summary); render();
      if (!state.saved) {
        state.saved = true;
        try { Promise.resolve(options.saveScore?.(Math.floor(state.score), `${REGIONS[state.region].name} · ${meters}m · 물고기 ${state.fish} · 깃발 ${state.flags} · 최고콤보 ${state.maxCombo}`)).catch(() => {}); } catch (_) {}
      }
      return true;
    }
    function move(direction) { if (state.phase === 'running') state.lane = clamp(state.lane + direction, -1, 1); }
    function jump() {
      if (state.phase !== 'running' || state.jump > .015 || state.velocity > 0) return false;
      state.velocity = 8.5; tone(390, .075, 'sine', .028); return true;
    }
    function setSound(enabled) {
      sound = !!enabled;
      if (sound) {
        try { const Audio = window.AudioContext || window.webkitAudioContext; if (!audio && Audio) audio = new Audio(); audio?.resume().catch(() => {}); } catch (_) { sound = false; }
      } else if (audio?.state === 'running') audio.suspend().catch(() => {});
      if (fields.sound) { fields.sound.setAttribute('aria-pressed', String(sound)); fields.sound.setAttribute('aria-label', sound ? '효과음 끄기' : '효과음 켜기'); fields.sound.textContent = sound ? '소리 끄기' : '소리 켜기'; }
      return sound;
    }
    function tone(frequency, duration = .11, shape = 'sine', gain = .035) {
      if (!sound || audio?.state !== 'running') return;
      const oscillator = audio.createOscillator(), volume = audio.createGain(), now = audio.currentTime;
      oscillator.type = shape; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(frequency * .76, now + duration);
      volume.gain.setValueAtTime(gain, now); volume.gain.exponentialRampToValueAtTime(.001, now + duration);
      oscillator.connect(volume); volume.connect(audio.destination); oscillator.start(now); oscillator.stop(now + duration);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    }

    let objectId = 0;
    function object(kind, lane, world, extra = {}) { return { id: ++objectId, kind, lane, world, ...extra }; }
    function flag(lane, world) { const word = words[Math.floor(random() * words.length) % words.length]; return object('flag', lane, world, word); }
    function seedCourse() {
      state.objects = [object('fish', 0, 55), object('fish', 0, 67), ...(words.length ? [flag(0, 87)] : []), object('ice', 1, 128), object('fish', -1, 133), ...(words.length ? [flag(-1, 153)] : []), object('seal', -1, 193)];
      state.nextRow = 224;
      while (state.nextRow < FAR) spawnRow();
    }
    function spawnRow() {
      const world = state.nextRow, lane = Math.floor(random() * 3) - 1;
      if (words.length && random() < .45) {
        state.objects.push(flag(lane, world), object('fish', lane, world - 13));
        if (random() < .55) state.objects.push(object('fish', lane, world + 11));
      } else {
        const kind = ['seal', 'ice', 'crack'][Math.floor(random() * 3)];
        state.objects.push(object(kind, lane, world));
        const safe = lane === 0 ? (random() < .5 ? -1 : 1) : 0;
        state.objects.push(object('fish', safe, world), object('fish', safe, world + 12));
        if (state.distance > 800 && random() < .28) state.objects.push(object('ice', lane === -1 ? 1 : -1, world));
      }
      state.nextRow += 34 + random() * 17;
    }
    function burst(x, y, color, amount = 14) {
      const count = reduced ? Math.min(amount, 5) : amount;
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2, speed = 28 + random() * 100;
        state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: .45 + random() * .4, max: .85, size: 2 + random() * 3, color });
      }
      if (state.particles.length > 110) state.particles.splice(0, state.particles.length - 110);
    }
    function floating(text, x, y, color) { state.floats.push({ text, x, y, color, life: 1 }); if (state.floats.length > 6) state.floats.shift(); }
    function collect(item) {
      const p = project(item.lane, PLAYER_Z);
      if (item.kind === 'fish') {
        state.fish++; state.bonus += 10; burst(p.x, p.y - 25, '#ffcf65', 8); floating('+10', p.x, p.y - 55, '#9b5e0d'); tone(680, .07);
        if (state.fish % 12 === 0 && state.lives < MAX_LIVES) { state.lives++; message('물고기 12마리! 체력을 한 칸 회복했어요.'); }
      } else {
        state.flags++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo);
        const add = 35 + Math.min(12, state.combo) * 5; state.bonus += add;
        burst(p.x, p.y - 45, SUBJECTS[item.subject].flag); floating('+' + add, p.x, p.y - 95, SUBJECTS[item.subject].color);
        message(`${SUBJECTS[item.subject].label} 깃발 · ${item.text} · ${state.combo}연속!`); tone(840 + Math.min(state.combo, 8) * 55, .12);
      }
    }
    function collide(item) {
      const threshold = item.kind === 'crack' ? .65 : item.kind === 'seal' ? 1 : .92;
      if (state.jump >= threshold) { state.bonus += 12; return; }
      if (state.invulnerable > 0) return;
      state.lives--; state.combo = 0; state.invulnerable = 1.8; state.flash = .24; state.shake = reduced ? 0 : .32;
      const p = project(state.x, PLAYER_Z); burst(p.x, p.y - 35, '#e4faff', 20); tone(145, .16, 'triangle', .055);
      message(item.kind === 'crack' ? '얼음 틈에 주의! 점프로 건너거나 옆길로 피하세요.' : item.kind === 'seal' ? '바다표범이 쉬고 있어요. 옆길로 비켜 달려 보세요.' : '얼음에 부딪혔어요. 옆으로 피하거나 점프해 보세요.');
      if (state.lives <= 0) finish('collision');
    }
    function update(dt) {
      state.elapsed += dt; hudAge += dt;
      state.speed = Math.min(38, 24 + state.distance / 150);
      state.distance += state.speed * dt; state.score = state.bonus + state.distance * .22;
      state.x = damp(state.x, state.lane, 13.5, dt); state.lean = damp(state.lean, clamp((state.lane - state.x) * .5, -.27, .27), 11, dt);
      state.step += dt * (9 + state.speed * .09);
      state.velocity -= 23 * dt; state.jump = Math.max(0, state.jump + state.velocity * dt);
      if (state.jump === 0) state.velocity = 0;
      state.invulnerable = Math.max(0, state.invulnerable - dt); state.flash = Math.max(0, state.flash - dt); state.shake = Math.max(0, state.shake - dt);
      const region = REGIONS.reduce((found, region, index) => state.distance >= region.at ? index : found, 0);
      if (region !== state.region) { state.region = region; rebuildBackdrop(); floating(REGIONS[region].name, width / 2, height * .3, '#163f5c'); message(REGIONS[region].name + '에 도착했어요!'); }
      while (state.nextRow < state.distance + FAR) spawnRow();
      for (const item of state.objects) {
        if (state.phase !== 'running') break;
        const z = item.world - state.distance;
        if (!item.checked && z <= PLAYER_Z && z > PLAYER_Z - state.speed * dt - 1.5) {
          item.checked = true;
          if (Math.abs(state.x - item.lane) < .48) {
            if (item.kind === 'flag' || item.kind === 'fish') { item.collected = true; collect(item); }
            else collide(item);
          }
        }
      }
      state.score = state.bonus + state.distance * .22;
      state.objects = state.objects.filter(item => item.world - state.distance > -12 && !item.collected);
      for (const particle of state.particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 150 * dt; }
      state.particles = state.particles.filter(particle => particle.life > 0);
      for (const float of state.floats) { float.life -= dt; float.y -= dt * 32; }
      state.floats = state.floats.filter(float => float.life > 0);
      state.footprint += dt;
      if (!reduced && state.jump < .05 && state.footprint > .12) { const p = project(state.x, PLAYER_Z); burst(p.x + Math.sin(state.step) * 14, p.y - 3, '#f4feff', 2); state.footprint = 0; }
      syncHud();
      if (state.elapsed >= state.duration && state.phase === 'running') finish('time');
    }

    function roadCurve(z) {
      const travel = state.distance, s = CAMERA / (CAMERA + z);
      const curve = value => Math.sin(value * .0021) * .45 + Math.sin(value * .00087 + 2) * .24;
      return width / 2 + (curve(travel + z) - curve(travel + PLAYER_Z)) * width * 1.32 * (1 - s) - state.x * width * .018;
    }
    function project(lane, z) {
      const scale = CAMERA / (CAMERA + Math.max(0, z));
      return { x: roadCurve(z) + lane * width * .218 * scale, y: height * .365 + height * .625 * scale, scale };
    }
    function polygon(points, color) { ctx.fillStyle = color; ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); }
    function ellipse(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
    function rounded(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }

    function rebuildBackdrop() {
      if (!width || !height) return;
      lastRegion = state.region; backdrop.width = Math.round(width * dpr); backdrop.height = Math.round(height * dpr); bg.setTransform(dpr, 0, 0, dpr, 0, 0);
      const region = REGIONS[state.region], horizon = height * .365;
      const sky = bg.createLinearGradient(0, 0, 0, horizon + 40); sky.addColorStop(0, region.sky); sky.addColorStop(1, '#e1f7fc'); bg.fillStyle = sky; bg.fillRect(0, 0, width, height);
      const sun = bg.createRadialGradient(width * .78, height * .135, 1, width * .78, height * .135, height * .18);
      sun.addColorStop(0, '#fffbeddf'); sun.addColorStop(.24, '#fffae27a'); sun.addColorStop(1, '#ffffff00'); bg.fillStyle = sun; bg.fillRect(width * .5, 0, width * .5, height * .38);
      bg.fillStyle = '#fffcea'; bg.beginPath(); bg.arc(width * .78, height * .135, height * .038, 0, Math.PI * 2); bg.fill();
      for (let i = 0; i < 6; i++) {
        const x = width * hash(i + 9), y = height * (.07 + hash(i + 33) * .12), size = width * (.08 + hash(i + 68) * .09);
        bg.fillStyle = '#f7fdff70'; bg.beginPath(); bg.ellipse(x, y, size, height * .012, -.1, 0, Math.PI * 2); bg.fill();
      }
      if (state.region === 3) {
        for (let i = 0; i < 3; i++) { bg.beginPath(); bg.moveTo(width * -.1, height * (.04 + i * .022)); bg.bezierCurveTo(width * .25, height * .22, width * .48, -height * .08, width * 1.08, height * (.09 + i * .035)); bg.strokeStyle = ['#b3f4dd65', '#b0d9fb45', '#e9d5f140'][i]; bg.lineWidth = height * .02; bg.stroke(); }
      }
      const mountains = [
        { y: .36, color: '#91bed2', peaks: [[-.1,.12],[.06,.22],[.2,.14],[.38,.21],[.55,.12],[.73,.2],[.92,.14],[1.1,.23]] },
        { y: .39, color: '#acd9e6', peaks: [[-.1,.23],[.12,.17],[.3,.25],[.48,.18],[.68,.24],[.9,.18],[1.1,.29]] }
      ];
      for (const layer of mountains) {
        const points = layer.peaks.map(([x,y])=>[x*width,y*height]); bg.beginPath(); bg.moveTo(-width*.1,height*layer.y); for (const p of points) bg.lineTo(...p); bg.lineTo(width*1.1,height*layer.y); bg.closePath(); bg.fillStyle=layer.color; bg.fill();
        for (let i=1;i<points.length-1;i++) {
          const [x,y]=points[i],left=points[i-1],right=points[i+1]; if (y>left[1]||y>right[1])continue;
          bg.beginPath();bg.moveTo(x,y);bg.lineTo(lerp(x,left[0],.55),lerp(y,left[1],.55));bg.lineTo(x-8,y+height*.045);bg.lineTo(x+width*.022,y+height*.026);bg.lineTo(lerp(x,right[0],.65),lerp(y,right[1],.65));bg.closePath();bg.fillStyle='#eefbff';bg.fill();
          bg.beginPath();bg.moveTo(x,y+2);bg.lineTo(x+width*.045,height*layer.y);bg.lineTo(x+width*.11,height*layer.y);bg.closePath();bg.fillStyle='#ffffff32';bg.fill();
        }
      }
      const sea=bg.createLinearGradient(0,horizon,0,height);sea.addColorStop(0,'#75bdd2');sea.addColorStop(.5,region.water);sea.addColorStop(1,'#126a91');bg.fillStyle=sea;bg.fillRect(0,horizon,width,height-horizon);
      for(let i=0;i<35;i++){const p=i/35,y=horizon+Math.pow(p,1.65)*(height-horizon);bg.strokeStyle=i%3===0?'#c8f6ff80':'#b0e9f23a';bg.lineWidth=.5+p;bg.beginPath();const x=hash(i+31)*width;bg.moveTo(x,y);bg.lineTo(x+width*(.025+p*.07),y);bg.stroke();}
      bg.fillStyle='#dff8ff';bg.beginPath();bg.moveTo(0,horizon+height*.014);bg.lineTo(width*.2,horizon+height*.009);bg.lineTo(width*.29,horizon+height*.032);bg.lineTo(width*.17,horizon+height*.046);bg.lineTo(0,horizon+height*.04);bg.closePath();bg.fill();
    }
    function drawTrack() {
      const region=REGIONS[state.region];
      for(let i=71;i>=0;i--){
        const near=i*5,far=(i+1)*5,a=project(0,near),b=project(0,far),aw=width*.46*a.scale,bw=width*.46*b.scale;
        polygon([[a.x-aw*1.27,a.y+height*.025*a.scale],[b.x-bw*1.27,b.y+height*.025*b.scale],[b.x+bw*1.27,b.y+height*.025*b.scale],[a.x+aw*1.27,a.y+height*.025*a.scale]],'#64b4d1');
        polygon([[a.x-aw*1.2,a.y],[b.x-bw*1.2,b.y],[b.x+bw*1.2,b.y],[a.x+aw*1.2,a.y]],i%2?'#d7f0f7':'#e1f7fc');
        const segment=Math.floor((state.distance+near)/9),snow=segment%2===0?region.light:'#e9f6fb';
        polygon([[a.x-aw,a.y],[b.x-bw,b.y],[b.x+bw,b.y],[a.x+aw,a.y]],snow);
        const edge=segment%4<2?'#b9e5f3':'#a4d8eb';
        polygon([[a.x-aw,a.y],[b.x-bw,b.y],[b.x-bw*.95,b.y],[a.x-aw*.95,a.y]],edge);
        polygon([[a.x+aw,a.y],[b.x+bw,b.y],[b.x+bw*.95,b.y],[a.x+aw*.95,a.y]],edge);
        if(segment%3!==0){
          for(const lane of [-.5,.5]){const ax=a.x+lane*width*.218*a.scale,bx=b.x+lane*width*.218*b.scale;polygon([[ax-1.1*a.scale,a.y],[bx-1.1*b.scale,b.y],[bx+1.1*b.scale,b.y],[ax+1.1*a.scale,a.y]],'#bedde8');}
        }
      }
      for(let i=0;i<15;i++){
        const z=(i*27+13-state.distance%27+405)%405;if(z<12||z>FAR)continue;
        for(const side of [-1,1]){const p=project(side*2.56,z),s=p.scale;iceberg(p.x,p.y,Math.max(8,width*.075*s),hash(i+side*11));}
      }
    }
    function iceberg(x,y,size,seed){
      ctx.save();ctx.translate(x,y);const h=size*(1.3+seed*.8);
      polygon([[-size,0],[-size*.7,-h*.65],[-size*.16,-h],[size*.55,-h*.79],[size,-h*.23],[size*.85,0]],'#b3e3f4');
      polygon([[-size*.7,-h*.65],[-size*.16,-h],[size*.1,-h*.27],[-size*.25,0],[-size,0]],'#e6fbff');
      polygon([[-size*.16,-h],[size*.55,-h*.79],[size*.1,-h*.27]],'#f4feff');
      polygon([[size*.1,-h*.27],[size*.55,-h*.79],[size,-h*.23],[size*.85,0],[-size*.25,0]],'#72c5e5');
      polygon([[size*.1,-h*.27],[size*.65,-h*.39],[size*.4,-h*.14]],'#a4e6f6');ctx.restore();
    }
    function fishSprite(x,y,scale,time){
      ctx.save();ctx.translate(x,y-20*scale+Math.sin(time*4)*3*scale);ctx.rotate(Math.sin(time*3)*.08);
      ellipse(0,0,19*scale,11*scale,'#f8b847');polygon([[-14*scale,0],[-28*scale,-12*scale],[-28*scale,12*scale]],'#efa447');
      ellipse(3*scale,-3*scale,10*scale,5*scale,'#ffe69b');ellipse(11*scale,-2*scale,2*scale,2*scale,'#5b5f70');
      ctx.strokeStyle='#e39436';ctx.lineWidth=2*scale;ctx.beginPath();ctx.moveTo(-4*scale,-6*scale);ctx.lineTo(-8*scale,2*scale);ctx.stroke();ctx.restore();
    }
    function drawFlag(item,p){
      const s=p.scale*1.13,colors=SUBJECTS[item.subject],w=clamp(28+item.text.length*13,105,225);
      const maxChars=Math.max(8,Math.ceil(item.text.length/Math.ceil(item.text.length/14))),lines=[];
      for(let at=0;at<item.text.length;at+=maxChars)lines.push(item.text.slice(at,at+maxChars));
      const font=Math.max(9,Math.min(15,195/maxChars)),h=Math.max(39,lines.length*(font+4)+14),top=Math.max(106,h+33);
      ctx.save();ctx.translate(p.x,p.y);ellipse(0,1,22*s,5*s,'#688da331');
      ctx.strokeStyle='#69899d';ctx.lineWidth=4*s;ctx.beginPath();ctx.moveTo(-w*.4*s,0);ctx.lineTo(-w*.4*s,-(top+4)*s);ctx.stroke();
      const wave=reduced?0:Math.sin(state.elapsed*5+item.world)*3;
      polygon([[-w*.4*s,-top*s],[(w*.6+wave)*s,-(top-4)*s],[(w*.6-4+wave)*s,-(top-4-h)*s],[-w*.4*s,-(top-h)*s]],colors.flag);
      ctx.fillStyle='#fff';ctx.font=`700 ${font*s}px system-ui,sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';
      lines.forEach((line,index)=>ctx.fillText(line,(-w*.4+10)*s,(-top+9+(index+.5)*(h-14)/lines.length)*s,(w-18)*s));
      ellipse(-w*.4*s,-(top+7)*s,4*s,4*s,'#f7e3a0');ctx.restore();
    }
    function drawObstacle(item,p){
      const s=p.scale*1.5;
      if(item.kind==='ice'){iceberg(p.x,p.y,37*s,.1);return;}
      ctx.save();ctx.translate(p.x,p.y);
      if(item.kind==='crack'){
        polygon([[-63*s,-4*s],[-36*s,-13*s],[-16*s,-7*s],[6*s,-18*s],[32*s,-8*s],[64*s,-12*s],[52*s,7*s],[26*s,9*s],[3*s,3*s],[-23*s,15*s],[-49*s,8*s]],'#81c4df');
        polygon([[-53*s,0],[-31*s,-4*s],[-14*s,1*s],[8*s,-7*s],[33*s,1*s],[54*s,-2*s],[29*s,7*s],[5*s,0],[-22*s,10*s]],'#245c82');
        ctx.strokeStyle='#eafcff';ctx.lineWidth=3*s;ctx.beginPath();ctx.moveTo(-63*s,-4*s);ctx.lineTo(-36*s,-13*s);ctx.lineTo(-16*s,-7*s);ctx.stroke();
      }else{
        ellipse(0,3*s,46*s,9*s,'#648da42d');
        const body=ctx.createLinearGradient(0,-44*s,0,0);body.addColorStop(0,'#91aebd');body.addColorStop(1,'#c6d8df');
        ellipse(-6*s,-22*s,42*s,23*s,body);ellipse(31*s,-31*s,20*s,22*s,'#b9cdd4');
        polygon([[-36*s,-14*s],[-61*s,-16*s],[-52*s,-3*s],[-34*s,-8*s]],'#7d9aab');
        ellipse(5*s,-7*s,21*s,7*s,'#8ba8b6');ellipse(40*s,-34*s,2.7*s,2.8*s,'#284c60');ellipse(48*s,-25*s,4*s,2.5*s,'#526f7d');
        ctx.strokeStyle='#557b8a';ctx.lineWidth=s;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(47*s,-23*s);ctx.lineTo(60*s,(-24+i*4)*s);ctx.stroke();}
        ellipse(28*s,-42*s,6*s,4*s,'#d4e6ec');
      }
      ctx.restore();
    }
    function penguin(){
      const p=project(state.x,PLAYER_Z),size=Math.min(height*.285,153)/140,bounce=state.jump>0?0:Math.abs(Math.sin(state.step))*3.2,air=state.jump*height*.115;
      ellipse(p.x,p.y+5,39*size*(1-state.jump*.13),10*size*(1-state.jump*.1),'#567d9c36');
      if(state.invulnerable>0){ctx.strokeStyle='#87d7efaa';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(p.x,p.y-62*size-air,50*size,77*size,0,0,Math.PI*2);ctx.stroke();}
      ctx.save();ctx.translate(p.x,p.y-air-bounce);ctx.rotate(state.lean);
      const stride=state.jump>0?.4:Math.sin(state.step)*(reduced?.42:1);
      for(const side of [-1,1]){
        ctx.save();ctx.translate(side*19*size,(-4+stride*side*7)*size);ctx.rotate(side*.12+stride*side*.3);
        ellipse(0,0,19*size,(7+Math.max(0,stride*side)*3)*size,'#ec9d3e');ellipse(4*size,-2*size,12*size,3*size,'#f9bd5c');ctx.restore();
      }
      const flipper=state.jump>0?.7:Math.sin(state.step+.8)*.17;
      for(const side of [-1,1]){ctx.save();ctx.translate(side*29*size,-69*size);ctx.rotate(side*(-.15-flipper));ellipse(side*4*size,17*size,10*size,34*size,'#193f58');ctx.restore();}
      const coat=ctx.createLinearGradient(-30*size,-115*size,35*size,-8*size);coat.addColorStop(0,'#315775');coat.addColorStop(.5,'#173d57');coat.addColorStop(1,'#102e45');
      ellipse(0,-53*size,35*size,48*size,coat);ellipse(0,-108*size,28*size,29*size,coat);
      ctx.save();ctx.beginPath();ctx.ellipse(0,-53*size,35*size,48*size,0,0,Math.PI*2);ctx.clip();
      ellipse(-30*size,-50*size,12*size,40*size,'#edf5f2');ellipse(31*size,-50*size,11*size,39*size,'#f9faf0');
      ctx.restore();ellipse(-13*size,-113*size,9*size,12*size,'#f6f8ed');ellipse(14*size,-113*size,9*size,12*size,'#f6f8ed');
      ellipse(-15*size,-116*size,3*size,4*size,'#173246');ellipse(17*size,-116*size,3*size,4*size,'#173246');
      ellipse(-14*size,-117*size,1*size,1.4*size,'#fff');ellipse(18*size,-117*size,1*size,1.4*size,'#fff');
      polygon([[20*size,-106*size],[35*size,-101*size],[21*size,-97*size]],'#ecab48');
      rounded(-28*size,-90*size,57*size,13*size,6*size,'#ed735c');rounded(-25*size,-87*size,48*size,4*size,2*size,'#ffb293');
      const tail=(reduced?1:Math.sin(state.elapsed*8))*5;
      polygon([[18*size,-83*size],[48*size,(-86+tail)*size],[67*size,(-76+tail)*size],[48*size,(-73+tail)*size],[23*size,-75*size]],'#db594d');
      polygon([[-8*size,-15*size],[0,-2*size],[10*size,-15*size]],'#102c41');
      ellipse(-9*size,-63*size,14*size,25*size,'#7392aa19');ctx.restore();
    }
    function render() {
      if(!width||!height)return;
      if(lastRegion!==state.region)rebuildBackdrop();
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.drawImage(backdrop,0,0,width,height);
      ctx.save();
      if(state.shake>0&&!reduced)ctx.translate(Math.sin(state.elapsed*70)*state.shake*9,Math.cos(state.elapsed*59)*state.shake*5);
      drawTrack();
      const things=state.objects.filter(item=>{const z=item.world-state.distance;return z>1&&z<FAR;}).sort((a,b)=>b.world-a.world);
      let playerDrawn=false;
      for(const item of things){const z=item.world-state.distance;if(!playerDrawn&&z<PLAYER_Z){penguin();playerDrawn=true;}const p=project(item.lane,z);if(item.kind==='fish')fishSprite(p.x,p.y,p.scale*1.4,state.elapsed+item.world);else if(item.kind==='flag')drawFlag(item,p);else drawObstacle(item,p);}
      if(!playerDrawn)penguin();
      for(const particle of state.particles){ctx.globalAlpha=clamp(particle.life/particle.max,0,1);ellipse(particle.x,particle.y,particle.size,particle.size*.7,particle.color);}ctx.globalAlpha=1;
      ctx.textAlign='center';ctx.textBaseline='middle';for(const float of state.floats){ctx.globalAlpha=Math.min(1,float.life*2);ctx.font=`800 ${float.text.length>8?20:23}px system-ui,sans-serif`;ctx.lineWidth=3;ctx.strokeStyle='#ffffffbb';ctx.strokeText(float.text,float.x,float.y);ctx.fillStyle=float.color;ctx.fillText(float.text,float.x,float.y);}ctx.globalAlpha=1;
      if(state.flash>0){ctx.fillStyle=`rgba(243,253,255,${state.flash*.7})`;ctx.fillRect(0,0,width,height);}
      ctx.restore();
      if(state.phase==='paused'){ctx.fillStyle='#244d6b22';ctx.fillRect(0,0,width,height);}
    }
    function frame(time) {
      raf=0;if(destroyed||state.phase!=='running')return;
      if(!visible()){pause('hidden');return;}
      const raw=previousTime?Math.max(0,(time-previousTime)/1000):1/60;previousTime=time;
      const dt=Math.min(.05,raw),before=performance.now();update(dt);if(state.phase==='running')render();
      frameCount++;fps=damp(fps,raw>0?Math.min(120,1/raw):60,3,dt);drawMs=damp(drawMs,performance.now()-before,4,dt);requestFrame();
    }
    function resize() {
      const bounds=stage.getBoundingClientRect();if(bounds.width<1||bounds.height<1)return;
      width=bounds.width;height=bounds.height;dpr=Math.min(devicePixelRatio||1,2,Math.sqrt(2500000/(width*height)));
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width='100%';canvas.style.height='100%';
      rebuildBackdrop();render();requestFrame();
    }
    function action(value) {
      if(value==='start'||value==='restart')start();
      else if(value==='pause')state.phase==='paused'?resume():pause();
      else if(value==='resume')resume();else if(value==='stop')finish();else if(value==='left')move(-1);else if(value==='right')move(1);else if(value==='jump')jump();
    }
    on(root,'click',event=>{
      const button=event.target.closest('button');if(!button||!root.contains(button))return;
      const command=button.dataset.polarAction||({polarStart:'start',polarStop:'stop',polarPause:'pause',polarSound:'sound'})[button.id];
      if(!command)return;if(command==='sound')setSound(!sound);else{action(command);if(['left','right','jump'].includes(command))focusStage();}syncHud(true);
    });
    on(root,'keydown',event=>{
      if(event.repeat||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||!visible())return;
      if(event.target.closest('input,textarea,select,button,[contenteditable="true"]'))return;
      if(options.keyAllowed&&!options.keyAllowed(event,root))return;
      const key=event.key.toLowerCase();let handled=true;
      if(key==='arrowleft'||key==='a')move(-1);else if(key==='arrowright'||key==='d')move(1);else if(['arrowup','w',' '].includes(key))jump();else if(key==='p'||key==='escape')state.phase==='paused'?resume():pause();else if(key==='enter'&&['ready','finished'].includes(state.phase))start();else handled=false;
      if(handled)event.preventDefault();
    });
    on(stage,'pointerdown',event=>{
      if(event.target.closest('button')||state.phase!=='running')return;
      pointer={x:event.clientX,y:event.clientY,id:event.pointerId};stage.setPointerCapture?.(event.pointerId);event.preventDefault();focusStage();
    });
    on(stage,'pointerup',event=>{
      if(!pointer||pointer.id!==event.pointerId)return;
      const start=pointer;pointer=null;const dx=event.clientX-start.x,dy=event.clientY-start.y;
      if(Math.abs(dx)>26&&Math.abs(dx)>Math.abs(dy))move(dx>0?1:-1);
      else if(dy< -24)jump();else{const bounds=stage.getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width;if(x<.34)move(-1);else if(x>.66)move(1);else jump();}
      event.preventDefault();syncHud(true);
    });
    on(stage,'pointercancel',()=>{pointer=null;});
    on(document,'visibilitychange',()=>{if(document.hidden)pause('hidden');});
    on(window,'blur',()=>pause('hidden'));
    on(document,'lawinus-game-mode-change',()=>{if(!visible())pause('hidden');else{resize();render();}});
    on(window,'resize',resize);
    on(motion,'change',event=>{reduced=event.matches;render();});
    const observer=new MutationObserver(()=>{if(!visible())pause('hidden');else{resize();render();}});
    observer.observe(root,{attributes:true,attributeFilter:['class','hidden']});
    const section=root.closest('section.art');if(section&&section!==root)observer.observe(section,{attributes:true,attributeFilter:['class','hidden']});
    const resizing=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;resizing?.observe(stage);
    function getState(){return {phase:state.phase,elapsed:state.elapsed,duration:state.duration,distance:state.distance,speed:state.speed,lane:state.lane,x:state.x,jump:state.jump,velocity:state.velocity,lives:state.lives,score:Math.floor(state.score),combo:state.combo,maxCombo:state.maxCombo,fish:state.fish,flags:state.flags,invulnerable:state.invulnerable,region:REGIONS[state.region].name,reducedMotion:reduced,sound,wordPoolSize:words.length,wordPool:words.map(w=>({...w})),objects:state.objects.map(item=>({id:item.id,kind:item.kind,lane:item.lane,z:item.world-state.distance,word:item.text||null,checked:!!item.checked})),canvas:{width,height,dpr,pixelWidth:canvas.width,pixelHeight:canvas.height},performance:{frames:frameCount,fps,drawMs},saved:state.saved,pauseReason:state.pauseReason};}
    function destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(raf);observer.disconnect();resizing?.disconnect();removers.forEach(remove=>remove());audio?.close().catch(()=>{});instances.delete(root);delete root.dataset.polarReady;}
    const api={start,restart:start,stop:finish,pause,resume,move,jump,setSound,getState,destroy};instances.set(root,api);root.dataset.polarReady='1';
    readWords();seedCourse();resize();setSound(false);overlay('남극으로 떠나볼까요?', '좌우로 길을 고르고 점프로 얼음을 넘어요.');return api;
  }
  window.LawinusPolar=Object.freeze({mount,version:'20261020-expedition'});
})();
