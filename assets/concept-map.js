let THREE;

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const subjects=['민법','헌법','형법'];
const colors={'민법':'#b18aff','헌법':'#72a1ff','형법':'#ef8ac7'};
const anchors={'민법':{x:0,y:125,z:100},'헌법':{x:-150,y:-90,z:-95},'형법':{x:165,y:-75,z:-45}};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={cases:[],graph:null,data:{nodes:[],links:[]},selected:null,hover:null,focus:null,articleFocus:null,articleAnchor:null,query:'',rotate:!reduced,dimension:3,fallback:false,rotationPause:0,userSelected:false};
const articleLaws=new Map([['민법','민법'],['헌법','헌법'],['형법','형법']]);
let cameraTimer,fitTimer;
const highlight=new Set(), neighborIds=new Set();
const articlePattern=/^(.+?)\s+제(\d+)조(?:의(\d+))?$/;
function normalizeArticle(value){
  const match=String(value||'').normalize('NFKC').trim().match(/^([\p{L}\p{N}\s·ㆍ∙・․()\-]{1,180}?)\s*제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,3}))?$/u);
  if(!match||Number(match[2])<1||(match[3]&&Number(match[3])<1))return null;
  const aliases={'대한민국헌법':'헌법','대한민국민법':'민법','대한민국형법':'형법'};
  let law=match[1].replace(/\s+/g,'');law=aliases[law]||law;
  if(!law)return null;
  return `${law} 제${Number(match[2])}조${match[3]?'의'+Number(match[3]):''}`;
}
function articleParts(key){const match=key?.match(articlePattern);return match?{law:match[1],number:`제${match[2]}조${match[3]?'의'+match[3]:''}`}:null;}
function articleMatches(record,key){return record.articleRefs.some(reference=>normalizeArticle(reference)===key);}
function articleSourceLink(key){const parts=articleParts(key);if(!parts)return 'index.html';const officialLaw=parts.law==='헌법'?'대한민국헌법':parts.law;return `https://www.law.go.kr/법령/${encodeURIComponent(officialLaw)}/${encodeURIComponent(parts.number)}`;}
function articleBackLink(key){
  const parts=articleParts(key);if(!parts)return 'index.html';
  if(state.articleFocus===key&&state.articleAnchor)return `index.html#${encodeURIComponent(state.articleAnchor)}`;
  if(parts.law==='민법')return `index.html#${encodeURIComponent(parts.number)}`;
  if(parts.law==='헌법'||parts.law==='형법'){
    const law=parts.law==='헌법'?'대한민국헌법':parts.law,bytes=new TextEncoder().encode([parts.law,law,parts.number].join('|'));
    return 'index.html#lawsub-'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  return 'index.html';
}
function articleAnchor(value,key){
  const anchor=String(value||'').replace(/^#/,'');
  if(articleParts(key)?.law==='민법'&&anchor===articleParts(key).number)return anchor;
  if(/^민사특별법-제\d{1,4}조(?:의\d{1,3})?-\d{1,4}$/u.test(anchor))return anchor;
  if(!/^lawsub-(?:[0-9a-f]{2}){1,512}$/i.test(anchor))return null;
  try{
    const bytes=anchor.slice(7).match(/../g).map(byte=>parseInt(byte,16)),parts=new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes)).split('|');
    return parts.length===3&&normalizeArticle(`${parts[1]} ${parts[2]}`)===key?anchor:null;
  }catch(_){return null;}
}
function queryArticle(params){
  const value=params.get('article')||'',law=params.get('law');
  if(!params.has('law'))return value;
  const key=normalizeArticle(value),requestedLaw=articleParts(normalizeArticle(`${law} 제1조`))?.law;
  if(key)return articleParts(key).law===requestedLaw?key:'';
  return `${law} ${value}`;
}

