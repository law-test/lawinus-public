(function () {
  'use strict';
  var lawCodes = { '민법': 'civil', '형법': 'criminal', '헌법': 'constitutional', '대한민국헌법': 'constitutional' };
  var countries = { DE: '독일', JP: '일본', US: '미국' };
  var data = null, byArticle = {}, scheduled = false;
  var script = document.currentScript;
  var dataUrl = script ? new URL('foreign-correspondence.json?v=20261009', script.src).href : 'assets/foreign-correspondence.json?v=20261009';

  function node(tag, value, className) {
    var el = document.createElement(tag);
    if (value != null) el.textContent = String(value);
    if (className) el.className = className;
    return el;
  }
  function articleNo(value) {
    var match = String(value || '').replace(/\s/g, '').match(/^(?:제)?(\d+)(?:조)?(?:의(\d+))?$/);
    return match ? '제' + match[1] + '조' + (match[2] ? '의' + match[2] : '') : '';
  }
  function decodedAnchor(id) {
    if (!/^lawsub-[0-9a-f]+$/i.test(id || '')) return null;
    try {
      var bytes = id.slice(7).match(/../g).map(function (part) { return parseInt(part, 16); });
      var fields = new TextDecoder().decode(new Uint8Array(bytes)).split('|');
      var code = lawCodes[fields[1]];
      if (!code || lawCodes[fields[0]] !== code) return null;
      return { lawCode: code, articleNo: articleNo(fields[2]) };
    } catch (_) { return null; }
  }
  function safeSourceUrl(value) {
    try {
      var url = new URL(value);
      var allowed = ['www.gesetze-im-internet.de', 'laws.e-gov.go.jp', 'www.archives.gov', 'www.nysenate.gov'];
      return url.protocol === 'https:' && allowed.indexOf(url.hostname) !== -1 ? url.href : '';
    } catch (_) { return ''; }
  }
  function revisionLabel(row) {
    var revision = row.revision || {};
    if (revision.law_revision_id) return revision.law_revision_id;
    if (revision.sourceVersionDate) return '공식 페이지 판본 ' + revision.sourceVersionDate;
    if (revision.standangabe && revision.standangabe.length) return revision.standangabe.join(' / ');
    return revision.ratifiedDate ? '비준 ' + revision.ratifiedDate : '수집 시점의 공식 제공 원문';
  }
  function recordCard(row) {
    var details = node('details', null, 'foreign-record');
    var country = countries[row.foreignCountry] || row.foreignCountry;
    var jurisdiction = row.jurisdiction === 'US-NY' ? '뉴욕 주' : row.jurisdiction === 'US-Federal' ? '연방헌법' : '';
    details.appendChild(node('summary', country + (jurisdiction ? ' · ' + jurisdiction : '') + ' · ' + row.foreignLaw + ' ' + row.foreignArticle + ' — ' + row.correspondenceType));
    details.appendChild(node('p', row.comparisonNote, 'foreign-comparison-note'));
    details.appendChild(node('p', '원문 범위: ' + row.textScope, 'foreign-meta'));
    var original = node('pre', row.originalText, 'foreign-original');
    original.lang = row.originalLanguage || '';
    details.appendChild(original);
    if (row.translation && row.translation.text) {
      details.appendChild(node('p', row.translation.kind === 'machine' ? '기계 번역 · 원문 확인 필요' : '한국어 번역', 'foreign-meta'));
      var translated = node('div', row.translation.text, 'foreign-translation');
      translated.lang = 'ko';
      details.appendChild(translated);
    }
    details.appendChild(node('p', '원문 검토일 ' + row.reviewedAt + ' · 기준일 ' + row.asof + ' · ' + revisionLabel(row), 'foreign-meta'));
    var url = safeSourceUrl(row.sourceUrl);
    if (url) {
      var link = node('a', '공식 출처 원문 확인');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      details.appendChild(link);
    }
    return details;
  }
  function insert(target, lawCode, number, after) {
    if (!number || !lawCode || !target) return;
    var key = lawCode + ':' + number;
    var old = Array.from(target.children).find(function (el) { return el.classList.contains('foreign-correspondence'); });
    if (old && old.dataset.foreignKey === key) return;
    if (old) old.remove();
    var records = byArticle[key] || [];
    var panel = node('details', null, 'foreign-correspondence');
    panel.dataset.foreignKey = key;
    panel.appendChild(node('summary', records.length ? '외국 대응 조문 · 원문 ' + records.length + '건' : '외국 대응 조문 · 검토 대기'));
    panel.appendChild(node('p', '같은 주제나 유사한 기능을 비교하는 자료입니다. 일대일로 동일한 법리·요건·효과를 가진다는 뜻은 아닙니다.', 'foreign-meta'));
    panel.appendChild(node('p', data.coverage.status + ' · 검토일 ' + data.reviewedAt, 'foreign-meta'));
    if (records.length) records.forEach(function (row) { panel.appendChild(recordCard(row)); });
    else panel.appendChild(node('p', data.coverage.defaultUnmappedMessage, 'foreign-unreviewed'));
    panel.appendChild(node('p', data.coverage.usScope, 'foreign-meta'));
    if (after && after.parentNode === target) after.insertAdjacentElement('afterend', panel);
    else target.appendChild(panel);
  }
  function scan() {
    scheduled = false;
    if (!data) return;
    document.querySelectorAll('section.art[data-art]').forEach(function (section) {
      var number = articleNo(section.dataset.art);
      var body = section.querySelector(':scope > .lawtext');
      if (number && body) insert(section, 'civil', number, body);
    });
    document.querySelectorAll('.law-article-item[id]').forEach(function (item) {
      var info = decodedAnchor(item.id);
      if (info) insert(item, info.lawCode, info.articleNo, item.querySelector(':scope > .law-article-body'));
    });
    document.querySelectorAll('.law-subject-single').forEach(function (single) {
      var atom = single.querySelector('[data-atom-law][data-atom-article]');
      var info = atom ? { lawCode: lawCodes[atom.dataset.atomLaw], articleNo: articleNo(atom.dataset.atomArticle) } : decodedAnchor(decodeURIComponent(location.hash.slice(1)));
      if (info && info.lawCode) insert(single, info.lawCode, info.articleNo, single.querySelector(':scope > .lawtext'));
    });
  }
  function schedule() {
    if (scheduled || !data) return;
    scheduled = true;
    setTimeout(scan, 40);
  }
  function installStyle() {
    var style = node('style');
    style.textContent = '.foreign-correspondence{margin:20px 0;padding:12px 16px;border:1px solid var(--line,#dbe2ea);border-radius:10px;background:var(--surface,#f7fafc)}.foreign-correspondence>summary{cursor:pointer;font-weight:700}.foreign-record{margin:12px 0;padding:10px;border-top:1px solid var(--line,#dbe2ea)}.foreign-record>summary{cursor:pointer;font-weight:600;overflow-wrap:anywhere}.foreign-meta{font-size:12px;color:var(--muted,#5c6875);line-height:1.7}.foreign-comparison-note,.foreign-unreviewed{line-height:1.7}.foreign-original{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:14px;line-height:1.9;max-height:32rem;overflow:auto;border:1px solid var(--line,#dbe2ea);border-radius:8px;padding:14px;background:var(--card,#fff);color:inherit}.foreign-translation{white-space:pre-wrap;line-height:1.8}.foreign-record>a{display:inline-block;margin-top:6px;font-size:13px}@media(max-width:600px){.foreign-correspondence{padding:10px}.foreign-original{padding:10px;font-size:13px}}';
    document.head.appendChild(style);
  }
  function start() {
    installStyle();
    fetch(dataUrl).then(function (response) {
      if (!response.ok) throw new Error('Foreign-law source data unavailable');
      return response.json();
    }).then(function (payload) {
      if (!payload || !Array.isArray(payload.items) || !payload.coverage) throw new Error('Invalid foreign-law data');
      data = payload;
      data.items.forEach(function (row) {
        var number = articleNo(row.articleNo);
        if (!number || !lawCodes[row.koreanLaw] || lawCodes[row.koreanLaw] !== row.lawCode || !row.originalText) return;
        var key = row.lawCode + ':' + number;
        (byArticle[key] || (byArticle[key] = [])).push(row);
      });
      scan();
      new MutationObserver(function (mutations) {
        if (mutations.some(function (mutation) {
          var target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
          return target && !target.closest('.foreign-correspondence') && (target.closest('.law-subject-slot') || target.closest('.law-subject-single') || target.closest('.law-article-item'));
        })) schedule();
      }).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
      window.addEventListener('hashchange', schedule);
      window.CivilWikiForeignCorrespondence = { rescan: schedule, coverage: data.coverage };
    }).catch(function (error) {
      console.warn('외국 대응 조문 원문을 불러오지 못했습니다.', error);
      document.querySelectorAll('section.art[data-art] > .lawtext').forEach(function (body) {
        body.insertAdjacentElement('afterend', node('p', '외국 대응 조문 자료를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.', 'foreign-meta'));
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}());
