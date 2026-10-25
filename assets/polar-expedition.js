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
    civil: { label: '민사', color: '#1e5f9d', flag: '#3f8fdc' },
    criminal: { label: '형사', color: '#a63831', flag: '#ef7765' },
    public: { label: '공법', color: '#23734e', flag: '#33ab89' },
    rainbow: { label: '무지개', color: '#8a4baa', flag: '#bd78d5' },
    repel: { label: '빌런퇴치', color: '#176f70', flag: '#efc75e' }
  };
  const CAMERA = 28, PLAYER_Z = 8, FAR = 360, MAX_LIVES = 5, MOVE_LIMIT = 1.65;
  const RUN_SPEED = 52, STRAFE_SPEED = 7.8, DRAG_SCALE = .218 * CAMERA / (CAMERA + PLAYER_Z) - .018;
  const HAZARDS = {
    student: [
      {id:'phone',name:'통화 빌런',line:'잠깐 통화만!',color:'#af7087',prop:'phone'},
      {id:'snack',name:'과자 빌런',line:'한 봉지만…',color:'#d38e4f',prop:'snack'},
      {id:'keyboard',name:'독서실 빌런',line:'타닥타닥타닥!',color:'#6587af',prop:'keyboard'},
      {id:'seat',name:'자리 맡기 빌런',line:'친구 곧 와요!',color:'#8977b4',prop:'chair'},
      {id:'lecture',name:'아는 척 빌런',line:'그 판례 바뀌었는데?',color:'#5b9a91',prop:'book'},
      {id:'confession',name:'고백빌런',line:'시험 끝나고 만날래?',color:'#d16c99',prop:'heart'},
      {id:'grade',name:'학점마녀',line:'A는 다음 학기에…',color:'#8459ad',prop:'grade'},
      {id:'legshake',name:'다리떠는빌런',line:'저 안 떨었는데요?',color:'#759c64',prop:'leg'}
    ],
    career: [
      {id:'nightchat',name:'새벽 연락 의뢰인',line:'새벽 2시: 주무세요?',color:'#8b76b9',prop:'phone'},
      {id:'five',name:'5분 의뢰인',line:'5분이면 되죠?',color:'#c67b65',prop:'clock'},
      {id:'papers',name:'자료 미루기 의뢰인',line:'자료는 내일 드릴게요',color:'#678ea6',prop:'folder'},
      {id:'fee',name:'흥정 의뢰인',line:'상담만 살짝요!',color:'#b3944d',prop:'coin'},
      {id:'call',name:'연속 전화 의뢰인',line:'전화 못 받으셨어요?',color:'#709684',prop:'phone'}
    ]
  };

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
    const stageGoal = level => level === 1 ? {name:'로스쿨 입학',success:'로스쿨 합격',fail:'로스쿨 낙방',boss:'입학 관문'} : level === 2 ? {name:'졸업시험',success:'졸업시험 합격',fail:'졸업시험 탈락',boss:'졸업시험 관문'} : level === 3 ? {name:'변호사시험',success:'변호사시험 합격',fail:'오탈',boss:'변호사시험 관문'} : {name:'변호사 생활',success:'월 소득 '+(500*Math.pow(2,level-4)).toLocaleString('ko-KR')+' 달성',fail:'월 소득 '+(500*Math.pow(2,level-4)).toLocaleString('ko-KR')+' 실패',boss:'월 소득 '+(500*Math.pow(2,level-4)).toLocaleString('ko-KR')+' 관문'};
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motion.matches, width = 0, height = 0, dpr = 1, raf = 0, previousTime = 0, destroyed = false;
    const heldDirections = new Set(), controlPointers = new Map();
    let pointer = null, words = [], audio = null, sound = false, hudAge = 1, lastRegion = -1;
    let frameCount = 0, fps = 60, drawMs = 0;
    let bestScore = 0;
    try { bestScore = Math.max(0, Number(localStorage.getItem('lawinus_polar_best_v1')) || 0); } catch (_) {}
    const removers = [];
    const on = (target, event, handler, settings) => { if (target) { target.addEventListener(event, handler, settings); removers.push(() => target.removeEventListener(event, handler, settings)); } };
    const visible = () => !document.hidden && !root.hidden && root.getClientRects().length > 0 && (!options.isVisible || options.isVisible(root));
    const fresh = () => ({
      phase: 'ready', elapsed: 0, totalElapsed: 0, duration: 60, distance: 0, speed: RUN_SPEED, lane: 0, x: 0, lean: 0, horizontalVelocity: 0, steering: 0, steerPulse: 0, dragTarget: null, jumpBuffer: 0, level: 1, stack: [], lastType: '', boss: null, clears: 0, clearedAt: 0, celebration: 0, result: '', displayScore: null, row: 0,
      jump: 0, velocity: 0, step: 0, lives: MAX_LIVES, score: 0, bonus: 0, fish: 0, flags: 0,
      combo: 0, maxCombo: 0, invulnerable: 0, flash: 0, shake: 0, region: 0, repelGrace: 0,
      nextRow: 100, objects: [], particles: [], effects: [], floats: [], footprint: 0, saved: false, pauseReason: ''
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
      setText(fields.score, Math.floor(state.displayScore ?? state.score).toLocaleString('ko-KR'));
      setText(fields.time, state.boss ? 'BOSS' : Math.max(0, Math.ceil(state.duration - state.elapsed)));
      if(el('polarTimeUnit'))el('polarTimeUnit').hidden=!!state.boss;
      setText(el('polarLevel'),'STAGE '+state.level);setText(el('polarGoal'),stageGoal(state.level).name);
      setText(el('polarStageStatus'),state.phase==='finished'?state.result:state.phase==='cleared'?stageGoal(state.level).success:state.boss?'같은 색 3개 또는 무지개로 보스 공격':stageGoal(state.level).success+'에 도전');
      setText(el('polarStackCount'),state.stack.length+' / 10');
      const rack=el('polarStack');if(rack){if(rack.dataset.signature!==state.stack.join(',')){rack.dataset.signature=state.stack.join(',');rack.replaceChildren(...Array.from({length:10},(_,i)=>{const slot=document.createElement('span'),type=state.stack[i];slot.className='pe-stack-slot'+(type?' is-filled':'');slot.dataset.subject=type||'';slot.textContent=type?SUBJECTS[type].label.charAt(0):'';slot.setAttribute('aria-label',type?SUBJECTS[type].label+' 깃발':'빈 칸');return slot;}));}rack.classList.toggle('warning',state.stack.length>=9);rack.dataset.warning=String(state.stack.length>=9);rack.setAttribute('aria-label','누적 깃발 '+state.stack.length+'개, 최대 10개');}
      if(el('polarBossHud'))el('polarBossHud').hidden=!state.boss;setText(el('polarBossName'),stageGoal(state.level).boss);setText(el('polarBossHp'),state.boss?state.boss.hp+' / '+state.boss.max:'');
      if(el('polarBossBar')&&state.boss){el('polarBossBar').max=state.boss.max;el('polarBossBar').value=state.boss.hp;}
      root.querySelectorAll('[data-polar-journey]').forEach(node=>{const n=Number(node.dataset.polarJourney),current=Math.min(4,state.level);node.classList.toggle('active',n===current);node.classList.toggle('done',n<current);if(n===current)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
      setText(fields.lives, state.lives); setText(fields.combo, state.combo);
      setText(fields.region, REGIONS[state.region].name); setText(fields.distance, Math.floor(state.distance));
      setText(fields.fish, state.fish); setText(fields.best, Math.max(bestScore, Math.floor(state.score)).toLocaleString('ko-KR'));
      if (fields.progress) fields.progress.style.width = Math.min(100, state.elapsed / state.duration * 100) + '%';
      stage.dataset.state = state.phase;stage.dataset.boss=String(!!state.boss);stage.dataset.level=String(state.level);stage.classList.toggle('pe-danger',state.lives<=1||state.stack.length>=9);
      if (fields.start) {
        fields.start.disabled = ['running', 'paused', 'cleared'].includes(state.phase);
        fields.start.textContent = state.phase === 'finished' ? '다시 탐험' : '탐험 시작';
      }
      if (fields.pause) {
        fields.pause.disabled = !['running', 'paused'].includes(state.phase);
        fields.pause.textContent = state.phase === 'paused' ? '계속하기' : '일시정지';
        fields.pause.setAttribute('aria-label', state.phase === 'paused' ? '변시탐험 계속하기' : '변시탐험 일시정지');
      }
      if (fields.stop) fields.stop.disabled = !['running', 'paused', 'cleared'].includes(state.phase);
      if(el('polarDuration'))el('polarDuration').disabled=['running','paused','cleared'].includes(state.phase);
      root.querySelectorAll('[data-polar-action]').forEach(button => {
        const action = button.dataset.polarAction;
        if (['left', 'right', 'jump'].includes(action)) button.disabled = state.phase !== 'running';
        if (button.closest('#polarOverlay')) {
          button.hidden = action === 'resume' ? state.phase !== 'paused' : action === 'start' ? state.phase !== 'ready' : action === 'restart' ? state.phase !== 'finished' : action === 'next' || action === 'stop' ? state.phase !== 'cleared' : false;
        }
      });
      if(fields.overlay)fields.overlay.hidden=state.phase==='running'||(state.phase==='cleared'&&!reduced&&state.celebration>1.15);
    }
    function overlay(title, text) { setText(fields.title, title); setText(fields.text, text); syncHud(true); }
    function requestFrame() { if (!raf && !destroyed && (state.phase === 'running' || (state.phase==='cleared'&&state.celebration>0&&!reduced)) && visible()) raf = requestAnimationFrame(frame); }
    function focusStage(reveal = false) {
      stage.focus({ preventScroll: true });
      if(reveal && matchMedia('(max-width: 700px)').matches){
        const top=stage.getBoundingClientRect().top,headerBottom=document.querySelector('header')?.getBoundingClientRect().bottom||0;
        window.scrollTo({top:Math.max(0,scrollY+top-Math.max(0,headerBottom)-8),behavior:'instant'});
      }
    }

    function start() {
      if (destroyed || !visible() || ['running','paused','cleared'].includes(state.phase)) return false;
      cancelAnimationFrame(raf); raf = 0; previousTime = 0;
      clearSteering(); state = fresh(); state.phase = 'running';
      if (sound && audio?.state === 'suspended') audio.resume().catch(() => {});
      state.duration = clamp(Number(el('polarDuration')?.value) || 60, 15, 600);
      readWords(); seedCourse(); lastRegion = -1; rebuildBackdrop();
      message('STAGE 1 · 로스쿨 합격에 도전! 같은 색 3개를 모으고, 깃발 10칸 과부하를 피하세요.');
      syncHud(true); focusStage(true); requestFrame(); return true;
    }
    function pause(reason = 'manual') {
      if (state.phase !== 'running') return false;
      clearSteering(); state.phase = 'paused'; state.pauseReason = reason;
      cancelAnimationFrame(raf); raf = 0; previousTime = 0;
      if (audio?.state === 'running') audio.suspend().catch(() => {});
      overlay('잠깐, 숨 고르기', reason === 'hidden' ? '준비되면 탐험을 계속하세요.' : '같은 자리에서 이어 달릴 수 있어요.');
      message('탐험을 잠시 멈췄어요. 계속하기를 누르면 이어집니다.'); render(); return true;
    }
    function resume() {
      if (state.phase !== 'paused' || !visible()) return false;
      state.phase = 'running'; state.pauseReason = ''; previousTime = 0;
      if (sound && audio?.state === 'suspended') audio.resume().catch(() => {});
      message('다시 출발! 앞에 놓인 길을 살펴보세요.'); syncHud(true); focusStage(true); requestFrame(); return true;
    }
    function finish(reason = 'stop') {
      if (!['running', 'paused', 'cleared'].includes(state.phase)) return false;
      const rawScore=Math.floor(state.score),goal=stageGoal(state.level);
      state.result=reason==='collision'?goal.fail:state.phase==='cleared'?goal.success:'변시탐험을 마쳤어요';
      clearSteering();state.phase='finished';cancelAnimationFrame(raf);raf=0;previousTime=0;
      state.displayScore=typeof window.__lawinusAdjustedGameScore==='function'?window.__lawinusAdjustedGameScore(rawScore):rawScore;
      bestScore=Math.max(bestScore,state.displayScore);
      try{localStorage.setItem('lawinus_polar_best_v1',String(bestScore));}catch(_){}
      const summary=`Stage ${state.level} · ${state.flags}개 깃발 · 최고 콤보 ${state.maxCombo} · ${Math.floor(state.distance)} m`;
      message(state.result+' · '+summary);overlay(state.result,summary);render();
      if(!state.saved){state.saved=true;try{Promise.resolve(options.saveScore?.(rawScore,`${state.result} · Stage ${state.level} · 최고콤보 ${state.maxCombo}`)).catch(()=>{});}catch(_){}}
      return true;
    }
    function nextStage(){
      if(state.phase!=='cleared'||!visible())return false;
      state.level++;state.elapsed=0;state.phase='running';state.stack=[];state.boss=null;state.region=(state.level-1)%REGIONS.length;
      clearSteering();state.lane=0;state.x=0;state.jump=0;state.velocity=0;state.invulnerable=1;state.objects=[];state.row=0;state.particles=[];state.effects=[];state.floats=[];
      previousTime=0;seedCourse();rebuildBackdrop();message('STAGE '+state.level+' · '+stageGoal(state.level).success+'에 도전합니다.');syncHud(true);focusStage(true);requestFrame();return true;
    }
    function startBoss(){
      if(state.phase!=='running'||state.boss)return;
      const hp=Math.min(6,3+Math.floor(state.level/2));
      state.boss={hp,max:hp,x:0,target:0,move:.5,bomb:.55,hurt:0,attackLane:null,attackLanes:[],warning:0,warningTotal:.62,pattern:'aim',volley:0,elapsed:0};
      state.elapsed=state.duration;state.objects=[];state.nextRow=state.distance+48;state.row=0;
      while(state.nextRow<state.distance+180)spawnRow();
      message('보스 등장! 같은 색 3개 상쇄 또는 무지개 깃발로 공격하세요.');floating('BOSS · '+stageGoal(state.level).name,width/2,height*.42,'#a72944');tone(170,.35,'sawtooth',.035);syncHud(true);
    }
    function damageBoss(){
      const boss=state.boss;if(!boss||boss.hp<=0)return;
      boss.hp--;boss.hurt=.3;const pos=bossPosition();effect('impact',pos.x,pos.y,'#ffe7a3',.5);floating('BOSS −1',pos.x,pos.y-30,'#f4bd42');tone(190,.18,'triangle',.05);
      burst(pos.x,pos.y,'#ffe7a3',26);
      if(boss.hp===0){
        state.score+=280+state.level*90;state.clears++;clearSteering();state.phase='cleared';state.clearedAt=state.totalElapsed;state.celebration=reduced?0:1.8;state.stack=[];state.objects=[];
        state.boss.attackLanes=[];state.boss.attackLane=null;state.boss.warning=0;tone(520,.24,'triangle',.05);tone(780,.38,'sine',.035);
        cancelAnimationFrame(raf);raf=0;previousTime=0;
        const title=stageGoal(state.level).success;message('보스 격파! '+title+' · 다음 스테이지에 도전하세요.');overlay(title+'!',`STAGE ${state.level} 통과 · 생명 ${state.lives} · 다음: ${stageGoal(state.level+1).name}`);render();requestFrame();
      }
      syncHud(true);
    }
    function clearSteering(){heldDirections.clear();controlPointers.clear();pointer=null;if(state){state.steering=0;state.steerPulse=0;state.dragTarget=null;state.horizontalVelocity=0;state.jumpBuffer=0;}root.querySelectorAll('[data-polar-action]').forEach(button=>button.classList.remove('is-held'));}
    function move(direction){if(state.phase==='running'){state.steering=clamp(Number(direction)||0,-1,1);state.steerPulse=.1;state.dragTarget=null;}}
    function steer(dt){
      state.steerPulse=Math.max(0,state.steerPulse-dt);
      const controls=[...controlPointers.values()];let intent=(heldDirections.has('right')||controls.includes('right')?1:0)-(heldDirections.has('left')||controls.includes('left')?1:0);
      if(pointer&&state.dragTarget!==null){
        const before=state.x;state.x=state.dragTarget;state.horizontalVelocity=clamp((state.x-before)/Math.max(.001,dt),-STRAFE_SPEED,STRAFE_SPEED);intent=Math.sign(state.horizontalVelocity);
      }else{
        if(!intent&&state.steerPulse>0)intent=state.steering;
        if(intent){if(Math.sign(state.horizontalVelocity)!==intent)state.horizontalVelocity=0;state.horizontalVelocity=damp(state.horizontalVelocity,intent*STRAFE_SPEED,42,dt);}
        else state.horizontalVelocity=0;
        state.x=clamp(state.x+state.horizontalVelocity*dt,-MOVE_LIMIT,MOVE_LIMIT);
      }
      state.steering=intent;
      if(Math.abs(state.x)>=MOVE_LIMIT&&Math.sign(state.horizontalVelocity)===Math.sign(state.x))state.horizontalVelocity=0;
      state.lane=state.x;state.lean=damp(state.lean,clamp(state.horizontalVelocity*.034,-.24,.24),18,dt);
    }
    function jump() {
      if(state.phase!=='running')return false;
      if(state.jump>.015||state.velocity>0){if(state.velocity<0&&state.jump<.7)state.jumpBuffer=.12;return false;}
      state.jumpBuffer=0;state.velocity=10.2;tone(390,.075,'sine',.028);return true;
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
    function hazard(x,world){const pool=state.level<4?HAZARDS.student:HAZARDS.career;return object('villain',x,world,{hazard:{...pool[Math.floor(random()*pool.length)]}});}
    const randomX=()=> (random()*2-1)*1.48;
    const otherX=x=>clamp(x+(x>0?-1:1)*(.95+random()*.45),-1.48,1.48);
    function flag(lane, world, forcedType) {
      const types=['civil','criminal','public'],type=forcedType||(!state.boss&&random()<.06?'repel':random()<(state.boss?.12:.075)?'rainbow':types[Math.floor(random()*3)]);
      if(type==='repel')return object('flag',lane,world,{text:'빌런퇴치',subject:type});
      const choices=type==='rainbow'?words:words.filter(word=>word.subject===type),pool=choices.length?choices:words;
      const word=pool[Math.floor(random()*pool.length)%pool.length];
      return object('flag',lane,world,{text:word?.text||'무지개',subject:type});
    }
    function seedCourse(){
      const at=state.distance;
      state.objects=words.length?[flag(0,at+43,'civil'),flag(0,at+66,'civil'),flag(0,at+89,'civil'),hazard(1.08,at+111),object('fish',-1.12,at+111)]:[object('fish',0,at+43),object('ice',1,at+80)];
      state.nextRow=at+135;while(state.nextRow<at+FAR)spawnRow();
    }
    function spawnRow(){
      const world=state.nextRow,lane=randomX(),progress=state.elapsed/state.duration;
      const flagChance=state.boss?1:Math.max(.54,.72-(state.level-1)*.035);
      if(!state.boss&&state.row%12===8){
        state.objects.push(flag(lane,world,'repel'));
      }else if(words.length&&random()<flagChance){
        state.objects.push(flag(lane,world));
        if(random()<.35)state.objects.push(flag(otherX(lane),world));
      }else{
        state.objects.push(random()<.78&&state.repelGrace<=0?hazard(lane,world):object(random()<.5?'ice':'crack',lane,world));
        if(random()<.6)state.objects.push(object('fish',otherX(lane),world));
      }
      state.row++;
      const spacing=state.boss?Math.max(31,36-state.level):Math.max(30,43-progress*7-state.level*1.1);
      state.nextRow+=spacing+random()*6;
    }
    function updateBoss(dt){
      const boss=state.boss;if(!boss)return;
      boss.elapsed+=dt;boss.hurt=Math.max(0,boss.hurt-dt);boss.move-=dt;
      const urgent=boss.hp<=Math.ceil(boss.max/2);
      if(boss.move<=0){boss.target=randomX()*.8;boss.move=.45+random()*.6;}
      boss.x=damp(boss.x,boss.target,4,dt);
      if(boss.warning>0){
        boss.warning=Math.max(0,boss.warning-dt);
        if(boss.warning===0){
          const world=state.distance+PLAYER_Z+state.speed*(urgent?.88:1.02);
          for(const lane of boss.attackLanes)state.objects.push(object('bomb',lane,world,{volley:boss.volley}));
          boss.attackLane=null;boss.attackLanes=[];boss.bomb=Math.max(.58,(urgent?.78:1.08)-state.level*.035)+random()*.16;
          tone(135,.11,'sawtooth',.035);
        }
      }else{
        boss.bomb-=dt;if(boss.bomb<=0){
          boss.volley++;boss.pattern=boss.volley%3===0?'split':'aim';
          boss.attackLanes=boss.pattern==='split'?[-.94,.94]:[clamp(state.x+state.horizontalVelocity*.07,-1.48,1.48)];
          boss.attackLane=boss.attackLanes[0];boss.warningTotal=urgent?.56:.66;boss.warning=boss.warningTotal;
          tone(urgent?360:290,.085,'triangle',.028);
        }
      }
    }
    function burst(x, y, color, amount = 14) {
      const count = reduced ? Math.min(amount, 5) : amount;
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2, speed = 28 + random() * 100;
        state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: .45 + random() * .4, max: .85, size: 2 + random() * 3, color });
      }
      if (state.particles.length > 110) state.particles.splice(0, state.particles.length - 110);
    }
    function effect(type,x,y,color,life=.8){state.effects.push({type,x,y,color,life,age:0});if(state.effects.length>15)state.effects.shift();}
    function floating(text, x, y, color) { state.floats.push({ text, x, y, color, life: 1 }); if (state.floats.length > 6) state.floats.shift(); }
    function collect(item){
      const p=project(item.lane,PLAYER_Z);
      if(item.kind==='fish'){
        state.fish++;state.score+=10;burst(p.x,p.y-25,'#ffcf65',8);floating('+10',p.x,p.y-55,'#9b5e0d');tone(680,.07);
        if(state.fish%12===0&&state.lives<MAX_LIVES){state.lives++;message('물고기 12마리! 생명 1 회복');}return;
      }
      state.flags++;
      if(item.subject==='repel'){
        const targets=[];let removed=0;
        for(const obstacle of state.objects){
          if(obstacle.kind!=='villain')continue;
          obstacle.checked=true;obstacle.collected=true;removed++;
          const z=obstacle.world-state.distance;
          if(z>0&&z<FAR){const at=project(obstacle.lane,z);targets.push({x:at.x,y:at.y-50*at.scale,scale:at.scale,id:obstacle.id});}
        }
        state.objects=state.objects.filter(obstacle=>obstacle.kind!=='villain');state.repelGrace=2;
        state.effects.push({type:'repel',x:p.x,y:p.y-55,color:'#efc75e',life:reduced?.65:1.15,age:0,targets});if(state.effects.length>15)state.effects.shift();
        floating('빌런퇴치!',p.x,p.y-110,'#137a79');message(removed?'빌런퇴치! 빌런 '+removed+'명을 쫓아냈어요.':'빌런퇴치! 잠시 빌런이 나타나지 않아요.');
        tone(980,.19,'triangle',.045);syncHud(true);return;
      }
      if(item.subject==='rainbow'){
        const cleared=state.stack.length;state.stack=[];state.combo=0;state.lastType='';
        const add=150+cleared*12+state.level*18;state.score+=add;
        effect('rainbow',p.x,p.y-55,'#ce94ec',1.1);burst(p.x,p.y-45,'#ce94ec',24);floating('무지개 +'+add,p.x,p.y-100,'#9650ba');message('무지개! 깃발 '+cleared+'개를 모두 비웠어요.');tone(1050,.2);damageBoss();return;
      }
      state.combo=state.lastType===item.subject?state.combo+1:1;state.lastType=item.subject;state.maxCombo=Math.max(state.maxCombo,state.combo);
      const add=({civil:18,criminal:20,public:22})[item.subject]+(state.combo>1?Math.min(28,state.combo*4):0);state.score+=add;state.stack.push(item.subject);
      burst(p.x,p.y-45,SUBJECTS[item.subject].flag);floating('+'+add,p.x,p.y-95,SUBJECTS[item.subject].color);tone(740+Math.min(state.combo,8)*45,.1);
      const n=state.stack.length,a=state.stack[n-1],b=state.stack[n-2],c=state.stack[n-3];
      if(n>=3&&a===b&&b===c){
        state.stack.splice(n-3,3);state.score+=120+state.level*18;state.combo+=2;state.maxCombo=Math.max(state.maxCombo,state.combo);
        effect('triple',p.x,p.y-55,SUBJECTS[item.subject].flag,.9);message(SUBJECTS[item.subject].label+' 3개 상쇄! '+item.text);floating('같은 색 3개!',width/2,height*.62,SUBJECTS[item.subject].color);damageBoss();
      }else if(n>=3&&a!==b&&b!==c&&a!==c){
        state.stack.splice(n-3,3);state.score+=145+state.level*20;state.combo++;state.maxCombo=Math.max(state.maxCombo,state.combo);
        effect('traffic',p.x,p.y-55,'#33ab89',1);message('신호등 상쇄! 민사·형사·공법 3색을 비웠어요.');floating('신호등!',width/2,height*.62,'#238a75');
      }else if(n>=10){state.stack=[];loseLife('stack');}
      else message(`${SUBJECTS[item.subject].label} · ${item.text} · 누적 ${state.stack.length}/10`);
    }
    function loseLife(kind){
      state.lives--;state.combo=0;state.lastType='';state.flash=reduced?0:.24;effect('stamp',width*.5,height*.47,kind==='stack'?'과부하':'앗!',.65);state.shake=reduced?0:.42;
      if(kind!=='stack')state.invulnerable=1.35;
      const p=project(state.x,PLAYER_Z);burst(p.x,p.y-35,'#f4d5de',20);floating('생명 −1',p.x,p.y-110,'#b63853');tone(145,.18,'triangle',.055);
      const cause=kind==='stack'?'깃발 10칸 과부하!':kind==='bomb'?'보스 폭탄!':kind==='villain'?'빌런에게 발목을 잡혔어요!':'함정에 부딪혔어요.';
      message(cause+' 생명 '+state.lives+' · 0이 되면 '+stageGoal(state.level).fail);
      if(state.lives<=0)finish('collision');
    }
    function collide(item){
      const threshold=item.kind==='crack'?.65:item.kind==='bomb'?.72:item.kind==='villain'?1:.92;
      if(state.jump>=threshold){state.score+=10+state.level*2;floating('회피 +'+(10+state.level*2),project(state.x,PLAYER_Z).x,height*.75,'#2b798c');return;}
      if(state.invulnerable>0)return;loseLife(item.kind);
    }
    function update(dt){
      if(!state.boss)state.elapsed=Math.min(state.duration,state.elapsed+dt);state.totalElapsed+=dt;hudAge+=dt;
      const progress=state.elapsed/state.duration;
      state.speed=Math.min(104,RUN_SPEED+progress*22+(state.level-1)*5+(state.boss?7:0));state.distance+=state.speed*dt;
      steer(dt);state.step+=dt*(11+state.speed*.065);
      state.jumpBuffer=Math.max(0,state.jumpBuffer-dt);state.velocity-=34*dt;state.jump=Math.max(0,state.jump+state.velocity*dt);if(state.jump===0){state.velocity=0;if(state.jumpBuffer>0)jump();}
      state.invulnerable=Math.max(0,state.invulnerable-dt);state.flash=Math.max(0,state.flash-dt);state.shake=Math.max(0,state.shake-dt);state.repelGrace=Math.max(0,state.repelGrace-dt);
      if(!state.boss&&state.elapsed>=state.duration)startBoss();updateBoss(dt);
      while(state.nextRow<state.distance+(state.boss?190:FAR))spawnRow();
      for(const item of state.objects){
        if(item.kind!=='flag'||item.subject!=='repel'||item.checked)continue;
        const z=item.world-state.distance;
        if(z<=PLAYER_Z&&z>PLAYER_Z-state.speed*dt-1.5&&Math.abs(state.x-item.lane)<.43){item.checked=true;item.collected=true;collect(item);}
      }
      for(const item of state.objects){
        if(state.phase!=='running')break;const z=item.world-state.distance;
        if(!item.checked&&z<=PLAYER_Z&&z>PLAYER_Z-state.speed*dt-1.5){
          item.checked=true;const gap=Math.abs(state.x-item.lane),radius=item.kind==='crack'?.62:item.kind==='villain'?.45:item.kind==='flag'?.43:.39;
          if(gap<radius){if(item.kind==='flag'||item.kind==='fish'){item.collected=true;collect(item);}else collide(item);}
          else if(gap<radius+.2&&!['flag','fish'].includes(item.kind)){effect('near',project(state.x,PLAYER_Z).x,height*.76,'#ffffff',.55);floating('아슬아슬!',project(state.x,PLAYER_Z).x,height*.68,'#366c85');}
        }
      }
      state.objects=state.objects.filter(item=>item.world-state.distance> -12&&!item.collected);
      for(const particle of state.particles){particle.life-=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.vy+=150*dt;}state.particles=state.particles.filter(p=>p.life>0);
      for(const effect of state.effects)effect.age+=dt;state.effects=state.effects.filter(effect=>effect.age<effect.life);
      for(const float of state.floats){float.life-=dt;float.y-=dt*32;}state.floats=state.floats.filter(f=>f.life>0);
      state.footprint+=dt;if(!reduced&&state.jump<.05&&state.footprint>.12){const p=project(state.x,PLAYER_Z);burst(p.x+Math.sin(state.step)*14,p.y-3,'#f4feff',2);state.footprint=0;}
      syncHud();
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
        if(segment%5===0){const drift=Math.sin(segment*.7)*aw*.6;ellipse(a.x+drift,a.y,aw*.035,Math.max(.5,a.scale),'#d5e9f1');}
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
      if(item.subject==='repel'){drawRepelFlag(item,p);return;}
      const s=p.scale*1.13,colors=SUBJECTS[item.subject],w=clamp(28+item.text.length*13,105,225);
      const maxChars=Math.max(8,Math.ceil(item.text.length/Math.ceil(item.text.length/14))),lines=[];
      for(let at=0;at<item.text.length;at+=maxChars)lines.push(item.text.slice(at,at+maxChars));
      const font=Math.max(9,Math.min(15,195/maxChars)),h=Math.max(39,lines.length*(font+4)+14),top=Math.max(106,h+33);
      ctx.save();ctx.translate(p.x,p.y);ellipse(0,1,22*s,5*s,'#688da331');
      ctx.strokeStyle='#69899d';ctx.lineWidth=4*s;ctx.beginPath();ctx.moveTo(-w*.4*s,0);ctx.lineTo(-w*.4*s,-(top+4)*s);ctx.stroke();
      const wave=reduced?0:Math.sin(state.totalElapsed*5+item.world)*3;
      if(item.subject==='rainbow'){const gradient=ctx.createLinearGradient(-w*.4*s,0,w*.6*s,0);['#ef6471','#f5bd55','#49b78b','#4e9ade','#a96ed8'].forEach((color,index)=>gradient.addColorStop(index/4,color));ctx.fillStyle=gradient;}
      const flagColor=item.subject==='rainbow'?ctx.fillStyle:colors.flag;
      polygon([[-w*.4*s,-top*s],[(w*.6+wave)*s,-(top-4)*s],[(w*.6-4+wave)*s,-(top-4-h)*s],[-w*.4*s,-(top-h)*s]],flagColor);
      ctx.fillStyle='#fff';ctx.font=`700 ${font*s}px system-ui,sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';
      lines.forEach((line,index)=>ctx.fillText(line,(-w*.4+10)*s,(-top+9+(index+.5)*(h-14)/lines.length)*s,(w-18)*s));
      ellipse(-w*.4*s,-(top+7)*s,4*s,4*s,'#f7e3a0');ctx.restore();
    }
    function repelShield(x,y,size){
      ctx.save();ctx.translate(x,y);ctx.scale(size,size);
      polygon([[-17,-19],[0,-25],[17,-19],[15,1],[8,12],[0,18],[-8,12],[-15,1]],'#eec75d');
      polygon([[-12,-15],[0,-20],[12,-15],[10,0],[5,8],[0,12],[-5,8],[-10,0]],'#208d88');
      ctx.strokeStyle='#fff7d0';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(-6,-4);ctx.lineTo(-1,2);ctx.lineTo(7,-9);ctx.stroke();ctx.restore();
    }
    function drawRepelFlag(item,p){
      const s=p.scale*1.16,wave=reduced?0:Math.sin(state.totalElapsed*5+item.world)*3;
      ctx.save();ctx.translate(p.x,p.y);ellipse(0,1,27*s,6*s,'#688da331');
      ctx.strokeStyle='#247c7e';ctx.lineWidth=4*s;ctx.beginPath();ctx.moveTo(-42*s,0);ctx.lineTo(-42*s,-123*s);ctx.stroke();ellipse(-42*s,-125*s,5*s,5*s,'#f5d778');
      polygon([[-42*s,-119*s],[(73+wave)*s,-115*s],[(61+wave)*s,-87*s],[(73+wave)*s,-59*s],[-42*s,-63*s]],'#efc75e');
      polygon([[-38*s,-113*s],[(63+wave)*s,-110*s],[(53+wave)*s,-87*s],[(63+wave)*s,-64*s],[-38*s,-68*s]],'#ffed9b');
      repelShield(-17*s,-88*s,.75*s);ctx.fillStyle='#176f70';ctx.font=`900 ${17*s}px system-ui`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('빌런퇴치',2*s,-88*s,63*s);
      if(!reduced){const glow=.35+Math.sin(state.totalElapsed*4)*.1;ctx.globalAlpha=glow;ellipse(-42*s,-125*s,10*s,10*s,'#fff5ab');ctx.globalAlpha=1;}ctx.restore();
    }
    function drawRepelEffects(){
      for(const fx of state.effects){
        if(fx.type!=='repel')continue;
        const t=clamp(fx.age/fx.life,0,1),alpha=Math.max(0,1-t),spread=reduced?.25:1-Math.pow(1-t,2);
        ctx.save();ctx.globalAlpha=alpha;
        for(let i=0;i<(reduced?1:3);i++){const r=24+spread*Math.max(width,height)*(.68+i*.1);ctx.strokeStyle=i%2?'#efd175':'#7ce1cb';ctx.lineWidth=reduced?3:5-i;ctx.beginPath();ctx.ellipse(fx.x,fx.y,r,r*.5,0,0,Math.PI*2);ctx.stroke();}
        repelShield(fx.x,fx.y,1.1+(reduced?0:Math.sin(t*Math.PI)*.22));
        for(const at of fx.targets){
          const size=Math.max(9,at.scale*24),drift=reduced?0:spread*30*at.scale;
          for(let i=0;i<(reduced?2:5);i++){const a=i*2.4+at.id,dx=Math.cos(a)*(size*.6+drift),dy=Math.sin(a)*(size*.35+drift)-drift;ellipse(at.x+dx,at.y+dy,size*(.45+spread*.4),size*(.28+spread*.3),'#e5fff1');}
          const r=size*(.6+spread*.4);polygon([[at.x,at.y-r],[at.x+r*.25,at.y-r*.25],[at.x+r,at.y],[at.x+r*.25,at.y+r*.25],[at.x,at.y+r],[at.x-r*.25,at.y+r*.25],[at.x-r,at.y],[at.x-r*.25,at.y-r*.25]],'#f2d578');
        }
        ctx.restore();
      }
    }
    function drawObstacle(item,p){
      const s=p.scale*1.5;
      if(item.kind==='bomb'){
        ctx.save();ctx.translate(p.x,p.y-22*s);ellipse(0,0,23*s,24*s,'#3e294e');ellipse(-7*s,-7*s,10*s,8*s,'#85506f');rounded(-7*s,-29*s,14*s,10*s,3*s,'#7c5c6a');ctx.strokeStyle='#f4ba5d';ctx.lineWidth=3*s;ctx.beginPath();ctx.moveTo(2*s,-29*s);ctx.quadraticCurveTo(14*s,-45*s,22*s,-31*s);ctx.stroke();ellipse(22*s,-31*s,5*s,5*s,'#ffe28c');ctx.fillStyle='#ffda95';ctx.font=`900 ${22*s}px system-ui`;ctx.textAlign='center';ctx.fillText('!',0,8*s);ctx.restore();return;
      }
      if(item.kind==='villain'){drawVillain(item,p);return;}
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
    function drawVillain(item,p){
      const h=item.hazard,s=p.scale*1.3,walk=reduced?0:Math.sin(state.totalElapsed*4+item.id)*2,legShake=h.prop==='leg'&&!reduced?Math.sin(state.totalElapsed*34+item.id)*5:0;
      ctx.save();ctx.translate(p.x,p.y);ellipse(0,2*s,32*s,7*s,'#4b718b36');
      for(const side of [-1,1]){const shake=side===1?legShake:0;rounded((side*13-6+shake)*s,-34*s+side*walk*s,12*s,30*s,4*s,'#374e69');ellipse((side*14+shake)*s,(-3+side*walk-Math.abs(shake)*.5)*s,10*s,5*s,'#273c51');}
      if(h.prop==='grade')polygon([[-24*s,-86*s],[-40*s,-19*s],[0,-27*s],[40*s,-19*s],[24*s,-86*s]],'#523a74');
      rounded(-28*s,-86*s,56*s,58*s,12*s,h.color);polygon([[-13*s,-85*s],[0,-65*s],[13*s,-85*s]],'#f8eee0');
      if(state.level>=4){polygon([[-3*s,-77*s],[4*s,-77*s],[8*s,-47*s],[0,-40*s],[-6*s,-47*s]],'#edb658');}
      for(const side of [-1,1]){ctx.save();ctx.translate(side*26*s,-68*s);ctx.rotate(side*(h.prop==='phone'?-.8:.15));rounded(-6*s,-2*s,12*s,39*s,6*s,h.color);ellipse(0,33*s,7*s,8*s,'#efb897');ctx.restore();}
      ellipse(0,-105*s,24*s,27*s,'#f2c3a2');ellipse(-21*s,-104*s,5*s,7*s,'#efb897');ellipse(21*s,-104*s,5*s,7*s,'#efb897');
      ctx.fillStyle='#41394b';ctx.beginPath();ctx.arc(0,-111*s,24*s,Math.PI,Math.PI*2);ctx.lineTo(23*s,-101*s);ctx.lineTo(10*s,-115*s);ctx.lineTo(-11*s,-110*s);ctx.lineTo(-23*s,-100*s);ctx.fill();
      if(h.prop==='grade'){polygon([[-29*s,-125*s],[-5*s,-164*s],[8*s,-148*s],[23*s,-125*s]],'#5d3b86');rounded(-37*s,-130*s,74*s,9*s,5*s,'#684692');polygon([[-22*s,-132*s],[18*s,-132*s],[15*s,-139*s],[-17*s,-139*s]],'#cba1dc');rounded(-4*s,-140*s,10*s,9*s,1*s,'#edc86e');}
      ellipse(-8*s,-104*s,2*s,3*s,'#403747');ellipse(8*s,-104*s,2*s,3*s,'#403747');ctx.strokeStyle='#a56161';ctx.lineWidth=2*s;ctx.beginPath();ctx.arc(0,-95*s,6*s,0,Math.PI);ctx.stroke();
      if(h.prop==='heart'){ellipse(-15*s,-96*s,5*s,3*s,'#e88da0');ellipse(15*s,-96*s,5*s,3*s,'#e88da0');}
      if(h.prop==='phone'){rounded(22*s,-109*s,13*s,27*s,3*s,'#273646');rounded(25*s,-105*s,7*s,17*s,1*s,'#a0e6ef');}
      else if(h.prop==='snack'){polygon([[-22*s,-68*s],[22*s,-68*s],[17*s,-33*s],[-17*s,-33*s]],'#f3be55');ctx.fillStyle='#a44847';ctx.font=`900 ${13*s}px system-ui`;ctx.textAlign='center';ctx.fillText('칩',0,-45*s);}
      else if(h.prop==='keyboard'){rounded(-38*s,-49*s,76*s,18*s,4*s,'#e9eef3');for(let i=0;i<8;i++)rounded((-32+i*8)*s,-45*s,5*s,4*s,1*s,'#8095a6');}
      else if(h.prop==='chair'){rounded(23*s,-66*s,31*s,44*s,5*s,'#dcad64');rounded(16*s,-24*s,45*s,9*s,3*s,'#b8814e');ctx.fillStyle='#526477';ctx.fillRect(20*s,-16*s,5*s,17*s);ctx.fillRect(52*s,-16*s,5*s,17*s);}
      else if(h.prop==='clock'){ellipse(0,-53*s,19*s,19*s,'#fff4d6');ctx.strokeStyle='#716351';ctx.lineWidth=3*s;ctx.beginPath();ctx.moveTo(0,-67*s);ctx.lineTo(0,-53*s);ctx.lineTo(10*s,-49*s);ctx.stroke();}
      else if(h.prop==='coin'){ellipse(0,-53*s,19*s,19*s,'#edbe53');ctx.fillStyle='#946928';ctx.font=`900 ${23*s}px system-ui`;ctx.textAlign='center';ctx.fillText('₩',0,-45*s);}
      else if(h.prop==='heart'){
        rounded(-29*s,-68*s,58*s,36*s,4*s,'#fff0f5');ctx.strokeStyle='#dc8fac';ctx.lineWidth=2*s;ctx.beginPath();ctx.moveTo(-26*s,-65*s);ctx.lineTo(0,-48*s);ctx.lineTo(26*s,-65*s);ctx.stroke();
        const heart=(x,y,size)=>{ctx.save();ctx.translate(x*s,y*s);ctx.scale(size*s,size*s);ctx.fillStyle='#df5c8d';ctx.beginPath();ctx.moveTo(0,5);ctx.bezierCurveTo(-13,-3,-9,-12,0,-6);ctx.bezierCurveTo(9,-12,13,-3,0,5);ctx.fill();ctx.restore();};
        heart(0,-49,1);for(let i=0;i<2;i++){const float=reduced?0:Math.sin(state.totalElapsed*3+i*2)*4;heart((i?1:-1)*37,-113-i*13+float,.6);}
      }
      else if(h.prop==='grade'){rounded(-25*s,-77*s,50*s,44*s,3*s,'#fff8df');ctx.strokeStyle='#b5a998';ctx.lineWidth=2*s;ctx.beginPath();ctx.moveTo(-17*s,-67*s);ctx.lineTo(17*s,-67*s);ctx.stroke();ctx.fillStyle='#c84c65';ctx.font=`900 ${28*s}px Georgia,serif`;ctx.textAlign='center';ctx.fillText('F',0,-39*s);}
      else if(h.prop==='leg'){rounded(-24*s,-50*s,48*s,15*s,4*s,'#d8dfca');ctx.strokeStyle='#6f8661';ctx.lineWidth=2*s;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*32*s,-28*s);ctx.lineTo(side*(36+Math.abs(legShake)*.4)*s,-20*s);ctx.lineTo(side*32*s,-12*s);ctx.stroke();}if(!reduced){ctx.strokeStyle='#88a89b77';ctx.beginPath();ctx.ellipse(16*s,2*s,(18+Math.abs(legShake))*s,5*s,0,0,Math.PI*2);ctx.stroke();}}
      else{rounded(-29*s,-70*s,58*s,36*s,3*s,h.prop==='folder'?'#f0c579':'#eaf2ed');ctx.strokeStyle='#7797a5';ctx.lineWidth=2*s;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-18*s,(-60+i*8)*s);ctx.lineTo(18*s,(-60+i*8)*s);ctx.stroke();}}
      if(p.scale>.19){const bubble=Math.max(92,h.line.length*10.5),font=12,top=h.prop==='grade'?-204:-175,nameY=h.prop==='leg'?-58:-22;rounded(-bubble*.5*s,top*s,bubble*s,29*s,9*s,'#fffcf3');polygon([[-9*s,(top+28)*s],[0,(top+38)*s],[7*s,(top+28)*s]],'#fffcf3');ctx.fillStyle='#473c53';ctx.font=`800 ${font*s}px system-ui`;ctx.textAlign='center';ctx.fillText(h.line,0,(top+19)*s,(bubble-12)*s);rounded(-51*s,nameY*s,102*s,18*s,8*s,h.color);ctx.fillStyle='#fff';ctx.font=`700 ${10*s}px system-ui`;ctx.fillText(h.name,0,(nameY+13)*s,96*s);}
      ctx.restore();
    }
    function drawEffects(){
      if(!reduced&&state.phase==='running'&&state.speed>36){for(let i=0;i<8;i++){const q=(state.totalElapsed*(.6+i*.04)+i*.14)%1,side=i%2?-1:1,x=width/2+side*width*(.3+q*.18),y=height*(.55+q*.4);ctx.strokeStyle=`rgba(255,255,255,${q*.42})`;ctx.lineWidth=1+i%2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+side*(12+q*22),y+8+q*17);ctx.stroke();}}
      for(const e of state.effects){const t=e.age/e.life,alpha=Math.min(1,(1-t)*2),expand=reduced?.45:t;ctx.save();ctx.globalAlpha=alpha;ctx.translate(e.x,e.y);
        if(e.type==='stamp'){ctx.rotate(-.12);ctx.strokeStyle='#bc4560';ctx.lineWidth=4;ctx.strokeRect(-60,-25,120,48);ctx.fillStyle='#bc4560';ctx.font='900 28px system-ui';ctx.textAlign='center';ctx.fillText(e.color,0,9);}
        else if(e.type==='rainbow'){['#ed6c7e','#efb94f','#43b78c','#509de0','#ae77d5'].forEach((c,i)=>{ctx.strokeStyle=c;ctx.lineWidth=reduced?3:5;ctx.beginPath();ctx.arc(0,0,30+i*12+expand*100,Math.PI*.12,Math.PI*1.88);ctx.stroke();});}
        else if(e.type==='triple'){for(let i=0;i<3;i++){const a=i*Math.PI*2/3+expand*2,r=70*(1-expand);ctx.strokeStyle=e.color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r,14+expand*22,0,Math.PI*2);ctx.stroke();}}
        else if(e.type==='traffic'){['#3f8fdc','#ef7765','#33ab89'].forEach((c,i)=>{ctx.strokeStyle=c;ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,30+i*16+expand*70,i*2+expand*4,i*2+expand*4+1.7);ctx.stroke();});}
        else if(e.type==='impact'){for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.strokeStyle=i%2?'#fffcdf':e.color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(Math.cos(a)*(20+expand*25),Math.sin(a)*(20+expand*25));ctx.lineTo(Math.cos(a)*(55+expand*55),Math.sin(a)*(55+expand*55));ctx.stroke();}}
        else if(e.type==='near'){for(const side of [-1,1]){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(side*35,-35);ctx.quadraticCurveTo(side*(58+expand*15),0,side*43,35);ctx.stroke();}}
        ctx.restore();
      }
      if(state.phase==='finished'&&state.result===stageGoal(state.level).fail){ctx.save();ctx.translate(width*.5,height*.62);ctx.rotate(-.1);ctx.strokeStyle='#a83653';ctx.lineWidth=3;ctx.strokeRect(-Math.min(160,width*.35),-24,Math.min(320,width*.7),48);ctx.fillStyle='#a83653';ctx.font='900 24px system-ui';ctx.textAlign='center';ctx.fillText(state.result,0,8,width*.66);ctx.restore();}
    }
    function bossPosition(){
      const compact=width<=700,size=Math.min(width*.145,height*.115),floor=compact?132:184;
      return {size,x:width/2+(state.boss?.x||0)*width*.11,y:Math.max(height*.455,floor+size*.8+5)};
    }
    function drawBossDefeat(pos){
      const age=state.totalElapsed-state.clearedAt,t=reduced?.55:clamp(age/.7,0,1),alpha=reduced?.8:clamp(1-(age-.45)/.7,0,1);
      ctx.save();ctx.translate(pos.x,pos.y);ctx.globalAlpha=alpha;
      for(let i=0;i<3;i++){ctx.strokeStyle=['#ffe59a','#fff6d6','#8de3dc'][i];ctx.lineWidth=5-i;ctx.beginPath();ctx.arc(0,0,pos.size*(.5+i*.22)+t*Math.min(width*.43,height*.48),0,Math.PI*2);ctx.stroke();}
      for(let i=0;i<14;i++){
        const a=i*Math.PI*2/14,r=pos.size*.3+t*(pos.size*1.9+(i%3)*12),x=Math.cos(a)*r,y=Math.sin(a)*r+(reduced?0:t*t*30);
        ctx.save();ctx.translate(x,y);ctx.rotate(a+t*2);polygon([[-7,-4],[0,-10],[8,1],[2,9]],['#ffe194','#cf6d91','#c7edf3'][i%3]);ctx.restore();
      }
      ctx.globalAlpha=reduced?1:Math.min(1,age*6)*clamp((1.15-age)*3,0,1);ctx.fillStyle='#fff8ce';ctx.strokeStyle='#8d334b';ctx.lineWidth=3;ctx.font=`900 ${width<700?23:32}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText('보스 격파!',0,pos.size+34);ctx.fillText('보스 격파!',0,pos.size+34);ctx.restore();
    }
    function drawBoss(){
      const boss=state.boss;if(!boss)return;
      const pos=bossPosition(),size=pos.size,x=pos.x,y=pos.y+(!reduced?Math.sin(state.totalElapsed*4)*2:0),hurt=boss.hurt>0,urgent=boss.hp<=Math.ceil(boss.max/2);
      const defeated=boss.hp===0,dissolve=defeated?(reduced||state.phase==='finished'?1:clamp((state.totalElapsed-state.clearedAt)/.34,0,1)):0;
      ctx.save();ctx.globalAlpha=1-dissolve;ctx.translate(x,y-dissolve*14);ctx.scale(1+dissolve*.3,1+dissolve*.3);if(hurt&&!reduced)ctx.translate(Math.sin(state.totalElapsed*60)*4,0);
      ellipse(0,size*.58,size*.6,size*.08,'#34385330');
      polygon([[-size*.39,-size*.36],[-size*.74,size*.54],[-size*.18,size*.38],[0,size*.61],[size*.19,size*.38],[size*.74,size*.54],[size*.4,-size*.35]],hurt?'#d77383':urgent?'#a5304d':'#6a284a');
      rounded(-size*.46,-size*.45,size*.92,size*.9,size*.12,hurt?'#b86f78':'#263a53');
      rounded(-size*.35,-size*.34,size*.7,size*.65,size*.06,'#edf0db');
      ctx.strokeStyle='#cabf9c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-size*.3);ctx.lineTo(0,size*.24);ctx.stroke();
      ctx.fillStyle='#9c3453';ctx.font=`900 ${size*.49}px Georgia,serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('§',0,-size*.015);
      polygon([[-size*.4,-size*.44],[-size*.46,-size*.7],[-size*.2,-size*.57],[0,-size*.8],[size*.21,-size*.57],[size*.45,-size*.7],[size*.39,-size*.44]],'#c4e6f0');
      ellipse(-size*.16,-size*.49,size*.07,size*.025,'#f77274');ellipse(size*.16,-size*.49,size*.07,size*.025,'#f77274');
      for(const side of [-1,1]){ellipse(side*size*.55,size*.05,size*.14,size*.18,'#294057');rounded(side*size*.55-size*.06,size*.01,size*.12,size*.08,size*.02,'#e4af59');}
      ctx.restore();
      if(defeated)drawBossDefeat(pos);
      if(boss.warning>0&&boss.attackLanes.length){
        for(const lane of boss.attackLanes){
          const near=project(lane,PLAYER_Z+3),far=project(lane,115),nearRadius=width*.218*near.scale*.39,farRadius=width*.218*far.scale*.39;
          ctx.globalAlpha=reduced?.3:.2+(1-boss.warning/boss.warningTotal)*.18;
          polygon([[near.x-nearRadius,near.y],[far.x-farRadius,far.y],[far.x+farRadius,far.y],[near.x+nearRadius,near.y]],'#ef4861');ctx.globalAlpha=1;
          ctx.strokeStyle='#aa2543';ctx.lineWidth=2;ctx.beginPath();ctx.arc(near.x,near.y-15,Math.max(9,nearRadius*.6),-Math.PI/2,-Math.PI/2+Math.PI*2*(1-boss.warning/boss.warningTotal));ctx.stroke();
          ctx.fillStyle='#a12044';ctx.font='900 12px system-ui';ctx.textAlign='center';ctx.fillText('!',near.x,near.y-14);
        }
      }
      if(state.phase==='cleared'){
        for(let i=0;i<36;i++){const drift=reduced?0:Math.min(1.4,state.totalElapsed-state.clearedAt),x=width*(.04+hash(i+61)*.92)+Math.sin(i+drift*3)*drift*18,y=height*(.08+hash(i+91)*.65)+drift*(40+hash(i+21)*70);ctx.save();ctx.translate(x,y);ctx.rotate(i+drift*(i%2?3:-3));rounded(-3-i%3,-6,6+i%3,11,1,['#edb348','#76c7c4','#dc789c','#8ba9e0'][i%4]);ctx.restore();}
      }
    }
    function penguin(){
      const p=project(state.x,PLAYER_Z),size=Math.min(height*(width<=700?.245:.285),153)/140,bounce=state.jump>0?0:Math.abs(Math.sin(state.step))*3.2,air=state.jump*height*.115;
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
      const tail=(reduced?1:Math.sin(state.totalElapsed*8))*5;
      polygon([[18*size,-83*size],[48*size,(-86+tail)*size],[67*size,(-76+tail)*size],[48*size,(-73+tail)*size],[23*size,-75*size]],'#db594d');
      polygon([[-8*size,-15*size],[0,-2*size],[10*size,-15*size]],'#102c41');
      ellipse(-9*size,-63*size,14*size,25*size,'#7392aa19');ctx.restore();
    }
    function render() {
      if(!width||!height)return;
      if(lastRegion!==state.region)rebuildBackdrop();
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.drawImage(backdrop,0,0,width,height);
      ctx.save();
      if(state.shake>0&&!reduced)ctx.translate(Math.sin(state.totalElapsed*70)*state.shake*9,Math.cos(state.totalElapsed*59)*state.shake*5);
      drawTrack();drawBoss();
      const things=state.objects.filter(item=>{const z=item.world-state.distance;return z>1&&z<FAR;}).sort((a,b)=>b.world-a.world);
      let playerDrawn=false;
      for(const item of things){const z=item.world-state.distance;if(!playerDrawn&&z<PLAYER_Z){penguin();playerDrawn=true;}const p=project(item.lane,z);if(item.kind==='fish')fishSprite(p.x,p.y,p.scale*1.4,state.totalElapsed+item.world);else if(item.kind==='flag')drawFlag(item,p);else drawObstacle(item,p);}
      if(!playerDrawn)penguin();
      for(const particle of state.particles){ctx.globalAlpha=clamp(particle.life/particle.max,0,1);ellipse(particle.x,particle.y,particle.size,particle.size*.7,particle.color);}ctx.globalAlpha=1;
      ctx.textAlign='center';ctx.textBaseline='middle';for(const float of state.floats){ctx.globalAlpha=Math.min(1,float.life*2);ctx.font=`800 ${float.text.length>8?20:23}px system-ui,sans-serif`;ctx.lineWidth=3;ctx.strokeStyle='#ffffffbb';ctx.strokeText(float.text,float.x,float.y);ctx.fillStyle=float.color;ctx.fillText(float.text,float.x,float.y);}ctx.globalAlpha=1;
      drawEffects();drawRepelEffects();
      if(state.flash>0){ctx.fillStyle=`rgba(243,253,255,${state.flash*.7})`;ctx.fillRect(0,0,width,height);}
      ctx.restore();
      if(state.phase==='paused'){ctx.fillStyle='#244d6b22';ctx.fillRect(0,0,width,height);}
    }
    function frame(time) {
      raf=0;if(destroyed)return;
      if(state.phase==='cleared'){
        if(state.celebration<=0||reduced||!visible())return;
        const dt=Math.min(.05,previousTime?Math.max(0,(time-previousTime)/1000):1/60);previousTime=time;
        state.totalElapsed+=dt;hudAge+=dt;state.celebration=Math.max(0,state.celebration-dt);if(state.boss)state.boss.hurt=Math.max(0,state.boss.hurt-dt);
        for(const particle of state.particles){particle.life-=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.vy+=150*dt;}state.particles=state.particles.filter(p=>p.life>0);
        for(const effect of state.effects)effect.age+=dt;state.effects=state.effects.filter(effect=>effect.age<effect.life);
        for(const float of state.floats){float.life-=dt;float.y-=dt*32;}state.floats=state.floats.filter(f=>f.life>0);
        syncHud();render();requestFrame();return;
      }
      if(state.phase!=='running')return;
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
      else if(value==='next')nextStage();
      else if(value==='pause')state.phase==='paused'?resume():pause();
      else if(value==='resume')resume();else if(value==='stop')finish();else if(value==='left')move(-1);else if(value==='right')move(1);else if(value==='jump')jump();
    }
    on(root,'click',event=>{
      const button=event.target.closest('button');if(!button||!root.contains(button))return;
      const command=button.dataset.polarAction||({polarStart:'start',polarStop:'stop',polarPause:'pause',polarSound:'sound'})[button.id];
      if(!command)return;if(['left','right','jump'].includes(command)&&event.detail>0)return;if(command==='sound')setSound(!sound);else{action(command);if(['left','right','jump'].includes(command))focusStage();}syncHud(true);
    });
    on(root,'pointerdown',event=>{
      const button=event.target.closest('[data-polar-action]');if(!button||state.phase!=='running')return;
      const command=button.dataset.polarAction;if(!['left','right','jump'].includes(command))return;
      controlPointers.set(event.pointerId,command);button.classList.add('is-held');
      if(command==='jump')jump();else{pointer=null;state.dragTarget=null;state.x=clamp(state.x+(command==='right'?1:-1)*.08,-MOVE_LIMIT,MOVE_LIMIT);}
      button.setPointerCapture?.(event.pointerId);event.preventDefault();focusStage();
    });
    function releaseControl(event){if(controlPointers.has(event.pointerId)){const command=controlPointers.get(event.pointerId);controlPointers.delete(event.pointerId);if(![...controlPointers.values()].includes(command))root.querySelectorAll('[data-polar-action="'+command+'"]').forEach(button=>button.classList.remove('is-held'));state.steerPulse=0;}}
    on(document,'pointerup',releaseControl);on(document,'pointercancel',releaseControl);on(root,'lostpointercapture',releaseControl);
    on(root,'keydown',event=>{
      if(event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||!visible())return;
      if(event.target.closest('input,textarea,select,button,[contenteditable="true"]'))return;
      if(options.keyAllowed&&!options.keyAllowed(event,root))return;
      const key=event.key.toLowerCase();let handled=true;
      if(key==='arrowleft'||key==='a'){if(state.phase==='running'){heldDirections.add('left');state.dragTarget=null;}}
      else if(key==='arrowright'||key==='d'){if(state.phase==='running'){heldDirections.add('right');state.dragTarget=null;}}
      else if(event.repeat)return;
      else if(['arrowup','w',' '].includes(key))jump();else if(key==='p'||key==='escape')state.phase==='paused'?resume():pause();else if(key==='enter'&&state.phase==='cleared')nextStage();else if(key==='enter'&&['ready','finished'].includes(state.phase))start();else handled=false;
      if(handled)event.preventDefault();
    });
    on(document,'keyup',event=>{const key=event.key.toLowerCase();if(key==='arrowleft'||key==='a')heldDirections.delete('left');if(key==='arrowright'||key==='d')heldDirections.delete('right');});
    on(root,'focusin',event=>{if(event.target.closest('input,textarea,select,[contenteditable="true"]'))clearSteering();});
    on(stage,'pointerdown',event=>{
      if(event.target.closest('button')||state.phase!=='running')return;
      if(pointer){jump();event.preventDefault();return;}
      pointer={x:event.clientX,y:event.clientY,lastX:event.clientX,id:event.pointerId,jumped:false,moved:false};state.dragTarget=state.x;state.steerPulse=0;state.horizontalVelocity=0;stage.setPointerCapture?.(event.pointerId);event.preventDefault();focusStage();
    });
    on(stage,'pointermove',event=>{
      if(!pointer||pointer.id!==event.pointerId)return;
      const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
      if(Math.abs(dx)>4||Math.abs(dy)>4)pointer.moved=true;
      state.dragTarget=clamp(state.dragTarget+(event.clientX-pointer.lastX)/(width*DRAG_SCALE),-MOVE_LIMIT,MOVE_LIMIT);pointer.lastX=event.clientX;
      if(dy< -28&&!pointer.jumped){jump();pointer.jumped=true;}
      event.preventDefault();
    });
    on(stage,'pointerup',event=>{
      if(!pointer||pointer.id!==event.pointerId)return;
      if(!pointer.moved&&!pointer.jumped)jump();else if(state.dragTarget!==null)state.x=state.dragTarget;pointer=null;state.dragTarget=null;state.steering=0;state.steerPulse=0;state.horizontalVelocity=0;event.preventDefault();syncHud(true);
    });
    function releaseDrag(event){if(pointer?.id!==event.pointerId)return;pointer=null;state.dragTarget=null;state.steering=0;state.steerPulse=0;state.horizontalVelocity=0;}
    on(stage,'pointercancel',releaseDrag);on(stage,'lostpointercapture',releaseDrag);
    on(document,'visibilitychange',()=>{if(document.hidden)pause('hidden');});
    on(window,'blur',()=>pause('hidden'));
    on(document,'lawinus-game-mode-change',()=>{if(!visible())pause('hidden');else{resize();render();}});
    on(window,'resize',resize);
    on(motion,'change',event=>{reduced=event.matches;syncHud(true);render();requestFrame();});
    const observer=new MutationObserver(()=>{if(!visible())pause('hidden');else{resize();render();}});
    observer.observe(root,{attributes:true,attributeFilter:['class','hidden']});
    const section=root.closest('section.art');if(section&&section!==root)observer.observe(section,{attributes:true,attributeFilter:['class','hidden']});
    const resizing=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;resizing?.observe(stage);
    function getState(){return {phase:state.phase,level:state.level,goal:stageGoal(state.level),elapsed:state.elapsed,totalElapsed:state.totalElapsed,duration:state.duration,distance:state.distance,speed:state.speed,lane:state.lane,x:state.x,steering:state.steering,horizontalVelocity:state.horizontalVelocity,dragTarget:state.dragTarget,jump:state.jump,velocity:state.velocity,lives:state.lives,score:Math.floor(state.score),displayScore:state.displayScore,combo:state.combo,maxCombo:state.maxCombo,fish:state.fish,flags:state.flags,stack:state.stack.slice(),clears:state.clears,boss:state.boss?{...state.boss}:null,invulnerable:state.invulnerable,repelGrace:state.repelGrace,region:REGIONS[state.region].name,reducedMotion:reduced,sound,wordPoolSize:words.length,wordPool:words.map(w=>({...w})),objects:state.objects.map(item=>({id:item.id,kind:item.kind,lane:item.lane,x:item.lane,world:item.world,z:item.world-state.distance,hazard:item.hazard?{...item.hazard}:null,word:item.text||null,subject:item.subject||null,checked:!!item.checked})),canvas:{width,height,dpr,pixelWidth:canvas.width,pixelHeight:canvas.height},performance:{frames:frameCount,fps,drawMs},saved:state.saved,pauseReason:state.pauseReason,result:state.result};}
    function destroy(){if(destroyed)return;destroyed=true;clearSteering();cancelAnimationFrame(raf);observer.disconnect();resizing?.disconnect();removers.forEach(remove=>remove());audio?.close().catch(()=>{});instances.delete(root);delete root.dataset.polarReady;}
    const api={start,restart:start,nextStage,stop:finish,pause,resume,move,jump,setSound,getState,destroy};instances.set(root,api);root.dataset.polarReady='1';
    readWords();seedCourse();resize();setSound(false);overlay('로스쿨 합격에 도전!', '같은 색 3개로 깃발을 비우세요. 스테이지 끝에는 보스가 기다립니다.');return api;
  }
  window.LawinusPolar=Object.freeze({mount,version:'20261025-sprint'});
})();