function topicOf(c){
  const ref=c.articleRefs[0]?.match(articlePattern),law=ref?.[1],n=Number(ref?.[2]||0);
  if(c.subject==='민법'){
    if(law!=='민법')return '관련 법률과 민사절차';
    if(n<=2)return '법원과 신의성실';
    if(n<98)return '인 · 법인 · 법률행위';
    if(n<147)return '의사표시와 대리';
    if(n<185)return '기간과 소멸시효';
    if(n<280)return '소유와 점유';
    if(n<373)return '물권과 담보';
    if(n<536)return '채권의 효력과 보전';
    if(n<766)return '계약과 불법행위';
    if(n<997)return '친족과 가족';
    return '상속과 유류분';
  }
  if(c.subject==='헌법')return law!=='헌법'?'헌법심판과 관련 법률':n<10?'헌법의 기본원리':n<40?'기본권':n<65?'국회와 입법':n<101?'정부와 권력통제':'재판과 헌법심판';
  if(law!=='형법')return '형사절차와 특별법';
  return n<30?'범죄 성립과 위법성':n<87?'책임과 형벌':n<164?'국가와 사회의 법익':n<250?'공공의 안전과 신용':n<329?'생명 · 신체 · 자유':'재산과 거래';
}
function inScope(){
  const subject=$('map-subject').value,threshold=Number($('map-grade').value);
  return state.cases.filter(c=>c.gradeThreshold<=threshold&&(subject==='all'||c.subject===subject));
}
function hash(text){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function point(id,center,spread=85){const h=hash(id),a=(h%1000)/1000*Math.PI*2,b=((h>>>10)%1000)/1000*Math.PI;return{x:center.x+spread*Math.sin(b)*Math.cos(a),y:center.y+spread*Math.cos(b),z:center.z+spread*Math.sin(b)*Math.sin(a)};}
function sampler(pool,count){if(pool.length<=count)return pool;const result=[];for(let i=0;i<count;i++)result.push(pool[Math.floor(i*pool.length/count)]);return result;}
function selectedCases(pool){
  if(state.focus){
    const focus=pool.find(c=>c.id===state.focus);if(!focus){state.focus=null;return selectedCases(pool);}
    const related=pool.filter(c=>c.id!==focus.id&&c.articleRefs.some(x=>focus.articleRefs.includes(x)));
    const rest=pool.filter(c=>c.id!==focus.id&&!related.includes(c)&&c.subject===focus.subject&&topicOf(c)===topicOf(focus));
    return [focus,...related.slice(0,60),...sampler(rest,45)];
  }
  if(state.query){
    const matches=pool.filter(matchesQuery);if(matches.length)return sampler(matches,190);
  }
  return subjects.flatMap(s=>sampler(pool.filter(c=>c.subject===s),$('map-subject').value==='all'?60:175));
}
function matchesQuery(c){const q=state.query.toLowerCase();return !q||`${c.title} ${c.caseNumber} ${c.summary} ${c.articleRefs.join(' ')}`.toLowerCase().includes(q);}

function makeData(){
  if(state.articleFocus)return makeArticleData();
  const pool=inScope(),display=selectedCases(pool),nodes=[],links=[],known=new Set(),topicCenters=new Map();
  const selected=pool.find(c=>c.id===state.selected);if(selected&&!display.some(c=>c.id===selected.id))display.unshift(selected);
  const add=n=>{if(!known.has(n.id)){known.add(n.id);nodes.push(n);}return n;};
  const active=subjects.filter(s=>display.some(c=>c.subject===s));
  const topicNames={};for(const s of active)topicNames[s]=[...new Set(display.filter(c=>c.subject===s).map(topicOf))];
  for(const s of active){const a=active.length===1?{x:0,y:0,z:0}:anchors[s];add({id:`subject:${s}`,name:s,type:'subject',subject:s,color:colors[s],fx:a.x,fy:a.y,fz:a.z,...a});
    topicNames[s].forEach((t,i)=>{const angle=i/topicNames[s].length*Math.PI*2,center={x:a.x+105*Math.cos(angle),y:a.y+62*Math.sin(angle),z:a.z+62*Math.sin(angle*1.5)};topicCenters.set(`${s}:${t}`,center);add({id:`topic:${s}:${t}`,name:t,type:'topic',subject:s,color:colors[s],topic:t,fx:center.x,fy:center.y,fz:center.z,...center});links.push({source:`subject:${s}`,target:`topic:${s}:${t}`,relation:'분야 분류'});});
  }
  for(const c of display){
    if(nodes.length>=395)break;
    const topic=topicOf(c),center=topicCenters.get(`${c.subject}:${topic}`),article=c.articleRefs[0],articleId=`article:${article}`;
    if(!known.has(articleId)){add({id:articleId,name:article,type:'article',subject:c.subject,color:colors[c.subject],article,topic,...point(articleId,center,34)});links.push({source:`topic:${c.subject}:${topic}`,target:articleId,relation:'조문 체계상 분류'});}
    add({id:c.id,name:c.title,type:'case',subject:c.subject,color:colors[c.subject],case:c,topic,...point(c.id,center,65)});
    links.push({source:articleId,target:c.id,relation:'발간본 대표 조문'});
  }
  if(state.dimension===2)for(const n of nodes){n.z=0;if('fz' in n)n.fz=0;}
  if(state.selected&&!known.has(state.selected))state.selected=null;
  if(state.hover&&!known.has(state.hover))state.hover=null;
  highlight.clear();neighborIds.clear();
  if(state.query)for(const n of nodes)if(n.case&&matchesQuery(n.case))highlight.add(n.id);
  if(state.selected&&known.has(state.selected)){highlight.add(state.selected);markNeighbors(state.selected,links);}
  state.data={nodes,links};
  if($('map-context'))$('map-context').hidden=true;$('map-reset').textContent='선택 초기화';
  $('map-total').textContent=`선택 범위 ${pool.length.toLocaleString()}판례`;
  $('map-visible').textContent=`${nodes.filter(n=>n.type==='case').length}판례 · ${nodes.length}노드 · ${links.length}연결`;
  return state.data;
}
function makeArticleData(){
  const key=state.articleFocus,parts=articleParts(key),subject=articleLaws.get(parts.law),color=colors[subject]||'#d6c5f4',pool=inScope(),matches=pool.filter(record=>articleMatches(record,key)),display=sampler(matches,190);
  const selected=matches.find(record=>record.id===state.selected);if(selected&&!display.some(record=>record.id===selected.id))display.unshift(selected);
  const lawId=`law:${parts.law}`,articleId=`article:${key}`,nodes=[
    {id:lawId,name:parts.law,type:'subject',law:parts.law,article:key,subject,color,x:-140,y:0,z:0,fx:-140,fy:0,fz:0},
    {id:articleId,name:key,type:'article',article:key,subject,color,x:0,y:0,z:0,fx:0,fy:0,fz:0}
  ],links=[{source:lawId,target:articleId,relation:'법률 조문'}];
  for(const record of display){nodes.push({id:record.id,name:record.title,type:'case',subject:record.subject,color:colors[record.subject],case:record,topic:topicOf(record),...point(record.id,{x:100,y:0,z:0},75)});links.push({source:articleId,target:record.id,relation:'발간본 대표 조문'});}
  if(state.dimension===2)for(const node of nodes){node.z=0;if('fz' in node)node.fz=0;}
  const known=new Set(nodes.map(node=>node.id));if(!known.has(state.selected))state.selected=articleId;state.hover=null;
  highlight.clear();neighborIds.clear();highlight.add(state.selected);markNeighbors(state.selected,links);state.data={nodes,links};
  if($('map-context')){$('map-context').hidden=false;$('map-context').textContent=key;}$('map-reset').textContent='전체 지도 보기';
  $('map-total').textContent=`선택 범위 ${pool.length.toLocaleString()}판례`;$('map-visible').textContent=`${matches.length}관련 판례 · ${nodes.length}노드 · ${links.length}연결`;
  return state.data;
}
function endpoint(x){return typeof x==='object'?x.id:x;}
function markNeighbors(id,links=state.data.links){neighborIds.clear();for(const l of links){const s=endpoint(l.source),t=endpoint(l.target);if(s===id)neighborIds.add(t);if(t===id)neighborIds.add(s);}}
function selectedOrNear(n){return highlight.has(n.id)||neighborIds.has(n.id)||state.hover===n.id;}
function isHighlightedLink(l){return highlight.has(endpoint(l.source))||highlight.has(endpoint(l.target))||neighborIds.has(endpoint(l.source))&&neighborIds.has(endpoint(l.target));}

function labelSprite(text,color,size=15){
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  context.font='500 34px "Noto Sans KR", sans-serif';const width=Math.ceil(context.measureText(text).width)+34;canvas.width=width;canvas.height=64;
  context.font='500 34px "Noto Sans KR", sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillStyle=color;context.shadowColor=color;context.shadowBlur=7;context.fillText(text,width/2,32);
  const material=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false});
  const sprite=new THREE.Sprite(material);sprite.scale.set(size*width/64,size,1);return sprite;
}
function nodeObject(n){
  const group=new THREE.Group(),important=selectedOrNear(n),radius=n.type==='subject'?11:n.type==='topic'?5.5:n.type==='article'?(important?6.5:2.8):important?3.5:2.1;
  const color=important?'#eddaff':n.color;
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:n.type==='case'&&!important?.8:1});
  const geometry=n.type==='article'?new THREE.OctahedronGeometry(radius):new THREE.SphereGeometry(radius,n.type==='case'?8:16,8);
  group.add(new THREE.Mesh(geometry,material));
  const glow=new THREE.Mesh(new THREE.SphereGeometry(radius*1.9,8,6),new THREE.MeshBasicMaterial({color,transparent:true,opacity:important?.16:.055,depthWrite:false,blending:THREE.AdditiveBlending}));group.add(glow);
  const focusedCase=n.type==='case'&&(state.selected===n.id||state.hover===n.id);
  if(n.type==='subject'||n.type==='topic'||n.type==='article'&&important||focusedCase){const text=n.type==='case'?n.case.caseNumber:n.name;const label=labelSprite(text,n.type==='subject'?'#ebdcff':important?'#f5eaff':n.color,n.type==='subject'?25:n.type==='topic'?17:13);label.position.set(0,-radius-10,0);group.add(label);}
  return group;
}
function initGraph(){
  if(typeof window.ForceGraph3D!=='function')throw new Error('지도 라이브러리를 불러오지 못했습니다.');
  const graph=new window.ForceGraph3D($('graph'),{controlType:'orbit',rendererConfig:{antialias:true,alpha:true}});
  state.graph=graph;
  // The bundled node-drag handler emits pointerup without a pointerId.
  // Keep background rotation and node selection, without conflicting node dragging.
  graph.backgroundColor('#00000000').showNavInfo(false).enableNodeDrag(false).nodeThreeObject(nodeObject).nodeLabel(n=>`<strong>${esc(n.type==='case'?n.case.caseNumber:n.name)}</strong>${n.type==='case'?`<br>${esc(n.name)}`:''}`)
    .linkColor(l=>isHighlightedLink(l)?'#d2a4ff':'#8c59bc').linkOpacity(.4).linkWidth(l=>isHighlightedLink(l)?.65:.12)
    .linkDirectionalParticles(l=>isHighlightedLink(l)?2:0).linkDirectionalParticleSpeed(.003).linkDirectionalParticleColor(()=> '#dec0ff').linkDirectionalParticleWidth(1.5)
    .linkLabel(l=>esc(l.relation)).warmupTicks(reduced?95:35).cooldownTicks(230).d3AlphaDecay(.032).d3VelocityDecay(.43)
    .onNodeClick(n=>selectNode(n)).onNodeHover(n=>{state.hover=n?.id??null;$('graph').style.cursor=n?'pointer':'grab';});
  graph.d3Force('charge').strength(-28);graph.d3Force('link').distance(l=>l.relation==='분야 분류'?110:l.relation==='조문 체계상 분류'?42:state.articleFocus?60:17).strength(.55);
  const geometry=new THREE.BufferGeometry(),points=[];let seed=13579;for(let i=0;i<850;i++){seed=(seed*16807)%2147483647;const x=(seed/2147483647-.5)*2900;seed=(seed*16807)%2147483647;const y=(seed/2147483647-.5)*1900;seed=(seed*16807)%2147483647;const z=(seed/2147483647-.5)*2300;points.push(x,y,z);}
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));graph.scene().add(new THREE.Points(geometry,new THREE.PointsMaterial({color:'#9d7bc8',size:1.2,transparent:true,opacity:.45,depthWrite:false})));
  graph.cameraPosition({x:0,y:70,z:620});
  const controls=graph.controls();controls.enableDamping=true;controls.dampingFactor=.08;controls.autoRotate=state.rotate;controls.autoRotateSpeed=.42;
  controls.addEventListener('start',()=>{state.rotationPause=Date.now()+8000;});controls.addEventListener('end',()=>{state.rotationPause=Date.now()+5000;});
  graph.onEngineStop(()=>{if(!state.focus&&!state.query&&!state.userSelected)graph.zoomToFit(reduced?0:800,55);});
  const size=()=>{const r=$('graph').getBoundingClientRect();graph.width(r.width).height(r.height);};new ResizeObserver(size).observe($('graph'));size();
  setInterval(()=>{if(state.graph&&!state.fallback)state.graph.controls().autoRotate=state.rotate&&state.dimension===3&&Date.now()>state.rotationPause;},150);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)graph.pauseAnimation();else if(!state.fallback)graph.resumeAnimation();});
}
function refreshStyle(){if(state.graph&&!state.fallback)state.graph.nodeThreeObject(nodeObject).linkWidth(l=>isHighlightedLink(l)?.65:.12).linkDirectionalParticles(l=>isHighlightedLink(l)?2:0);else drawFallback();}
function rebuild({fit=true}={}){
  clearTimeout(cameraTimer);clearTimeout(fitTimer);
  const data=makeData();if(state.graph&&!state.fallback){state.graph.graphData(data);if(fit)fitTimer=setTimeout(()=>{if(!state.userSelected)state.graph.zoomToFit(reduced?0:650,65);},650);}else layoutFallback();
  $('map-loading').hidden=true;
}
function focusCamera(n){
  if(!n||state.selected!==n.id)return;
  const current=state.data.nodes.find(node=>node.id===n.id);if(!current)return;
  if(state.graph&&!state.fallback){const x=current.x||0,y=current.y||0,z=current.z||0;state.graph.cameraPosition({x:x+55,y:y+30,z:z+145},{x,y,z},reduced?0:900);state.rotationPause=Date.now()+18000;}
}
function selectNode(n,{focus=true}={}){
  const current=n&&state.data.nodes.find(node=>node.id===n.id);if(!current)return;
  clearTimeout(cameraTimer);clearTimeout(fitTimer);state.userSelected=true;
  state.selected=current.id;highlight.clear();highlight.add(current.id);markNeighbors(current.id);refreshStyle();renderReader(current);if(focus)focusCamera(current);
}
function selectCase(id){
  const c=state.cases.find(x=>x.id===id);if(!c)return;
  if(state.articleFocus&&!articleMatches(c,state.articleFocus))state.articleFocus=null;
  if(!inScope().some(x=>x.id===id)){$('map-subject').value=c.subject;$('map-grade').value=String(Math.max(Number($('map-grade').value),c.gradeThreshold));}
  state.focus=id;state.selected=id;state.hover=null;state.userSelected=true;rebuild({fit:false});const n=state.data.nodes.find(x=>x.id===id);selectNode(n,{focus:false});cameraTimer=setTimeout(()=>focusCamera(n),400);
}
function selectArticle(value,from=null){
  const key=normalizeArticle(value),parts=articleParts(key);
  if(!parts){state.articleFocus=null;state.articleAnchor=null;runSearch('');renderEmptyReader('조문 주소를 확인해 주세요.');return false;}
  $('map-query').value='';$('search-results').replaceChildren();$('map-subject').value='all';$('map-grade').value='1800';
  state.articleFocus=key;state.articleAnchor=articleAnchor(from,key);state.focus=null;state.selected=`article:${key}`;state.hover=null;state.query='';state.userSelected=true;
  rebuild({fit:false});selectNode(state.data.nodes.find(node=>node.id===state.selected),{focus:false});
  if(state.graph&&!state.fallback)fitTimer=setTimeout(()=>{if(state.articleFocus===key)state.graph.zoomToFit(reduced?0:650,70);},300);
  return true;
}
function articleLink(article){const m=article.match(articlePattern);if(m?.[1]==='민법')return`index.html#${encodeURIComponent('제'+m[2]+'조'+(m[3]?'의'+m[3]:''))}`;return`https://www.law.go.kr/법령/${encodeURIComponent(m?.[1]||article)}`;}
function searchLink(c){return`https://www.law.go.kr/LSW/${c.caseNumber.includes('헌')?'detcSc':'precSc'}.do?query=${encodeURIComponent(c.caseNumber)}`;}
function relatedButtons(candidates,max=8){return candidates.slice(0,max).map(c=>`<button class="related-button" data-case="${esc(c.id)}"><strong>${esc(c.caseNumber)}</strong><br>${esc(c.title)}</button>`).join('');}
function renderReader(n){
  let html='';
  if(n.type==='case'){
    const c=n.case,related=inScope().filter(x=>x.id!==c.id&&x.articleRefs.some(r=>c.articleRefs.includes(r)));
    html=`<span class="reader-tag">${esc(c.subject)} · ${esc(c.gradeLabel)}부터</span><h2 class="reader-title">${esc(c.title)}</h2><p class="reader-cite">${esc(c.citation||c.caseNumber)}<br>선고일 ${esc(c.date)}</p><section class="reader-section"><h3>핵심 판단</h3><p>${esc(c.summary)}</p></section><section class="reader-section"><h3>관련 조문</h3><div class="reader-keywords">${c.articleRefs.map(a=>`<a href="${esc(articleLink(a))}" target="_blank" rel="noopener">${esc(a)} ↗</a>`).join('')}</div></section><section class="reader-section"><a class="reader-link" target="_blank" rel="noopener" href="${esc(c.officialUrl||searchLink(c))}">${c.officialUrl?'공식 원문 열기':'국가법령정보센터에서 찾기'} ↗</a><p class="reader-source">${esc(String(c.bookSource||'').replace(/\bv\d+\b/gi,'').trim())}</p></section>${related.length?`<section class="reader-section"><h3>같은 조문을 다루는 판례</h3>${relatedButtons(related)}</section>`:''}`;
  }else{
    const pool=inScope(),candidates=pool.filter(c=>n.law?articleMatches(c,n.article):n.type==='subject'?c.subject===n.subject:n.type==='topic'?c.subject===n.subject&&topicOf(c)===n.topic:articleMatches(c,n.article));
    html=`<span class="reader-tag">${n.type==='article'?'조문':n.law?'법률':n.type==='topic'?'개념 · 편집상 분류':'학습 영역'}</span><h2 class="reader-title">${esc(n.name)}</h2><p class="reader-cite">관련 판례 ${candidates.length.toLocaleString()}건</p>${n.type==='article'?`<a class="reader-link article-source-link" href="${esc(articleSourceLink(n.article))}" target="_blank" rel="noopener">조문 원문 읽기 ↗</a><a class="reader-link article-back-link" href="${esc(articleBackLink(n.article))}">조문으로 돌아가기 →</a>`:''}<section class="reader-section"><h3>연결된 판례</h3>${candidates.length?relatedButtons(candidates,12):'<p class="empty-message">연결된 표준판례가 없습니다.</p>'}</section>`;
  }
  $('map-reader').innerHTML=html;$('map-reader').scrollTop=0;if($('map-selection-status'))$('map-selection-status').textContent=`선택: ${n.type==='case'?n.case.caseNumber+' · ':''}${n.name}`;
}
function renderEmptyReader(message='지도에서 판례나 개념을 선택하세요.'){
  $('map-reader').innerHTML=`<div class="reader-empty"><h2>${esc(message)}</h2><p>검색 결과나 지도의 점을 선택하면 자료를 읽을 수 있습니다.</p></div>`;if($('map-selection-status'))$('map-selection-status').textContent=message;
}
function runSearch(query){
  state.query=query.trim();state.focus=null;state.articleFocus=null;state.articleAnchor=null;state.selected=null;state.hover=null;state.userSelected=false;
  const pool=inScope(),matches=pool.filter(matchesQuery);const result=$('search-results');
  result.innerHTML=state.query?`<div class="search-count">${matches.length.toLocaleString()}개 판례 · ${matches.length?'선택하여 주변 관계 보기':'다른 검색어를 입력해 보세요'}</div>${matches.slice(0,9).map(c=>`<button class="search-result" data-case="${esc(c.id)}">${esc(c.title)}<small>${esc(c.caseNumber)} · ${esc(c.subject)} · ${esc(c.gradeLabel)}</small></button>`).join('')}`:'';
  rebuild();if(state.query&&matches[0])renderReader({id:matches[0].id,name:matches[0].title,type:'case',case:matches[0]});else renderEmptyReader(state.query?'검색 결과가 없습니다. 다른 검색어를 입력하세요.':'지도에서 판례나 개념을 선택하세요.');
}

