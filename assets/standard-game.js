import { GRADES, STATUTE_GRADES, gradesForTrack, PROGRESS_KEY, STATUTE_PROGRESS_KEY, validateCaseBank, validateStatuteBank, restoreProgress, freshProgress, beginExam, updateAnswer, settleExam, remainingMs, makePracticeRound, gradePractice, buildCertificatePdf, validateIdentity } from './game-core.js';

const $ = id => document.getElementById(id);
const root = $('game-main');
if (root) initialize();

async function initialize() {
  let records = [], byId = new Map(), statuteRecords = [], statuteById = new Map(), track = 'case', state = freshProgress(), selectedGrade = 0, mode = 'exam', storageEnabled = true, bankReady = false, certificateKind = null, certificateResult = null, certificateGeneration = 0, pdfBusy = false;
  const profiles = {case:freshProgress('case'),statute:freshProgress('statute')}, storageKeys={case:PROGRESS_KEY,statute:STATUTE_PROGRESS_KEY}, ready={case:false,statute:false};
  const kingName = value => value==='statute'?'조문왕':'판례왕';
  const lookup = id => statuteById.get(id)||byId.get(id);
  const practices = { matching: null, source: null }, previousPracticeIds = { matching: [], source: [] };
  let fontPromise;
  const status = message => { $('sg-load-status').textContent = message; };
  function readLatest(target=track) {
    if (!storageEnabled) return profiles[target];
    try { return restoreProgress(localStorage.getItem(storageKeys[target]),target); }
    catch (_) { storageEnabled = false; renderStorage(); return profiles[target]; }
  }
  function write(next,target=next.track||track) {
    profiles[target]=next; if(target===track)state = next;
    if (storageEnabled) {
      try { localStorage.setItem(storageKeys[target], JSON.stringify(next)); }
      catch (_) { storageEnabled = false; }
    }
    renderStorage();
  }
  function renderStorage() {
    $('sg-storage').textContent = storageEnabled
      ? '로그인 없이 이 브라우저에 급수와 풀이 상태를 저장합니다. 다른 기기와 동기화되지 않습니다.'
      : '브라우저 저장이 제한되어 이 탭에서만 진행합니다. 탭을 닫으면 급수와 풀이 상태가 사라질 수 있습니다.';
  }
  function renderProgress() {
    const GRADES=gradesForTrack(track), units=track==='statute'?'문항':'판례';
    $('sg-progress-title').textContent=`도전 ${kingName(track)}! · 나의 급수`;
    $('sg-stage-note').textContent=track==='statute'?'조문왕 급수는 민법위키 학습단계입니다. 공식 기출 급수 및 판례집 급수와 구별합니다.':'발간 대한민국 표준판례의 누적 급수입니다.';
    $('sg-exam-heading').textContent=`도전 ${kingName(track)}!`;
    const highest = state.passedGrades.length ? GRADES[Math.max(...state.passedGrades)].label : null;
    $('sg-earned').textContent = highest ? `${highest} 취득 · ${GRADES[state.unlockedIndex].label}까지 도전 가능` : '취득 전 · 5급부터 도전';
    const list = $('sg-grade-steps'); list.classList.toggle('sg-statute-steps',track==='statute');list.replaceChildren();
    GRADES.forEach((grade, index) => {
      const item = document.createElement('li'), label = document.createElement('strong'), count = document.createElement('span'), progress = document.createElement('span');
      label.textContent = grade.label; count.textContent = `누적 ${grade.count.toLocaleString('ko-KR')}${units}`;
      progress.textContent = state.passedGrades.includes(index) ? '취득 · 복습 가능' : index === state.unlockedIndex ? '도전 가능' : '이전 급수 합격 후';
      item.className = state.passedGrades.includes(index) ? 'sg-grade-earned' : index === state.unlockedIndex ? 'sg-grade-current' : 'sg-grade-locked';
      item.append(label, count, progress); list.append(item);
    });
    const selector = $('sg-grade'); selector.replaceChildren();
    GRADES.forEach((grade, index) => {
      const option = document.createElement('option'); option.value = String(index); option.disabled = index > state.unlockedIndex;
      option.textContent = `${grade.label} · 누적 ${grade.count.toLocaleString('ko-KR')}${units}${option.disabled ? ' · 잠김' : state.passedGrades.includes(index) ? ' · 복습' : ' · 도전'}`; selector.append(option);
    });
    selectedGrade = Math.min(selectedGrade, state.unlockedIndex); selector.value = String(selectedGrade);
    selector.disabled = !ready[track] || state.session?.status === 'running';
    $('sg-start').disabled = !ready[track] || state.session?.status === 'running';
    $('sg-start').textContent = `${GRADES[selectedGrade].label} 10문제 새로 시작`;
    $('sg-start-matching').disabled = !bankReady; $('sg-start-source').disabled = !bankReady;
    renderStorage(); renderTimer();
  }
  function renderTimer() {
    const GRADES=gradesForTrack(track);
    const running = state.session?.status === 'running', ms = running ? remainingMs(state.session) : 600000;
    const seconds = Math.ceil(ms / 1000);
    $('sg-timer').textContent = running ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : state.session?.status === 'graded' ? '채점 완료' : '10:00';
    $('sg-timer').parentElement.classList.toggle('sg-timer-low', running && ms <= 60000);
    $('sg-timer-label').textContent = running ? `${kingName(track)} ${GRADES[state.session.gradeIndex].label} 진행 중` : '10분 · 헌3/민4/형3';
    $('sg-timer-note').textContent = running ? '자료 읽기·다른 게임 중에도 시간은 계속 흐릅니다.' : '자료를 읽는 동안에도 시간이 흐릅니다.';
  }
  function officialLink(record) {
    if (record.officialUrl) {
      try { const url = new URL(record.officialUrl); if (url.protocol === 'https:' && (url.hostname === 'law.go.kr' || url.hostname.endsWith('.law.go.kr') || url.hostname === 'scourt.go.kr' || url.hostname.endsWith('.scourt.go.kr'))) return { href: url.href, label: record.isStatute?'공식 조문 원문 열기 ↗':'공식 판례 원문 열기 ↗' }; } catch (_) {}
    }
    return { href: `https://www.law.go.kr/LSW/precSc.do?query=${encodeURIComponent(record.caseNumber || '')}`, label: '국가법령정보센터에서 사건번호 검색 ↗' };
  }
  function readingMaterial(record) {
    const details = document.createElement('details'); details.className = 'sg-openbook';
    const summary = document.createElement('summary'); summary.textContent = record?.isStatute?'오픈북 조문 지문 읽기':'오픈북 자료 읽기'; details.append(summary);
    const content = document.createElement('div'); content.className = 'sg-openbook-content';
    if (!record) { content.textContent = '이 기록에 연결된 자료가 현재 자료은행에 없습니다.'; details.append(content); return details; }
    const title = document.createElement('p'); title.className = 'sg-case-title'; title.textContent = record.title;
    const meta = document.createElement('p'); meta.className = 'sg-case-meta'; meta.textContent = [record.subject, record.citation||record.caseNumber, record.date].filter(Boolean).join(' · ');
    const body = document.createElement('p'); body.className = 'sg-case-summary'; body.textContent = record.summary;
    const book = document.createElement('p'); book.className = 'sg-case-ref'; book.textContent = `발간 자료: ${record.bookSource || '대한민국 표준판례'}`;
    content.append(title, meta, body, book);
    if (record.articleRefs?.length) { const ref = document.createElement('p'); ref.className = 'sg-case-ref'; ref.textContent = `관련 조문: ${record.articleRefs.join(' · ')}`; content.append(ref); }
    const destination = officialLink(record), link = document.createElement('a'); link.href = destination.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = destination.label; content.append(link);
    if (!record.officialUrl) { const note = document.createElement('p'); note.className = 'sg-case-ref'; note.textContent = '개별 원문 주소는 연결하지 않았습니다. 사건번호로 공식 자료를 확인해 주세요.'; content.append(note); }
    details.append(content); return details;
  }
  function renderExam() {
    const session = state.session;
    $('sg-exam-form').hidden = !session;
    $('sg-result').hidden = session?.status !== 'graded';
    const container = $('sg-questions'); container.replaceChildren();
    if (!session) return;
    session.questions.forEach((question, index) => {
      const fieldset = document.createElement('fieldset'); fieldset.className = 'sg-question';
      const legend = document.createElement('legend'); legend.textContent = `${question.subject||lookup(question.id)?.subject||'법학'} · 문제 ${index + 1} · 10점`;
      const prompt = document.createElement('p'); prompt.className = 'sg-prompt'; prompt.textContent = question.prompt;
      const label = document.createElement('label'); label.className = 'sg-answer-label'; label.textContent = '빈칸 답';
      const input = document.createElement('input'); input.type = 'text'; input.maxLength = 160; input.autocomplete = 'off'; input.spellcheck = false;
      input.id = `sg-answer-${index}`; input.dataset.question = question.id; input.value = session.userAnswers[question.id] || ''; input.disabled = session.status !== 'running';
      label.htmlFor = input.id; label.append(input);
      input.addEventListener('input', () => {
        const latest = readLatest();
        if (latest.session?.id !== session.id) { state = latest; renderAll(); status('다른 탭에서 학습 기록이 바뀌어 현재 화면을 갱신했습니다.'); return; }
        if (Date.now() >= latest.session.deadlineAt) { state = latest; finishExam(); return; }
        write(updateAnswer(latest, session.id, question.id, input.value)); renderAnswerCount();
      });
      fieldset.append(legend, prompt, label, readingMaterial(lookup(question.id))); container.append(fieldset);
    });
    $('sg-submit').disabled = session.status !== 'running'; $('sg-submit').hidden = session.status !== 'running';
    renderAnswerCount(); if (session.status === 'graded') renderResult(session.result);
  }
  function renderAnswerCount() {
    const count = state.session?.questions.filter(question => (state.session.userAnswers[question.id] || '').trim()).length || 0;
    $('sg-answer-count').textContent = `${count} / 10문제 작성${state.session?.status === 'graded' ? ' · 채점 완료' : ''}`;
  }
  function renderResult(result) {
    if (!result) return;
    const GRADES=gradesForTrack(result.track), king=kingName(result.track);
    $('sg-result-title').textContent = `${king} ${GRADES[result.gradeIndex].label} ${result.score}점 · ${result.passed ? '합격' : '다시 도전'}`;
    $('sg-result-title').className = result.passed ? 'sg-passed' : 'sg-failed';
    const next = result.promoted ? `${GRADES[result.nextGradeIndex].label} 도전이 열렸습니다.` : result.passed && result.gradeIndex === GRADES.length-1 ? `최고 단계인 ${GRADES.at(-1).label}을 유지합니다.` : result.passed ? '취득한 급수를 복습했습니다.' : '같은 급수에서 새 문제로 다시 도전해 보세요.';
    $('sg-result-description').textContent = `${result.correctCount} / 10문제 정답. ${result.timedOut ? '10분이 지나 자동으로 채점했습니다. ' : ''}${next}`;
    $('sg-pass-choice').hidden = !result.passed; $('sg-king-choice').hidden = !result.perfect;
    $('sg-king-choice').querySelector('h3').textContent=`10문제 모두 정답! ${king}입니다.`;
    $('sg-king-create').textContent=`${king}상 만들기`;
    $('sg-pass-choice-status').textContent = '';
    const container = $('sg-result-details'); container.replaceChildren();
    result.details.forEach((detail, index) => {
      const card = document.createElement('div'); card.className = 'sg-review';
      const heading = document.createElement('h4'); heading.className = detail.correct ? 'sg-review-correct' : 'sg-review-wrong'; heading.textContent = `문제 ${index + 1} · ${detail.correct ? '정답 · 10점' : '오답 또는 미응답 · 0점'}`;
      const prompt = document.createElement('p'); prompt.textContent = detail.prompt;
      const answers = document.createElement('p'); answers.className = 'sg-review-answers'; answers.textContent = `내 답: ${detail.answer.trim() || '미응답'} / 정답: ${detail.acceptedAnswers.join(' 또는 ')}`;
      const explanation = document.createElement('p'); explanation.textContent = detail.explanation;
      const source = document.createElement('p'); source.className = 'sg-small'; source.textContent = detail.source;
      card.append(heading, prompt, answers, explanation, source); container.append(card);
    });
  }
  function closeCertificate() {
    certificateGeneration++;
    $('sg-certificate-form').reset(); $('sg-certificate').hidden = true; $('sg-certificate-status').textContent = '';
    certificateKind = null; certificateResult = null;
  }
  function openCertificate(kind) {
    const result = state.session?.status === 'graded' ? state.session.result : null;
    if (!result?.passed || (kind === 'king' && !result.perfect)) return;
    closeCertificate(); certificateKind = kind; certificateResult = result;
    const grade=gradesForTrack(result.track)[result.gradeIndex],king=kingName(result.track);
    $('sg-certificate-title').textContent = kind === 'king' ? `${king} 학습 상장 만들기` : `${king} ${grade.label} PDF 학습 합격증 만들기`;
    $('sg-certificate').hidden = false; $('sg-certificate').scrollIntoView({ block: 'start', behavior: 'auto' }); $('sg-name').focus();
  }
  function finishExam() {
    const sessionId = state.session?.id;
    if (!sessionId || state.session.status !== 'running') return;
    let latest = readLatest();
    if (latest.session?.id !== sessionId) { state = latest; renderAll(); status('다른 탭에서 학습이 바뀌었습니다. 현재 학습 기록을 확인해 주세요.'); return; }
    const now = Date.now();
    if (now < latest.session.deadlineAt) $('sg-exam-form').querySelectorAll('[data-question]').forEach(input => { latest = updateAnswer(latest, sessionId, input.dataset.question, input.value, now); });
    try {
      const settled = settleExam(latest, sessionId, now); write(settled.state);
      selectedGrade = settled.result.promoted ? state.unlockedIndex : settled.result.gradeIndex;
      closeCertificate(); renderAll();
      if (!settled.alreadyGraded) $('sg-result').scrollIntoView({ block: 'start', behavior: 'auto' });
    } catch (error) { status(error.message); }
  }
  function switchMode(nextMode) {
    const nextTrack=nextMode==='statute'?'statute':'case';
    if(nextTrack!==track){track=nextTrack;state=readLatest(track);profiles[track]=state;selectedGrade=state.unlockedIndex;closeCertificate();renderProgress();renderExam();}
    mode = nextMode;
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    ['exam', 'matching', 'source'].forEach(key => { $(`sg-${key}`).hidden = key === 'exam' ? !['exam','statute'].includes(mode) : key !== mode; });
    $('sg-exam').setAttribute('aria-labelledby',mode==='statute'?'sg-mode-statute':'sg-mode-exam');
  }
  function startPractice(practiceMode) {
    try {
      const latest = readLatest(); selectedGrade = Math.min(Number($('sg-grade').value), latest.unlockedIndex); state = latest;
      const round = makePracticeRound(records, selectedGrade, practiceMode, { previousIds: previousPracticeIds[practiceMode] });
      practices[practiceMode] = round; previousPracticeIds[practiceMode] = round.items.map(item => item.id);
      const container = $(`sg-${practiceMode}-questions`); container.replaceChildren();
      round.items.forEach((item, index) => {
        const fieldset = document.createElement('fieldset'); fieldset.className = 'sg-question';
        const legend = document.createElement('legend'); legend.textContent = `${practiceMode === 'matching' ? '짝' : '문제'} ${index + 1}`;
        const prompt = document.createElement('p'); prompt.className = 'sg-prompt'; prompt.textContent = item.prompt;
        const wrapper = document.createElement('div'); wrapper.className = 'sg-practice-select';
        const label = document.createElement('label'), select = document.createElement('select'); select.id = `sg-${practiceMode}-answer-${index}`; select.dataset.practiceId = item.id;
        label.htmlFor = select.id; label.textContent = practiceMode === 'matching' ? '이 판례의 쟁점 제목' : '이 요지의 판례 사건번호';
        const blank = document.createElement('option'); blank.value = ''; blank.textContent = '선택해 주세요'; select.append(blank);
        item.options.forEach(option => { const element = document.createElement('option'); element.value = option.id; element.textContent = option.label; select.append(element); });
        wrapper.append(label, select); const feedback = document.createElement('p'); feedback.className = 'sg-practice-feedback'; feedback.id = `sg-${practiceMode}-feedback-${index}`;
        fieldset.append(legend, prompt, wrapper, feedback, readingMaterial(byId.get(item.id))); container.append(fieldset);
      });
      $(`sg-${practiceMode}-form`).hidden = false; $(`sg-${practiceMode}-result`).textContent = `${GRADES[selectedGrade].label} 범위에서 새로 뽑은 5${practiceMode === 'matching' ? '쌍' : '문제'}입니다.`;
      renderTimer();
    } catch (error) { $(`sg-${practiceMode}-result`).textContent = error.message; }
  }
  function submitPractice(practiceMode, event) {
    event.preventDefault(); const round = practices[practiceMode]; if (!round) return;
    const answers = Object.fromEntries(Array.from($(`sg-${practiceMode}-form`).querySelectorAll('select[data-practice-id]')).map(select => [select.dataset.practiceId, select.value]));
    const result = gradePractice(round, answers);
    result.details.forEach((detail, index) => { const record = byId.get(detail.id), feedback = $(`sg-${practiceMode}-feedback-${index}`); feedback.textContent = `${detail.correct ? '정답' : '오답 또는 미응답'} · ${record.caseNumber} · ${record.title}`; feedback.className = `sg-practice-feedback ${detail.correct ? 'sg-review-correct' : 'sg-review-wrong'}`; });
    $(`sg-${practiceMode}-result`).textContent = `${result.total}개 중 ${result.correctCount}개 정답입니다. 근거 자료를 읽고 연결을 다시 확인해 보세요.`;
  }
  function renderAll() { renderProgress(); renderExam(); switchMode(mode); }
  $('sg-grade').addEventListener('change', () => {
    const latest = readLatest(), next = Number($('sg-grade').value);
    if (!Number.isInteger(next) || next < 0 || next > latest.unlockedIndex || latest.session?.status === 'running') { state = latest; renderProgress(); return; }
    state = latest; selectedGrade = next; renderProgress();
  });
  $('sg-start').addEventListener('click', () => {
    try {
      const latest = readLatest(), chosen = Number($('sg-grade').value);
      if (!Number.isInteger(chosen) || chosen > latest.unlockedIndex) throw new Error('잠긴 급수는 선택할 수 없습니다.');
      write(beginExam(latest, track==='statute'?statuteRecords:records, chosen)); selectedGrade = chosen; closeCertificate(); switchMode(track==='statute'?'statute':'exam'); renderAll(); status(`${kingName(track)} ${gradesForTrack(track)[chosen].label} 헌3/민4/형3, 10문제를 시작했습니다. 10분 뒤 자동 채점합니다.`);
    } catch (error) { status(error.message); }
  });
  $('sg-exam-form').addEventListener('submit', event => { event.preventDefault(); finishExam(); });
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.mode)));
  ['matching', 'source'].forEach(key => { $(`sg-start-${key}`).addEventListener('click', () => startPractice(key)); $(`sg-${key}-form`).addEventListener('submit', event => submitPractice(key, event)); });
  $('sg-pass-yes').addEventListener('click', () => openCertificate('pass'));
  $('sg-pass-no').addEventListener('click', () => { closeCertificate(); $('sg-pass-choice-status').textContent = '합격증을 만들지 않았습니다. 급수 합격은 그대로 유지됩니다.'; });
  $('sg-king-create').addEventListener('click', () => openCertificate('king'));
  $('sg-certificate-cancel').addEventListener('click', closeCertificate);
  $('sg-certificate-form').addEventListener('submit', async event => {
    event.preventDefault(); if (pdfBusy || !certificateKind || !certificateResult) return;
    const name = $('sg-name').value, birthYear = $('sg-birth-year').value, now = Date.now(), generation = certificateGeneration;
    try {
      validateIdentity(name, birthYear, now); pdfBusy = true; $('sg-pdf-download').disabled = true; $('sg-certificate-status').textContent = '한글 글꼴을 넣어 PDF를 만들고 있습니다.';
      if (!globalThis.PDFLib || !globalThis.fontkit) throw new Error('PDF 도구를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
      if (!fontPromise) fontPromise = fetch(new URL('./vendor/game-NanumMyeongjo-Regular.ttf', import.meta.url)).then(response => { if (!response.ok) throw new Error('한글 글꼴을 불러오지 못했습니다.'); return response.arrayBuffer(); }).catch(error => { fontPromise = null; throw error; });
      const kind = certificateKind, result = certificateResult;
      const bytes = await buildCertificatePdf(globalThis.PDFLib, globalThis.fontkit, await fontPromise, { kind, name, birthYear, result, now });
      if (generation !== certificateGeneration) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), link = document.createElement('a');
      link.href = url; link.download = `민법위키_${kingName(result.track)}_${gradesForTrack(result.track)[result.gradeIndex].label}_${kind === 'king' ? '상장' : '학습합격증'}.pdf`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      $('sg-certificate-form').reset(); $('sg-certificate-status').textContent = 'PDF를 내려받았습니다. 입력한 이름과 생년을 화면에서 지웠습니다.'; certificateKind = null; certificateResult = null;
    } catch (error) { $('sg-certificate-status').textContent = error.message; }
    finally { pdfBusy = false; $('sg-pdf-download').disabled = false; }
  });
  window.addEventListener('storage', event => {
    const target=Object.keys(storageKeys).find(key=>storageKeys[key]===event.key);
    if (!target || !storageEnabled) return;
    profiles[target]=restoreProgress(event.newValue,target);
    if(target===track){state=profiles[target];selectedGrade = Math.min(selectedGrade, state.unlockedIndex); closeCertificate(); renderAll(); status('다른 탭의 학습 기록을 반영했습니다.');}
  });
  function expireTracks(){renderTimer();for(const target of ['case','statute']){const latest=readLatest(target);profiles[target]=latest;if(latest.session?.status==='running'&&remainingMs(latest.session)<=0){if(target===track){state=latest;finishExam();}else{try{write(settleExam(latest,latest.session.id).state,target);}catch(_){}}}}}
  setInterval(expireTracks,500);document.addEventListener('visibilitychange',expireTracks);
  profiles.case=readLatest('case');profiles.statute=readLatest('statute');state=profiles.case;selectedGrade = state.unlockedIndex; renderAll();
  try {
    const response = await fetch(new URL('./standard_cases.json', import.meta.url)); if (!response.ok) throw new Error('표준판례 자료를 읽지 못했습니다. 새로고침 후 다시 확인해 주세요.');
    const bank = await response.json(); records = validateCaseBank(bank); byId = new Map(records.map(record => [record.id, record])); bankReady = true;ready.case=true;
    const statuteResponse=await fetch(new URL('./standard_statutes.json',import.meta.url));if(!statuteResponse.ok)throw new Error('조문 워크북 문항을 읽지 못했습니다.');
    statuteRecords=validateStatuteBank(await statuteResponse.json());statuteById=new Map(statuteRecords.map(record=>[record.id,record]));ready.statute=true;
    $('sg-bank-source').textContent = '출처: 발간 대한민국 표준판례 1,800판례와 워크북 v026 조문 496문항. 오픈북 자료에 발간 위치와 공식 원문 또는 공식 검색 링크를 표시합니다.';
    status('1,800판례와 496조문 문항을 읽었습니다. 두 게임의 5급부터 시작하거나 취득한 급수를 복습하세요.'); renderAll();
    if (state.session?.status === 'running' && remainingMs(state.session) <= 0) finishExam();
  } catch (error) { $('sg-load-status').classList.add('sg-error'); status(error.message); }
}
