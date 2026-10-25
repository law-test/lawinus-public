(() => {
  'use strict';
  const script=document.currentScript,bankUrl=script?new URL('standard_cases.json',script.src).href:'assets/standard_cases.json';
  const aliases={대한민국헌법:'헌법',대한민국민법:'민법',대한민국형법:'형법'},byArticle=new Map(),observed=new WeakSet(),panels=new WeakMap();
  let loaded=false,loading=false,failed=false,scheduled=false;
  function node(tag,text,cls){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;}
  function articleInfo(law,number){
    const name=aliases[String(law||'').replace(/\s+/gu,'')]||String(law||'').replace(/\s+/gu,'');
    const m=String(number||'').replace(/\s+/gu,'').match(/^(?:제)?(\d+)(?:조)?(?:의(\d+))?/u);
    if(!name||!m)return null;const article=`제${Number(m[1])}조${m[2]?'의'+Number(m[2]):''}`;
    return{law:name,article,key:name+'|'+article,label:name+' '+article};
  }
  function fromReference(value){const m=String(value||'').replace(/\s+/gu,'').match(/^(.+?)제(\d+)조(?:의(\d+))?/u);return m?articleInfo(m[1],`제${m[2]}조${m[3]?'의'+m[3]:''}`):null;}
  function fromAnchor(id){
    if(!/^lawsub-[0-9a-f]+$/i.test(id||''))return null;
    try{const bytes=id.slice(7).match(/../g).map(p=>parseInt(p,16)),f=new TextDecoder().decode(new Uint8Array(bytes)).split('|');return articleInfo(f[1],f[2]);}catch(_){return null;}
  }
  function targetInfo(target){
    if(target.matches('section.art[data-art]'))return articleInfo('민법',target.dataset.art);
    if(target.matches('.law-article-item[id]'))return fromAnchor(target.id);
    const atom=target.querySelector('[data-atom-law][data-atom-article]');
    if(atom)return articleInfo(atom.dataset.atomLaw,atom.dataset.atomArticle);
    try{return fromAnchor(decodeURIComponent(location.hash.slice(1)));}catch(_){return null;}
  }
  function afterLaw(target,el){
    const body=target.querySelector(':scope>.lawtext,:scope>.law-article-body');
    if(body)body.insertAdjacentElement('afterend',el);else{const heading=target.querySelector(':scope>h1,:scope>h2,:scope>summary');if(heading)heading.insertAdjacentElement('afterend',el);else target.prepend(el);}
  }
  function toolbar(target,info){
    let bar=target.querySelector(':scope>.article-map-actions');if(bar?.dataset.articleKey===info.key)return;if(bar)bar.remove();
    bar=node('div',null,'article-map-actions');bar.dataset.articleKey=info.key;const link=node('a','개념지도로 보기','article-map-button');
    let hash='';try{hash=decodeURIComponent(location.hash.slice(1));}catch(_){}
    const anchors=[target.id,hash,target.closest('section.art[id]')?.id].filter(Boolean),source=anchors.find(id=>/^lawsub-[0-9a-f]+$/i.test(id)&&fromAnchor(id)?.key===info.key)||anchors.find(id=>info.law==='민법'&&id===info.article)||anchors.find(id=>/^민사특별법-제\d+조(?:의\d+)?-\d+$/u.test(id));
    link.href='concept-map.html?article='+encodeURIComponent(info.label)+(source?'&from='+encodeURIComponent(source):'');link.setAttribute('aria-label',info.label+' 개념지도로 보기');bar.append(link);afterLaw(target,bar);
  }
  function officialUrl(record){
    if(record.officialUrl)try{const url=new URL(record.officialUrl);if(url.protocol==='https:'&&/(^|\.)(law\.go\.kr|scourt\.go\.kr)$/.test(url.hostname))return{url:url.href,label:'공식 원문'};}catch(_){}
    const page=record.caseNumber.includes('헌')?'detcSc':'precSc';return{url:`https://www.law.go.kr/LSW/${page}.do?query=${encodeURIComponent(record.caseNumber)}`,label:'공식 사이트에서 찾기'};
  }
  function caseCard(record){
    const card=node('article',null,'paper flat case article-standard-card');card.dataset.standardCase=record.id;const head=node('div',null,'article-standard-meta');
    const citation=node('a',record.citation||record.caseNumber);citation.href=officialUrl(record).url;citation.target='_blank';citation.rel='noopener noreferrer';
    head.append(node('span','표준판례 '+record.gradeLabel,'article-standard-grade'),citation);card.append(head,node('h3',record.title));
    const body=String(record.summary||'');card.append(node('p',body.length>240?body.slice(0,240)+'…':body,'article-standard-excerpt'));
    if(body.length>240){const details=node('details',null,'article-standard-full');details.append(node('summary','판단문 전체 읽기'),node('p',body));card.append(details);}
    const actions=node('div',null,'article-standard-actions'),destination=officialUrl(record),official=node('a',destination.label),map=node('a','판례를 지도에서 보기');
    official.href=destination.url;official.target='_blank';official.rel='noopener noreferrer';map.href='concept-map.html?case='+encodeURIComponent(record.id);actions.append(official,map);card.append(actions);return card;
  }
  function sourceId(value){
    try{const url=new URL(value,location.href);if(!/(^|\.)law\.go\.kr$/.test(url.hostname))return null;
      for(const key of ['precSeq','detcSeq']){const id=url.searchParams.get(key);if(/^\d+$/.test(id||''))return key+':'+id;}
    }catch(_){}return null;
  }
  function caseIdentity(value,date){
    const text=String(value||''),datePattern=/((?:19|20)\d{2})[.\-]\s*(\d{1,2})[.\-]\s*(\d{1,2})/u,dateMatch=String(date||'').match(datePattern)||text.match(datePattern);
    const day=dateMatch?`${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`:null;
    const court=text.includes('헌법재판소')?'헌법재판소':text.includes('대법원')?'대법원':null;
    const numbers=Array.from(text.replace(/\s+/gu,'').matchAll(/(\d{2,4})([가-힣]+)(\d+)/gu),match=>{
      let year=match[1];if(year.length===2&&day){let full=Math.floor(Number(day.slice(0,4))/100)*100+Number(year);if(full>Number(day.slice(0,4)))full-=100;year=String(full);}
      return year+match[2]+match[3];
    });return{day,court,numbers};
  }
  function sameCase(record,original){
    const anchor=original.querySelector('.ptitle a'),id=sourceId(record.officialUrl),otherId=sourceId(anchor?.href);
    if(id&&otherId)return id===otherId;
    const first=caseIdentity((record.citation||'')+' '+record.caseNumber,record.date),second=caseIdentity(original.querySelector('.ptitle')?.textContent,original.querySelector('.pmeta')?.textContent);
    return first.day&&first.day===second.day&&first.court&&first.court===second.court&&first.numbers.some(number=>second.numbers.includes(number));
  }
  function arrange(list,elements){
    let next=list.firstElementChild;for(const element of elements){if(next!==element)list.insertBefore(element,next);next=element.nextElementSibling;}
  }
  function casePanel(target,info){
    const records=(byArticle.get(info.key)||[]).slice().sort((a,b)=>a.gradeThreshold-b.gradeThreshold);
    const legacyHeading=Array.from(target.querySelectorAll('h2')).find(heading=>!heading.closest('.article-standard-cases')&&/^판례(?:\s|$|\()/u.test(heading.textContent.trim()));
    let entry=panels.get(target);if(entry&&(!entry.panel.isConnected||entry.key!==info.key))entry=null;
    if(!entry){
      if(!legacyHeading&&!records.length&&!failed)return;
      const panel=node('section',null,'article-standard-cases article-merged-cases'),heading=node('h2','판례'),list=node('div',null,'article-case-list');
      panel.dataset.articleKey=info.key;panel.setAttribute('aria-label',info.label+' 판례');panel.append(heading,list);
      if(legacyHeading)legacyHeading.insertAdjacentElement('beforebegin',panel);else{const bar=target.querySelector(':scope>.article-map-actions');if(bar)bar.insertAdjacentElement('afterend',panel);else afterLaw(target,panel);}
      entry={key:info.key,panel,heading,list,originals:[],cards:new Map(),notes:[]};panels.set(target,entry);
    }
    if(legacyHeading){
      let next=legacyHeading.nextElementSibling;while(next?.matches('p.note')){const note=next;next=next.nextElementSibling;entry.panel.insertBefore(note,entry.list);entry.notes.push(note);}
      legacyHeading.remove();
    }
    const incoming=Array.from(target.querySelectorAll('.paper.flat.case')).filter(card=>!card.dataset.standardCase&&!entry.originals.includes(card));
    for(const original of incoming){original.dataset.originalCase='true';entry.originals.push(original);}
    for(const record of records)if(!entry.cards.has(record.id))entry.cards.set(record.id,caseCard(record));
    const ordinary=[];
    for(const original of entry.originals){
      const record=records.find(record=>sameCase(record,original));
      if(!record){ordinary.push(original);continue;}
      const card=entry.cards.get(record.id);let details=card.querySelector(':scope>.article-case-original');
      if(!details){details=node('details',null,'article-case-original');details.append(node('summary','관련 사건 정보'));card.append(details);}
      if(original.parentElement!==details){original.classList.remove('case','limited-hidden');details.append(original);}
    }
    const standard=records.map(record=>entry.cards.get(record.id));arrange(entry.list,[...standard,...ordinary]);
    const label=`판례 <span class="note">(${standard.length+ordinary.length}건${records.length?' · 표준판례 '+records.length+'건':''})</span>`;
    if(entry.heading.innerHTML!==label)entry.heading.innerHTML=label;
    for(const note of entry.notes){note.hidden=records.length>0&&/판례\s*없음|판례가\s*없/u.test(note.textContent);if(records.length&&note.textContent.includes('사건번호를 누르면'))note.textContent='사건번호나 공식 자료 버튼으로 판례를 확인합니다.';}
    entry.panel.dataset.ready=String(loaded);entry.panel.dataset.standardCount=String(records.length);
    let status=entry.panel.querySelector(':scope>.article-standard-status');
    if(failed&&!status){status=node('div',null,'article-standard-status');status.append(node('p','표준판례 자료를 불러오지 못했습니다.'));const retry=node('button','다시 불러오기','article-standard-retry');retry.type='button';retry.addEventListener('click',load);status.append(retry);entry.panel.insertBefore(status,entry.list);}
    if(!failed&&status)status.remove();
    document.dispatchEvent(new CustomEvent('civilwiki-cases-updated',{detail:{section:target.closest('section.art')}}));
  }
  function mount(target){if(!target.isConnected)return;const info=targetInfo(target);if(!info)return;toolbar(target,info);casePanel(target,info);}
  const visibility=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)mount(entry.target);},{rootMargin:'350px 0px'}):null;
  function scan(){
    scheduled=false;
    for(const section of document.querySelectorAll('section.art.on[data-art]')){
      if(articleInfo('민법',section.dataset.art))mount(section);
      for(const target of section.querySelectorAll('.law-article-item[id],.law-subject-single')){if(!observed.has(target)){observed.add(target);if(visibility)visibility.observe(target);else mount(target);}if(target.getClientRects().length&&target.getBoundingClientRect().top<innerHeight+350)mount(target);}
    }
    for(const target of document.querySelectorAll('main>.law-subject-single'))if(target.getClientRects().length)mount(target);
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(scan);}}
  async function load(){
    if(loading)return;loading=true;failed=false;
    try{const response=await fetch(bankUrl);if(!response.ok)throw Error('case data');const payload=await response.json();if(!Array.isArray(payload.cases)||payload.cases.length!==1800)throw Error('case data');
      byArticle.clear();for(const record of payload.cases){const seen=new Set();for(const ref of record.articleRefs||[]){const info=fromReference(ref);if(!info||seen.has(info.key))continue;seen.add(info.key);if(!byArticle.has(info.key))byArticle.set(info.key,[]);byArticle.get(info.key).push(record);}}loaded=true;
    }catch(_){failed=true;}finally{loading=false;schedule();}
  }
  function start(){
    scan();load();const main=document.querySelector('main');if(main)new MutationObserver(changes=>{if(changes.some(change=>{
      const target=change.target.nodeType===1?change.target:change.target.parentElement;
      return target&&!target.closest('.article-standard-cases,.article-map-actions,#gameCenter,.game-page,[data-game-panel]');
    }))schedule();}).observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    window.addEventListener('hashchange',schedule);window.CivilWikiStandardArticles={rescan:schedule,getCoverage:()=>({loaded,articleKeys:byArticle.size})};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