// Canvas fallback remains an interactive force view when WebGL is unavailable.
const fallback={zoom:1,panX:0,panY:0,width:0,height:0,pointer:null};
function enableFallback(reason){
  state.fallback=true;state.dimension=2;state.rotate=false;$('graph').hidden=true;$('map-fallback').hidden=false;$('view-badge').textContent='2D MAP';$('map-dimension').textContent='2D 지도';$('map-dimension').disabled=true;$('map-rotate').setAttribute('aria-pressed','false');$('map-rotate').textContent='자동 회전 꺼짐';const guide=$('map-gesture-help')||document.querySelector('.space-bottom span');if(guide)guide.textContent='드래그 이동 · 휠 확대 · 점 선택';
  if(reason){$('map-error').hidden=false;$('map-error').textContent='이 기기에서는 2D 지도로 표시합니다. 검색과 자료 읽기는 그대로 사용할 수 있습니다.';}
  new ResizeObserver(layoutFallback).observe($('map-fallback'));layoutFallback();
}
function layoutFallback(){
  const canvas=$('map-fallback'),r=canvas.getBoundingClientRect();if(!r.width)return;fallback.width=r.width;fallback.height=r.height;canvas.width=r.width*devicePixelRatio;canvas.height=r.height*devicePixelRatio;
  for(const n of state.data.nodes){n.x2=n.x||n.fx||0;n.y2=n.y||n.fy||0;}
  for(let tick=0;tick<45;tick++){
    const lookup=new Map(state.data.nodes.map(n=>[n.id,n]));
    for(const l of state.data.links){const s=lookup.get(endpoint(l.source)),t=lookup.get(endpoint(l.target));if(!s||!t)continue;const dx=t.x2-s.x2,dy=t.y2-s.y2,d=Math.hypot(dx,dy)||1,target=l.relation==='분야 분류'?100:32,k=(d-target)/d*.045;if(t.type!=='subject'&&t.type!=='topic'){t.x2-=dx*k;t.y2-=dy*k;}}
    for(const n of state.data.nodes){if(n.type==='case'){n.x2+=(hash(n.id)%100-50)*.012;n.y2+=((hash(n.id)>>>8)%100-50)*.012;}}
  }fitFallback();drawFallback();
}
function fitFallback(){
  const nodes=state.data.nodes;if(!nodes.length)return;
  const xs=nodes.map(node=>node.x2),ys=nodes.map(node=>node.y2),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  fallback.zoom=Math.min(3,Math.max(.2,Math.min((fallback.width-64)/Math.max(1,maxX-minX),(fallback.height-140)/Math.max(1,maxY-minY))));
  fallback.panX=-(minX+maxX)/2*fallback.zoom;fallback.panY=-(minY+maxY)/2*fallback.zoom;
}
function fallbackPosition(n){return{x:fallback.width/2+n.x2*fallback.zoom+fallback.panX,y:fallback.height/2+n.y2*fallback.zoom+fallback.panY};}
function drawFallback(){
  if(!state.fallback)return;const context=$('map-fallback').getContext('2d');context.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);context.clearRect(0,0,fallback.width,fallback.height);
  const lookup=new Map(state.data.nodes.map(n=>[n.id,n]));
  for(const l of state.data.links){const s=lookup.get(endpoint(l.source)),t=lookup.get(endpoint(l.target));if(!s||!t)continue;const a=fallbackPosition(s),b=fallbackPosition(t);context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.strokeStyle=isHighlightedLink(l)?'#c6a1ef':'#71538e66';context.lineWidth=isHighlightedLink(l)?1.5:.5;context.stroke();}
  for(const n of state.data.nodes){const p=fallbackPosition(n),important=selectedOrNear(n),radius=n.type==='subject'?9:n.type==='topic'?5:n.type==='article'?3:important?4:2;context.beginPath();context.arc(p.x,p.y,radius,0,Math.PI*2);context.fillStyle=important?'#eee0ff':n.color;context.shadowColor=n.color;context.shadowBlur=important?14:7;context.fill();context.shadowBlur=0;if(n.type==='subject'||n.type==='topic'||important){context.fillStyle=important?'#efe4fa':n.color;context.font=n.type==='subject'?'bold 15px sans-serif':'10px sans-serif';context.textAlign='center';context.fillText(n.type==='case'?n.case.caseNumber:n.name,p.x,p.y+radius+15);}}
}
const canvas=$('map-fallback');
canvas.addEventListener('pointerdown',e=>{fallback.pointer={x:e.offsetX,y:e.offsetY,startX:e.offsetX,startY:e.offsetY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!fallback.pointer)return;fallback.panX+=e.offsetX-fallback.pointer.x;fallback.panY+=e.offsetY-fallback.pointer.y;fallback.pointer.x=e.offsetX;fallback.pointer.y=e.offsetY;drawFallback();});
canvas.addEventListener('pointerup',e=>{if(fallback.pointer&&Math.hypot(e.offsetX-fallback.pointer.startX,e.offsetY-fallback.pointer.startY)<5){const closest=state.data.nodes.map(n=>({n,d:Math.hypot(fallbackPosition(n).x-e.offsetX,fallbackPosition(n).y-e.offsetY)})).sort((a,b)=>a.d-b.d)[0];if(closest?.d<17)selectNode(closest.n,{focus:false});}fallback.pointer=null;});
for(const eventName of ['pointercancel','lostpointercapture'])canvas.addEventListener(eventName,()=>{fallback.pointer=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();fallback.zoom=Math.max(.35,Math.min(4,fallback.zoom*(e.deltaY>0?.9:1.1)));drawFallback();},{passive:false});

