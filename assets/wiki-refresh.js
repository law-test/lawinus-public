(() => {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dataCache = new Map();
  async function data(file) {
    if (!dataCache.has(file)) dataCache.set(file, fetch('assets/'+file+'?v=20261009').then(response => { if(!response.ok) throw new Error('자료를 불러오지 못했습니다.'); return response.json(); }));
    return dataCache.get(file);
  }
  const safeUrl=value=>{if(typeof value!=='string'||!value.trim())return null;try{const url=new URL(value,location.href);return /^(https?:)$/.test(url.protocol)?url.href:null;}catch(_){return null;}};
  function sourceLink(item) {
    if(item.officialUrl)return '<a href="'+esc(safeUrl(item.officialUrl))+'" target="_blank" rel="noopener noreferrer">공식 원문</a>';
    return '<a href="https://www.law.go.kr/LSW/precSc.do?menuId=7&query='+encodeURIComponent(item.caseNumber)+'" target="_blank" rel="noopener noreferrer">공식 사이트에서 검색</a>';
  }
  async function library() {
    const host=document.getElementById('standardLibrary'); if(!host||host.dataset.ready)return; host.dataset.ready='1';
    try {
      const bank=await data('standard_cases.json'),cases=bank.cases;
      let limit=30;
      const search=host.querySelector('[data-standard-search]'),subject=host.querySelector('[data-standard-subject]'),grade=host.querySelector('[data-standard-grade]');
      function render() {
        const q=search.value.trim().toLowerCase(),threshold=Number(grade.value);
        const matches=cases.filter(item=>(!subject.value||item.subject===subject.value)&&item.gradeThreshold<=threshold&&(!q||(item.title+' '+item.caseNumber+' '+item.summary+' '+item.articleRefs.join(' ')).toLowerCase().includes(q)));
        host.querySelector('.plus-status').textContent='발간 표준판례 '+cases.length.toLocaleString()+'개 · 현재 범위 '+matches.length.toLocaleString()+'개 · 누적 급수 기준';
        host.querySelector('.standard-grid').innerHTML=matches.slice(0,limit).map(item=>'<article class="standard-card"><span class="standard-tag">'+esc(item.subject)+'</span><span class="standard-tag">'+esc(item.gradeLabel)+'</span><h3>'+esc(item.title)+'</h3><p class="plus-status">'+esc(item.citation||item.caseNumber)+' · '+esc(item.bookSource)+'</p><p class="standard-summary">'+esc(item.summary.slice(0,210))+(item.summary.length>210?'…':'')+'</p><details><summary>판단 문장과 관련 조문</summary><p class="standard-summary">'+esc(item.summary)+'</p><p>'+esc(item.articleRefs.join(' · ')||'대표 조문 별도 확인')+'</p></details><div class="plus-actions">'+sourceLink(item)+'<a class="secondary" href="concept-map.html?case='+encodeURIComponent(item.id)+'">지도에서 보기</a><a class="secondary" href="standard-game.html">급수 도전</a></div></article>').join('') || '<p>검색 조건에 맞는 판례가 없습니다.</p>';
        host.querySelector('[data-standard-more]').hidden=limit>=matches.length;
      }
      [search,subject,grade].forEach(control=>control.addEventListener(control===search?'input':'change',()=>{limit=30;render();}));
      host.querySelector('[data-standard-more]').addEventListener('click',()=>{limit+=30;render();});render();
    } catch(error){host.querySelector('.plus-status').textContent=error.message;host.dataset.ready='';}
  }
  async function editorial() {
    const host=document.getElementById('editorialArchive');if(!host||host.dataset.ready)return;host.dataset.ready='1';
    try {
      const archive=await data('board-editorials.json'),select=host.querySelector('select');
      host.querySelector('.plus-status').textContent='빈 날짜 '+archive.dayCount+'일 · 하루 '+archive.postsPerDay+'개 · 운영 학습글 '+archive.items.length+'개';
      const dates=[...new Set(archive.items.map(item=>item.coverageDate))].sort().reverse();
      select.innerHTML=dates.map(date=>'<option value="'+date+'">'+date+' · '+archive.postsPerDay+'개</option>').join('');
      function render(){const date=select.value;host.querySelector('[data-editorial-posts]').innerHTML=archive.items.filter(item=>item.coverageDate===date).map(item=>'<article class="editorial-post"><h3>'+esc(item.title)+'</h3><div class="editorial-meta">민법위키 운영팀 · 자료 기준일 '+esc(item.coverageDate)+' · 실제 등록일 '+esc(item.publishedAt.slice(0,10))+'</div><p>'+esc(item.body)+'</p><a href="'+esc(safeUrl(item.sourceUrl))+'" target="_blank" rel="noopener noreferrer">판례 원문 확인</a></article>').join('');}
      select.addEventListener('change',render);render();
    }catch(error){host.querySelector('.plus-status').textContent=error.message;host.dataset.ready='';}
  }
  async function shorts() {
    const host=document.getElementById('shortsLibrary');if(!host||host.dataset.ready)return;host.dataset.ready='1';
    try{
      const sources=await Promise.all(['shorts-old.json','shorts-more.json'].map(file=>data(file).catch(()=>({items:[]}))));
      const clips=sources.reverse().flatMap(source=>source.items||source.videos||[]).map(clip=>({...clip,video:clip.video||clip.videoUrl,cover:clip.cover||clip.coverUrl,caseCitation:clip.caseCitation||clip.citation}));let limit=12;
      function render(){host.querySelector('.plus-status').textContent='판례 영상 '+clips.length+'편 · 합성음성 · 직접 제작한 학습 콘텐츠';host.querySelector('.shorts-grid').innerHTML=clips.slice(0,limit).map(clip=>'<article class="shorts-card"><video controls playsinline preload="none" poster="'+esc(clip.cover)+'" src="'+esc(clip.video)+'" aria-label="'+esc(clip.title)+'"></video><h3>'+esc(clip.id)+' · '+esc(clip.title)+'</h3><p>'+esc(clip.subject)+(clip.grade?' · '+esc(clip.grade):'')+' · '+esc(clip.caseCitation||clip.caseNumber||'')+'</p><div class="shorts-links">'+Object.entries(clip.channels||{}).filter(([name,url])=>safeUrl(url)).map(([name,url])=>'<a href="'+esc(safeUrl(url))+'" target="_blank" rel="noopener noreferrer">'+esc(name)+'</a>').join('')+(clip.officialUrl?'<a href="'+esc(safeUrl(clip.officialUrl))+'" target="_blank" rel="noopener noreferrer">판례 원문</a>':'')+(clip.subtitleUrl?'<a href="'+esc(clip.subtitleUrl)+'" download>자막</a>':'')+'<a href="https://lawtest.or.kr/" target="_blank" rel="noopener noreferrer">법학경시대회</a></div></article>').join('');host.querySelector('[data-shorts-more]').hidden=limit>=clips.length;}
      host.querySelector('[data-shorts-more]').addEventListener('click',()=>{limit+=12;render();});render();
    }catch(error){host.querySelector('.plus-status').textContent=error.message;host.dataset.ready='';}
  }
  async function recentPapers() {
    const host=document.getElementById('recentResearch');if(!host||host.dataset.ready)return;host.dataset.ready='1';
    try{const papers=await data('recent_papers.json');const items=papers.items||[];host.innerHTML='<h2>최근 법학 논문</h2><p class="plus-status">확인 '+esc(papers.checkedAt)+' · '+items.length+'건 · 제공기관의 서지정보</p><ul>'+items.map(item=>'<li><a href="'+esc(safeUrl(item.url))+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+'</a><small>'+esc([item.author,item.journal,item.year,item.topic].filter(Boolean).join(' · '))+'</small></li>').join('')+'</ul>';if(!items.length)host.innerHTML+='<p>새 논문 조회를 확인 중입니다. 조문별 기존 KCI 목록을 함께 이용하세요.</p>';}
    catch(error){host.innerHTML='<p>'+esc(error.message)+'</p>';host.dataset.ready='';}
  }
  function route(){const hash=decodeURIComponent(location.hash.slice(1));if(hash==='표준판례')library();if(hash==='자유게시판')editorial();if(hash==='판례쇼츠')shorts();if(hash==='민법뉴스')recentPapers();}
  window.addEventListener('hashchange',route);route();
})();
