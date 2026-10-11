(() => {
  'use strict';
  function setupNavigation() {
    const bar=document.querySelector('.menubar'),header=document.querySelector('header');
    const toc=document.getElementById('articleContents'),toggle=document.getElementById('navtoggle');
    if(toggle&&toc) {
      const sync=()=>{
        const open=toc.classList.contains('open');
        toggle.setAttribute('aria-expanded',String(open));
        if(open&&innerWidth<=768)requestAnimationFrame(()=>{
          if(!toc.classList.contains('open')||innerWidth>768)return;
          toc.scrollTop=0;
          const top=scrollY+toc.getBoundingClientRect().top-(header?.getBoundingClientRect().bottom||0)-12;
          window.scrollTo({top:Math.max(0,top),behavior:'instant'});
        });
      };
      new MutationObserver(sync).observe(toc,{attributes:true,attributeFilter:['class']}); sync();
    }
    if(!bar||!header)return;
    const updateHeader=()=>document.documentElement.style.setProperty('--wiki-header-height',header.getBoundingClientRect().height+'px');
    new ResizeObserver(updateHeader).observe(header); updateHeader();
    const dropFor=item=>item?.querySelector(':scope>.mdrop,:scope>.ddrop');
    const triggerFor=item=>item?.querySelector(':scope>a');
    const closeItem=item=>{item.classList.remove('menu-open');delete item.dataset.menuClickOpened;triggerFor(item)?.setAttribute('aria-expanded','false');};
    function placeDrop(item) {
      const drop=dropFor(item); if(!drop||!drop.getClientRects().length)return;
      document.documentElement.style.setProperty('--wiki-menu-top',Math.max(8,Math.min(header.getBoundingClientRect().bottom+4,innerHeight-120))+'px');
      if(innerWidth<=768)return;
      drop.style.removeProperty('left');drop.style.removeProperty('right');
      const rect=drop.getBoundingClientRect();
      if(rect.right>innerWidth-12) {drop.style.left='auto';drop.style.right=drop.classList.contains('ddrop')?'calc(100% + 8px)':'0';}
      if(drop.getBoundingClientRect().left<12) {drop.style.right='auto';drop.style.left=(12-item.getBoundingClientRect().left)+'px';}
      const placed=drop.getBoundingClientRect(),origin=item.getBoundingClientRect();
      if(drop.classList.contains('mdrop')){item.style.setProperty('--wiki-menu-bridge-left',placed.left-origin.left+'px');item.style.setProperty('--wiki-menu-bridge-width',Math.max(placed.width,origin.width)+'px');}
      else item.style.setProperty('--wiki-submenu-bridge-left',placed.left<origin.left?'-12px':'100%');
    }
    const linksIn=drop=>Array.from(drop.querySelectorAll('a[href]')).filter(a=>a.closest('.mdrop,.ddrop')===drop&&a.getClientRects().length);
    function openAndFocus(item,last=false) {
      const drop=dropFor(item);if(!drop)return false;
      item.classList.remove('menu-keyboard-closed');item.classList.add('menu-open');triggerFor(item)?.setAttribute('aria-expanded','true');
      placeDrop(item);const links=linksIn(drop);(last?links.at(-1):links[0])?.focus();return true;
    }
    bar.addEventListener('pointerover',event=>{
      const item=event.target.closest('.mitem,.ditem.has');if(!item)return;
      item.classList.remove('menu-keyboard-closed');requestAnimationFrame(()=>placeDrop(item));
    });
    bar.addEventListener('focusin',event=>{
      const item=event.target.closest('.mitem,.ditem.has');if(!item)return;
      item.classList.remove('menu-keyboard-closed');requestAnimationFrame(()=>placeDrop(item));
    });
    bar.addEventListener('keydown',event=>{
      const link=event.target.closest('a[href]');if(!link)return;
      const item=link.parentElement,level=link.closest('.mdrop,.ddrop');
      if(event.key==='Escape') {
        const root=link.closest('.mitem');if(!root)return;event.preventDefault();event.stopPropagation();
        triggerFor(root)?.focus();root.querySelectorAll('.menu-open').forEach(closeItem);closeItem(root);root.classList.add('menu-keyboard-closed');return;
      }
      if((event.key==='ArrowDown'||event.key==='ArrowUp')&&!level&&dropFor(item)) {event.preventDefault();openAndFocus(item,event.key==='ArrowUp');return;}
      if(event.key==='ArrowRight'&&dropFor(item)) {event.preventDefault();openAndFocus(item);return;}
      if(event.key==='ArrowLeft'&&level?.classList.contains('ddrop')) {event.preventDefault();const parent=level.parentElement;triggerFor(parent)?.focus();closeItem(parent);parent.classList.add('menu-keyboard-closed');return;}
      if(level&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();const links=linksIn(level),i=links.indexOf(link);let next=event.key==='Home'?0:event.key==='End'?links.length-1:(i+(event.key==='ArrowDown'?1:-1)+links.length)%links.length;links[next]?.focus();
      }
    });
    let previousHash=decodeURI(location.hash);
    const current=()=>{
      const hash=decodeURI(location.hash),entry=document.querySelector('.plus-entry-cards');
      if(hash!==previousHash){const feedback=document.getElementById('pageSearchStatus');if(feedback){feedback.hidden=true;feedback.textContent='';}}
      previousHash=hash;
      if(entry)entry.hidden=!!hash&&hash!=='#제1조';
      bar.querySelectorAll('.mtop[href]').forEach(a=>{if(a.getAttribute('href')===hash)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    };
    window.addEventListener('hashchange',current);current();
  }
  setupNavigation();
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dataCache = new Map();
  async function data(file) {
    if (!dataCache.has(file)) dataCache.set(file, fetch('assets/'+file+'?v=20261009').then(response => { if(!response.ok) throw new Error('자료를 불러오지 못했습니다.'); return response.json(); }));
    return dataCache.get(file);
  }
  const safeUrl=value=>{if(typeof value!=='string'||!value.trim())return null;try{const url=new URL(value,location.href);return /^(https?:)$/.test(url.protocol)?url.href:null;}catch(_){return null;}};
  function sourceLink(item) {
    if(item.officialUrl)return '<a href="'+esc(safeUrl(item.officialUrl))+'" target="_blank" rel="noopener noreferrer">공식 원문</a>';
    const searchPage=String(item.caseNumber||'').includes('헌')?'detcSc.do':'precSc.do';
    return '<a href="https://www.law.go.kr/LSW/'+searchPage+'?menuId=7&query='+encodeURIComponent(item.caseNumber)+'" target="_blank" rel="noopener noreferrer">공식 사이트에서 검색</a>';
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
        host.querySelector('.standard-grid').innerHTML=matches.slice(0,limit).map(item=>'<article class="standard-card"><span class="standard-tag">'+esc(item.subject)+'</span><span class="standard-tag">'+esc(item.gradeLabel)+'</span><h3>'+esc(item.title)+'</h3><p class="plus-status">'+esc(item.citation||item.caseNumber)+' · '+esc(item.bookSource)+'</p><p class="standard-summary">'+esc(item.summary.slice(0,210))+(item.summary.length>210?'…':'')+'</p><details><summary>판단 문장과 관련 조문</summary><p class="standard-summary">'+esc(item.summary)+'</p><p>'+esc(item.articleRefs.join(' · ')||'대표 조문 별도 확인')+'</p></details><div class="plus-actions">'+sourceLink(item)+'<a class="secondary" href="concept-map.html?v=20261011-ui&amp;case='+encodeURIComponent(item.id)+'">지도에서 보기</a><a class="secondary" href="standard-game.html">급수 도전</a></div></article>').join('') || '<p>검색 조건에 맞는 판례가 없습니다.</p>';
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
      host.querySelector('.plus-status').textContent='학습글 '+archive.items.length+'개 · 날짜별 보기';
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