$('map-search').addEventListener('submit',e=>{e.preventDefault();runSearch($('map-query').value);});
$('map-query').addEventListener('input',()=>{if(!$('map-query').value)runSearch('');});
for(const id of ['map-subject','map-grade'])$(id).addEventListener('change',()=>{state.focus=null;runSearch($('map-query').value);});
$('map-reset').addEventListener('click',()=>{$('map-query').value='';runSearch('');});
$('map-fit').addEventListener('click',()=>{if(state.fallback){fitFallback();drawFallback();}else state.graph?.zoomToFit(reduced?0:850,60);});
$('map-rotate').setAttribute('aria-pressed',String(state.rotate));$('map-rotate').textContent=state.rotate?'자동 회전 켜짐':'자동 회전 꺼짐';
$('map-rotate').addEventListener('click',()=>{state.rotate=!state.rotate;state.rotationPause=0;$('map-rotate').setAttribute('aria-pressed',String(state.rotate));$('map-rotate').textContent=state.rotate?'자동 회전 켜짐':'자동 회전 꺼짐';if(state.graph)state.graph.controls().autoRotate=state.rotate&&state.dimension===3;});
$('map-dimension').addEventListener('click',()=>{if(state.fallback||!state.graph)return;state.dimension=state.dimension===3?2:3;state.graph.numDimensions(state.dimension);$('map-dimension').setAttribute('aria-pressed',String(state.dimension===2));$('map-dimension').textContent=state.dimension===2?'3D로 보기':'2D로 보기';$('view-badge').textContent=state.dimension===2?'2D LIVE MAP':'3D LIVE MAP';const guide=$('map-gesture-help')||document.querySelector('.space-bottom span');if(guide)guide.textContent=state.dimension===2?'드래그 이동 · 휠 확대 · 점 선택':'배경 드래그 회전 · 휠 확대 · 점 선택';state.graph.controls().enableRotate=state.dimension===3;state.graph.controls().autoRotate=state.rotate&&state.dimension===3;state.graph.cameraPosition({x:0,y:state.dimension===3?70:0,z:620},{x:0,y:0,z:0},reduced?0:800);rebuild();});
function keyboardMap(event){
  const nodes=state.data.nodes;if(!nodes.length)return;
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
    event.preventDefault();const current=nodes.findIndex(node=>node.id===state.selected),step=event.key==='ArrowRight'?1:-1;selectNode(nodes[(current+step+nodes.length)%nodes.length]);
  }else if(event.key==='Home'){event.preventDefault();$('map-fit').click();}
  else if(event.key==='Enter'){event.preventDefault();$('map-reader').focus();}
  else if(['+','=','-','_'].includes(event.key)){
    event.preventDefault();const scale=event.key==='-'||event.key==='_'?1.2:.8;
    if(state.fallback){fallback.zoom=Math.max(.35,Math.min(4,fallback.zoom/scale));drawFallback();}
    else {if(!state.graph)return;const controls=state.graph.controls(),target=controls.target,position=controls.object.position;state.graph.cameraPosition({x:target.x+(position.x-target.x)*scale,y:target.y+(position.y-target.y)*scale,z:target.z+(position.z-target.z)*scale},target,reduced?0:250);state.rotationPause=Date.now()+8000;}
  }
}
$('graph').addEventListener('keydown',keyboardMap);canvas.addEventListener('keydown',keyboardMap);
document.addEventListener('click',e=>{const button=e.target.closest('[data-case],[data-topic]');if(button?.dataset.case)selectCase(button.dataset.case);if(button?.dataset.topic){$('map-query').value=button.dataset.topic;runSearch(button.dataset.topic);}});

