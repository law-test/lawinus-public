(() => {
  'use strict';
  const script=document.currentScript,bankUrl=script?new URL('standard_cases.json',script.src).href:'assets/standard_cases.json';
  const aliases={대한민국헌법:'헌법',대한민국민법:'민법',대한민국형법:'형법'},byArticle=new Map(),observed=new WeakSet();
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
    const card=node('article',null,'article-standard-card');card.dataset.standardCase=record.id;const head=node('div',null,'article-standard-meta');
    head.append(node('span',record.gradeLabel,'article-standard-grade'),node('span',record.citation||record.caseNumber));card.append(head,node('h3',record.title));
    const body=String(record.summary||'');card.append(node('p',body.length>240?body.slice(0,240)+'…':body,'article-standard-excerpt'));
    if(body.length>240){const details=node('details',null,'article-standard-full');details.append(node('summary','판단문 전체 읽기'),node('p',body));card.append(details);}
    const actions=node('div',null,'article-standard-actions'),destination=officialUrl(record),official=node('a',destination.label),map=node('a','판례를 지도에서 보기');
    official.href=destination.url;official.target='_blank';official.rel='noopener noreferrer';map.href='concept-map.html?case='+encodeURIComponent(record.id);actions.append(official,map);card.append(actions);return card;
  }
  function casePanel(target,info){
    let old=target.querySelector(':scope>.article-standard-cases');if(old?.dataset.articleKey===info.key&&old.dataset.ready==='true')return;if(old)old.remove();
    const records=byArticle.get(info.key)||[];if(!loaded&&!failed||loaded&&!records.length)return;
    const panel=node('section',null,'article-standard-cases');panel.dataset.articleKey=info.key;panel.setAttribute('aria-label',info.label+' 대한민국 표준판례');
    const heading=node('div',null,'article-standard-heading');heading.append(node('h2','대한민국 표준판례'));
    if(failed){panel.append(heading,node('p','표준판례 자료를 불러오지 못했습니다.','article-standard-status'));const retry=node('button','다시 불러오기','article-standard-more');retry.type='button';retry.addEventListener('click',load);panel.append(retry);}
    else{panel.dataset.ready='true';heading.append(node('span',`${records.length}판례`,'article-standard-count'));const list=node('div',null,'article-standard-list'),more=node('button',null,'article-standard-more');more.type='button';let shown=0;
      const append=count=>{const next=records.slice(shown,shown+count);next.forEach(record=>list.append(caseCard(record)));shown+=next.length;more.hidden=shown>=records.length;more.textContent=`표준판례 더 보기 (${shown}/${records.length})`;};
      more.addEventListener('click',()=>append(5));panel.append(heading,list,more);append(3);}
    const bar=target.querySelector(':scope>.article-map-actions');if(bar)bar.insertAdjacentElement('afterend',panel);else afterLaw(target,panel);
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
    scan();load();const main=document.querySelector('main');if(main)new MutationObserver(changes=>{if(changes.some(change=>!change.target.closest?.('.article-standard-cases,.article-map-actions')))schedule();}).observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    window.addEventListener('hashchange',schedule);window.CivilWikiStandardArticles={rescan:schedule,getCoverage:()=>({loaded,articleKeys:byArticle.size})};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
