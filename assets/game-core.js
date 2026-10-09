// Browser-only learning records. This module stores no certificate identity fields.
export const GRADES = Object.freeze([
  { label: '5급', count: 50 }, { label: '4급', count: 150 },
  { label: '3급', count: 300 }, { label: '2급', count: 500 },
  { label: '1급', count: 1000 }, { label: '특급', count: 1800 }
]);
export const STATUTE_GRADES = Object.freeze([
  { label: '5급', count: 50 }, { label: '4급', count: 150 },
  { label: '3급', count: 300 }, { label: '2급', count: 400 }, { label: '1급', count: 496 }
]);
export const SUBJECT_QUOTAS = Object.freeze([{subject:'헌법',count:3},{subject:'민법',count:4},{subject:'형법',count:3}]);
export const gradesForTrack = track => track === 'statute' ? STATUTE_GRADES : GRADES;
export const EXAM_DURATION_MS = 10 * 60 * 1000;
export const QUESTION_COUNT = 10;
export const PROGRESS_KEY = 'lawinus-standard-game-v1';
export const STATUTE_PROGRESS_KEY = 'lawinus-statute-game-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const gradeValid = (index, grades = GRADES) => Number.isInteger(index) && index >= 0 && index < grades.length;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export const bankCases = bank => Array.isArray(bank) ? bank : bank?.cases || [];
export function normalizeAnswer(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, '').trim();
}
export function isCorrectAnswer(value, answers) {
  const normalized = normalizeAnswer(value);
  return !!normalized && Array.isArray(answers) && answers.some(answer => normalizeAnswer(answer) === normalized);
}
function playable(record) {
  return typeof record?.id === 'string' && record.id && (record.caseNumber || record.citation) && record.title &&
    typeof record.question?.prompt === 'string' && Array.isArray(record.question.answers) &&
    record.question.answers.length > 0 && record.question.answers.every(answer => typeof answer === 'string' && answer.trim());
}
export function validateCaseBank(bank) {
  const records = bankCases(bank);
  assert(records.length === 1800, '표준판례 1,800개의 자료를 모두 읽지 못했습니다.');
  assert(new Set(records.map(record => record.id)).size === records.length, '자료 식별자가 중복되어 게임을 시작할 수 없습니다.');
  assert(records.every(playable), '빈칸 문제 또는 답안이 없는 자료가 있습니다.');
  for (const grade of GRADES) {
    const count = records.filter(record => Number(record.gradeThreshold) <= grade.count).length;
    assert(count === grade.count, `${grade.label}의 누적 범위가 ${grade.count}개와 일치하지 않습니다.`);
  }
  return records;
}
export function validateStatuteBank(bank) {
  const records = bankCases(bank);
  assert(records.length === 496 && new Set(records.map(record=>record.id)).size === 496, '발간 워크북 조문 496문항을 모두 읽지 못했습니다.');
  assert(records.every(record=>playable(record) && record.isStatute && record.originalStatement === record.summary && record.question.prompt.replace('______',record.question.answers[0]) === record.originalStatement), '조문 빈칸과 원문 복원 결과가 일치하지 않습니다.');
  for(const grade of STATUTE_GRADES) assert(records.filter(record=>record.gradeThreshold<=grade.count).length===grade.count, `${grade.label} 조문 학습 범위가 올바르지 않습니다.`);
  return records;
}
export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function selectCases(bank, gradeIndex, count = QUESTION_COUNT, random = Math.random, previousIds = [], grades = GRADES) {
  assert(gradeValid(gradeIndex, grades), '급수가 올바르지 않습니다.');
  const seen = new Set();
  const pool = bankCases(bank).filter(record => {
    if (!playable(record) || Number(record.gradeThreshold) > grades[gradeIndex].count || seen.has(record.id)) return false;
    seen.add(record.id); return true;
  });
  assert(pool.length >= count, '이 급수에서 출제할 수 있는 판례가 부족합니다.');
  const previous = new Set(previousIds), fresh = pool.filter(record => !previous.has(record.id));
  if (count === QUESTION_COUNT) {
    const selected = SUBJECT_QUOTAS.flatMap(quota=> {
      const eligible = pool.filter(record=>record.subject===quota.subject), unused = eligible.filter(record=>!previous.has(record.id));
      assert(eligible.length>=quota.count, `${quota.subject} ${quota.count}문항을 확보하지 못해 출제를 중단했습니다. 자료를 확인해 주세요.`);
      return shuffle(unused.length>=quota.count?unused:eligible,random).slice(0,quota.count);
    });
    return shuffle(selected,random);
  }
  return shuffle(fresh.length >= count ? fresh : pool, random).slice(0, count);
}
export function freshProgress(track = 'case') {
  return { schema: 'lawinus-standard-game/1', track: track === 'statute' ? 'statute' : 'case', unlockedIndex: 0, passedGrades: [], session: null, previousCaseIds: [], settledIds: [], history: [] };
}
function unlockedFromPassed(passed, grades = GRADES) {
  let index = 0;
  while (index < grades.length - 1 && passed.includes(index)) index++;
  return index;
}
export function restoreProgress(raw, expectedTrack) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return freshProgress(expectedTrack); }
  if (!parsed || parsed.schema !== 'lawinus-standard-game/1') return freshProgress(expectedTrack);
  const track = parsed.track === 'statute' ? 'statute' : 'case';
  if(expectedTrack && track !== expectedTrack) return freshProgress(expectedTrack);
  const state = freshProgress(track), grades = gradesForTrack(track);
  state.passedGrades = [...new Set((Array.isArray(parsed.passedGrades) ? parsed.passedGrades : []).filter(index=>gradeValid(index,grades)))].sort((a, b) => a - b);
  // Only a contiguous sequence opens the next challenge; a damaged maximum cannot skip a grade.
  let contiguous = 0;
  while (state.passedGrades.includes(contiguous) && contiguous < grades.length) contiguous++;
  state.passedGrades = state.passedGrades.filter(index => index < contiguous);
  state.unlockedIndex = unlockedFromPassed(state.passedGrades, grades);
  state.previousCaseIds = (Array.isArray(parsed.previousCaseIds) ? parsed.previousCaseIds : []).filter(id => typeof id === 'string').slice(0, QUESTION_COUNT);
  state.settledIds = (Array.isArray(parsed.settledIds) ? parsed.settledIds : []).filter(id => typeof id === 'string').slice(-100);
  state.history = (Array.isArray(parsed.history) ? parsed.history : []).filter(record => typeof record?.id === 'string' && gradeValid(record.gradeIndex,grades) && Number.isInteger(record.score) && record.score >= 0 && record.score <= 100).slice(-30);
  const session = parsed.session;
  if (session && typeof session.id === 'string' && gradeValid(session.gradeIndex,grades) && session.gradeIndex <= state.unlockedIndex &&
    ['running', 'graded'].includes(session.status) && Number.isFinite(session.startedAt) && session.deadlineAt === session.startedAt + EXAM_DURATION_MS &&
    Array.isArray(session.questions) && session.questions.length === QUESTION_COUNT && new Set(session.questions.map(question => question.id)).size === QUESTION_COUNT &&
    session.questions.every(question => typeof question.id === 'string' && typeof question.prompt === 'string' && Array.isArray(question.answers) && question.answers.every(answer => typeof answer === 'string'))) {
    state.session = clone(session);
    state.session.userAnswers = Object.fromEntries(session.questions.map(question => [question.id, typeof session.userAnswers?.[question.id] === 'string' ? session.userAnswers[question.id].slice(0, 160) : '']));
    if (session.status === 'graded' && (!session.result || !Number.isInteger(session.result.score) || !Array.isArray(session.result.details))) state.session = null;
  }
  return state;
}
export function beginExam(progress, bank, gradeIndex, { now = Date.now(), random = Math.random, id } = {}) {
  const state = restoreProgress(progress), grades = gradesForTrack(state.track);
  assert(gradeValid(gradeIndex,grades) && gradeIndex <= state.unlockedIndex, '아직 열리지 않은 급수입니다. 이전 급수부터 합격해 주세요.');
  assert(state.session?.status !== 'running', '진행 중인 급수게임을 먼저 채점해 주세요.');
  const selected = selectCases(bank, gradeIndex, QUESTION_COUNT, random, state.previousCaseIds, grades);
  selected.sort((a, b) => SUBJECT_QUOTAS.findIndex(quota => quota.subject === a.subject) - SUBJECT_QUOTAS.findIndex(quota => quota.subject === b.subject));
  const sessionId = id || globalThis.crypto?.randomUUID?.() || `exam-${now}-${Math.random().toString(36).slice(2)}`;
  assert(!state.settledIds.includes(sessionId), '이미 채점한 학습 기록입니다.');
  state.session = {
    id: sessionId, track: state.track, gradeIndex, startedAt: now, deadlineAt: now + EXAM_DURATION_MS, status: 'running',
    questions: selected.map(record => ({ id: record.id, subject:record.subject, prompt: record.question.prompt, answers: [...record.question.answers], explanation: record.question.explanation || '', source: record.question.source || record.bookSource || '' })),
    userAnswers: Object.fromEntries(selected.map(record => [record.id, '']))
  };
  state.previousCaseIds = selected.map(record => record.id);
  return state;
}
export function updateAnswer(progress, sessionId, questionId, value, now = Date.now()) {
  const state = restoreProgress(progress), session = state.session;
  if (!session || session.id !== sessionId || session.status !== 'running' || now >= session.deadlineAt || !session.questions.some(question => question.id === questionId)) return state;
  session.userAnswers[questionId] = String(value).slice(0, 160);
  return state;
}
export function remainingMs(session, now = Date.now()) {
  return session?.status === 'running' ? Math.max(0, session.deadlineAt - now) : 0;
}
export function settleExam(progress, sessionId, now = Date.now()) {
  const state = restoreProgress(progress), session = state.session, grades = gradesForTrack(state.track);
  assert(session && session.id === sessionId, '진행 중인 학습 기록이 달라졌습니다. 화면을 다시 확인해 주세요.');
  if (session.status === 'graded') return { state, result: session.result, alreadyGraded: true };
  assert(!state.settledIds.includes(sessionId), '이미 채점된 학습 기록입니다.');
  const details = session.questions.map(question => ({
    id: question.id, subject:question.subject, prompt: question.prompt, answer: session.userAnswers[question.id] || '', acceptedAnswers: [...question.answers],
    correct: isCorrectAnswer(session.userAnswers[question.id], question.answers), explanation: question.explanation, source: question.source
  }));
  const correctCount = details.filter(detail => detail.correct).length, score = correctCount * 10, passed = score >= 60;
  const wasCurrent = session.gradeIndex === state.unlockedIndex;
  if (passed && !state.passedGrades.includes(session.gradeIndex)) state.passedGrades.push(session.gradeIndex);
  state.passedGrades.sort((a, b) => a - b);
  state.unlockedIndex = unlockedFromPassed(state.passedGrades,grades);
  const result = {
    id: sessionId, track: state.track, gradeIndex: session.gradeIndex, score, correctCount, questionCount: QUESTION_COUNT, passed, perfect: correctCount === QUESTION_COUNT,
    promoted: passed && wasCurrent && session.gradeIndex < grades.length - 1,
    nextGradeIndex: state.unlockedIndex, completedAt: now, timedOut: now >= session.deadlineAt, details
  };
  session.status = 'graded'; session.result = result;
  state.settledIds.push(sessionId); state.settledIds = state.settledIds.slice(-100);
  state.history.push({ id: sessionId, gradeIndex: session.gradeIndex, score, completedAt: now }); state.history = state.history.slice(-30);
  return { state, result, alreadyGraded: false };
}
export function makePracticeRound(bank, gradeIndex, mode, { random = Math.random, previousIds = [] } = {}) {
  assert(mode === 'source', '복습게임 종류가 올바르지 않습니다.');
  const available = selectCases(bank, gradeIndex, Math.min(50, bankCases(bank).filter(record => Number(record.gradeThreshold) <= GRADES[gradeIndex].count && playable(record)).length), random, previousIds);
  const titleSeen = new Set(), numberSeen = new Set();
  const unique = available.filter(record => {
    if (titleSeen.has(record.title) || numberSeen.has(record.caseNumber)) return false;
    titleSeen.add(record.title); numberSeen.add(record.caseNumber); return true;
  });
  assert(unique.length >= 5, '서로 구별할 수 있는 판례 5개가 필요합니다.');
  const fresh = unique.filter(record => !previousIds.includes(record.id)), selected = (fresh.length >= 5 ? fresh : unique).slice(0, 5);
  const options = shuffle(selected.map(record => ({ id: record.id, label: record.caseNumber })), random);
  return { mode, gradeIndex, items: selected.map(record => ({ id: record.id, prompt: record.summary, options: clone(options), recordId: record.id })) };
}
export function gradePractice(round, answers) {
  const details = round.items.map(item => ({ id: item.id, correct: answers[item.id] === item.id }));
  return { correctCount: details.filter(detail => detail.correct).length, total: details.length, details };
}
export function validateIdentity(name, birthYear, now = Date.now()) {
  const cleaned = String(name || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  assert(cleaned && Array.from(cleaned).length <= 30, '이름을 1자 이상 30자 이내로 입력해 주세요.');
  assert(/^[\p{L}\p{M} .'-]+$/u.test(cleaned) && /\p{L}/u.test(cleaned), '이름에는 문자, 띄어쓰기, 마침표, 작은따옴표, 하이픈을 사용할 수 있습니다.');
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(now)));
  assert(/^\d{4}$/.test(String(birthYear)) && Number(birthYear) >= 1900 && Number(birthYear) <= currentYear, `생년은 1900년부터 ${currentYear}년까지 네 자리로 입력해 주세요.`);
  return { name: cleaned, birthYear: String(birthYear) };
}
export function seoulDateLabel(timestamp) {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' }).formatToParts(new Date(timestamp));
  const value = type => parts.find(part => part.type === type)?.value;
  return `${value('year')}년 ${value('month')}월 ${value('day')}일`;
}
export async function buildCertificatePdf(PDFLib, fontkit, fontBytes, { kind, name, birthYear, result, now = Date.now() }) {
  const track=result?.track==='statute'?'statute':'case', grades=gradesForTrack(track), king=track==='statute'?'조문왕':'판례왕';
  assert(['pass', 'king'].includes(kind), '기록 종류가 올바르지 않습니다.');
  assert(result && gradeValid(result.gradeIndex,grades) && result.questionCount === QUESTION_COUNT && result.passed && result.score >= 60 && result.score <= 100, '합격한 학습 결과가 필요합니다.');
  if (kind === 'king') assert(result.perfect && result.correctCount === QUESTION_COUNT && result.score === 100, `${king} 상장은 10문제 모두 정답일 때 만들 수 있습니다.`);
  const identity = validateIdentity(name, birthYear, now), grade = grades[result.gradeIndex];
  const pdf = await PDFLib.PDFDocument.create(); pdf.registerFontkit(fontkit);
  // Keep the full Korean font: this fontkit subset can omit Hangul glyphs in viewers.
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const charset = new Set(font.getCharacterSet());
  assert(Array.from(identity.name).every(char => charset.has(char.codePointAt(0))), '이름의 일부 문자를 PDF 글꼴에서 표시할 수 없습니다. 한글 또는 영문 표기를 확인해 주세요.');
  const page = pdf.addPage([595.28, 841.89]), ink = PDFLib.rgb(0.12, 0.11, 0.16);
  pdf.setTitle(kind === 'king' ? `민법위키 ${king} 학습 상장` : `민법위키 ${king} ${grade.label} 학습 합격증`);
  pdf.setAuthor('민법위키'); pdf.setCreator('민법위키 학습게임'); pdf.setCreationDate(new Date(now)); pdf.setModificationDate(new Date(now));
  const draw = (text, x, y, size) => page.drawText(text, { x, y, size, font, color: ink });
  const center = (text, y, size) => draw(text, (595.28 - font.widthOfTextAtSize(text, size)) / 2, y, size);
  const fit = (text, maxWidth, preferred = 24, min = 12) => Math.max(min, Math.min(preferred, preferred * maxWidth / font.widthOfTextAtSize(text, preferred)));
  const wrap = (text, maxWidth, size) => {
    const lines = []; let line = '';
    for (const word of text.split(/\s+/u)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line.trim()) lines.push(line.trim()); return lines;
  };
  draw('민법위키 학습 결과', 75, 745, 12);
  center(kind === 'king' ? '상     장' : '합 격 증', 662, 36);
  draw(kind === 'king' ? `${king}상` : `${king} ${grade.label} 학습 합격`, 75, 570, 21);
  const nameSize = fit(identity.name, 335, 25, 12);
  draw(identity.name, 520 - font.widthOfTextAtSize(identity.name, nameSize), 529, nameSize);
  const yearText = `${identity.birthYear}년생`;
  draw(yearText, 520 - font.widthOfTextAtSize(yearText, 16), 502, 16);
  const scope = track==='statute' ? `표준판례 워크북 조문 ${grade.label} 학습단계 누적 ${grade.count}문항` : `대한민국 표준판례 ${grade.label} 누적 ${grade.count.toLocaleString('ko-KR')}개`;
  const body = kind === 'king'
    ? `위 사람은 ${scope} 범위의 헌법 3문제, 민법 4문제, 형법 3문제인 10분 10문제 오픈북 학습에서 모든 문제에 정답을 기록하였으므로 ${king} 학습 상장을 드립니다.`
    : `위 사람은 ${scope} 범위의 헌법 3문제, 민법 4문제, 형법 3문제인 10분 10문제 오픈북 학습에서 60점 이상의 합격 기준을 충족하였으므로 이 학습 합격증을 드립니다.`;
  const lines = wrap(body, 445, 17); lines.forEach((line, index) => draw(line, 75, 429 - index * 31, 17));
  center(`학습 결과 ${result.score}점 / 10문제 중 ${result.correctCount}개 정답`, 244, 15);
  if(track==='statute') center('조문 급수는 민법위키 학습단계이며 공식 기출 급수가 아닙니다.',279,10);
  center(seoulDateLabel(result.completedAt || now), 216, 17);
  center('민 법 위 키', 144, 29);
  center('학습용 기록 - 공인 자격 또는 대회 수상 증명서가 아닙니다.', 79, 10);
  return pdf.save();
}