try{
  const response=await fetch('assets/standard_cases.json');if(!response.ok)throw new Error('학습 자료를 불러오지 못했습니다.');const data=await response.json();if(!Array.isArray(data.cases)||data.cases.length!==1800)throw new Error('판례 자료의 구성을 확인해 주세요.');state.cases=data.cases;
  for(const record of state.cases)for(const reference of record.articleRefs){const parts=articleParts(normalizeArticle(reference));if(parts&&!articleLaws.has(parts.law))articleLaws.set(parts.law,record.subject);}
  try{THREE=await import('./vendor/map-three.core.min.js?v=20261011-uiux');initGraph();}catch(error){enableFallback(error.message);}
  const params=new URLSearchParams(location.search),initial=params.get('q'),caseId=params.get('case');if(params.has('article')){selectArticle(queryArticle(params),params.get('from'));}else if(caseId&&state.cases.some(item=>item.id===caseId)){selectCase(caseId);}else if(initial){$('map-query').value=initial;runSearch(initial);}else {state.selected='standard-2002다1178';rebuild();const first=state.data.nodes.find(n=>n.id===state.selected);if(first)renderReader(first);}
  window.standardConceptMap={getState:()=>({caseCount:state.cases.length,nodeCount:state.data.nodes.length,linkCount:state.data.links.length,dimension:state.dimension,fallback:state.fallback,selected:state.selected,articleFocus:state.articleFocus}),search:runSearch,selectCase,selectArticle};
  for(const id of ['map-query','map-subject','map-grade','map-reset','map-fit'])$(id).disabled=false;
  $('map-search').querySelector('button').disabled=false;$('map-dimension').disabled=state.fallback;$('map-rotate').disabled=state.fallback;
}catch(error){$('map-loading').hidden=true;$('map-error').hidden=false;$('map-error').textContent=error.message;}
