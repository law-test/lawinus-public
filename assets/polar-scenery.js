(() => {
  'use strict';

  const THEMES = [
    {id:'campus',label:'빙하 강의실 · 독서실',ink:'#3f746d',wood:'#bd9268',light:'#f1d88e',props:['study','books']},
    {id:'graduation',label:'설원 졸업시험장',ink:'#71658c',wood:'#ad92a2',light:'#eadba9',props:['examdesk','notice']},
    {id:'bar-exam',label:'남극 변호사시험장',ink:'#486a8e',wood:'#a7bac5',light:'#f5dfac',props:['clock','examdesk']},
    {id:'office',label:'빙하 법률사무실',ink:'#347b81',wood:'#b88d65',light:'#f7d787',props:['office','files']},
    {id:'court',label:'설원 법원',ink:'#816d82',wood:'#bcaaa0',light:'#ecdaa6',props:['column','scales']},
    {id:'night-office',label:'오로라 야근 사무실',ink:'#4b5d86',wood:'#8a8296',light:'#f4d38c',props:['office','files']}
  ].map(theme => Object.freeze({...theme,props:Object.freeze(theme.props)}));
  const SIDES = [-1,1];
  const getTheme = level => {
    const n=Math.max(1,Math.floor(Number(level)||1));
    return THEMES[n<=3?n-1:3+(n-4)%3];
  };
  const hash = n => { const value=Math.sin(n*127.1+91.7)*43758.5453;return value-Math.floor(value); };
  const round = (g,x,y,w,h,r,color) => {g.fillStyle=color;g.beginPath();g.roundRect(x,y,w,h,r);g.fill();};
  const poly = (g,points,color) => {g.fillStyle=color;g.beginPath();g.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)g.lineTo(points[i][0],points[i][1]);g.closePath();g.fill();};
  const oval = (g,x,y,rx,ry,color) => {g.fillStyle=color;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();};
  const line = (g,points,color,weight=3) => {g.strokeStyle=color;g.lineWidth=weight;g.beginPath();g.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)g.lineTo(points[i][0],points[i][1]);g.stroke();};
  const text = (g,value,x,y,size,color) => {g.fillStyle=color;g.font=`800 ${size}px system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(value,x,y);};

  function create() {
    const sprites=new Map();
    let activeTheme=null;

    function book(g,x,y,w,h,color) {
      round(g,x,y,w,h,2,color);round(g,x+2,y+5,w-4,3,1,'#fff2d3aa');round(g,x+2,y+h-8,w-4,2,1,'#fff2d377');
    }
    function paper(g,x,y,w,h) {
      round(g,x,y,w,h,2,'#fcf4de');line(g,[[x+5,y+8],[x+w-5,y+8]],'#a4b4bb',2);line(g,[[x+5,y+14],[x+w-5,y+14]],'#bec6c6',2);
    }
    function clock(g,x,y,r,theme) {
      oval(g,x,y,r+4,r+4,theme.ink);oval(g,x,y,r,r,'#fff4d4');
      for(let i=0;i<12;i++){const a=i*Math.PI/6;line(g,[[x+Math.sin(a)*r*.76,y-Math.cos(a)*r*.76],[x+Math.sin(a)*r*.9,y-Math.cos(a)*r*.9]],'#6d7d87',i%3?1.5:3);}
      line(g,[[x-r*.35,y-r*.32],[x,y],[x+r*.14,y-r*.62]],theme.ink,4);oval(g,x,y,3,3,theme.ink);
    }
    function snow(g,x,y,w) {
      round(g,x,y,w,10,5,'#eaffff');oval(g,x+w*.23,y+1,w*.19,6,'#f5ffff');oval(g,x+w*.66,y+1,w*.23,7,'#f5ffff');
      for(let i=0;i<3;i++){const at=x+w*(.18+i*.29);poly(g,[[at,y+8],[at+5,y+8],[at+2,y+19+i%2*5]],'#c8edf6');}
    }
    function lamp(g,x,y,theme) {
      poly(g,[[x-12,y],[x+12,y],[x+38,y+56],[x-38,y+56]],'#ffe8a32b');
      line(g,[[x+12,y+55],[x+25,y+55],[x+25,y-4],[x,y-18]],theme.ink,5);poly(g,[[x-12,y-10],[x+12,y-10],[x+21,y+2],[x-21,y+2]],theme.ink);oval(g,x,y+2,15,3,theme.light);
    }
    function desk(g,theme,exam=false) {
      round(g,-65,-72,10,66,3,'#668b9d');round(g,54,-72,10,66,3,'#668b9d');
      poly(g,[[-79,-89],[53,-89],[78,-67],[-59,-67]],theme.wood);round(g,-60,-68,138,9,2,'#7898aa');
      paper(g,-32,-84,49,22);line(g,[[29,-81],[52,-74]],'#435d7c',3);round(g,-28,-51,62,10,4,'#779aaf');
      round(g,-24,-47,7,40,2,'#456b86');round(g,23,-47,7,40,2,'#456b86');
      if(exam){round(g,-21,-121,50,32,4,'#8cb2c0');round(g,-18,-118,44,5,2,'#ddf4ee');line(g,[[-13,-91],[-13,-70]],'#698d9f',4);}
      snow(g,-74,-92,131);
    }
    function makeSprite(kind,theme) {
      const key=theme.id+':'+kind;if(sprites.has(key))return sprites.get(key);
      const canvas=document.createElement('canvas');canvas.width=240;canvas.height=256;
      const g=canvas.getContext('2d');g.translate(120,238);g.lineCap='round';g.lineJoin='round';
      oval(g,0,-2,92,12,'#1d627e24');
      if(kind==='study'){
        round(g,-85,-153,17,146,5,theme.wood);round(g,66,-153,17,146,5,theme.wood);round(g,-68,-150,134,80,4,'#77a19b');
        round(g,-62,-144,122,65,3,'#365f61');desk(g,theme);lamp(g,-28,-138,theme);paper(g,5,-105,40,28);snow(g,-90,-159,180);
      }else if(kind==='books'){
        round(g,-73,-195,146,190,6,theme.wood);round(g,-64,-186,128,171,2,'#496f78');
        for(let row=0;row<3;row++){
          for(let i=0;i<7;i++){const h=30+hash(row*7+i)*15;book(g,-57+i*16,-174+row*53+46-h,11,h,['#d6a75d','#7db9bb','#b8c9cf','#b87c91','#98a99a'][i%5]);}
          round(g,-68,-129+row*53,136,7,2,theme.wood);
        }
        snow(g,-78,-202,156);
      }else if(kind==='examdesk'){
        desk(g,theme,true);round(g,43,-160,29,26,3,'#eef9f5');text(g,'좌석',57,-147,10,theme.ink);line(g,[[57,-132],[57,-87]],'#79a9bb',4);
      }else if(kind==='notice'){
        round(g,-57,-163,114,117,5,theme.wood);round(g,-49,-155,98,100,2,'#f7edcf');round(g,-43,-149,86,21,2,theme.ink);text(g,'졸업시험',0,-138,15,'#fff8e4');
        for(let i=0;i<3;i++){paper(g,-37,-118+i*18,74,14);oval(g,-29,-111+i*18,2,2,theme.ink);}
        line(g,[[-40,-44],[-48,0]],'#6f8296',8);line(g,[[40,-44],[48,0]],'#6f8296',8);snow(g,-63,-171,126);
      }else if(kind==='clock'){
        round(g,-8,-157,16,153,4,'#6f9bab');round(g,-44,-11,88,12,4,'#aecbd6');clock(g,0,-173,36,theme);snow(g,-39,-216,78);
        round(g,-49,-115,98,37,4,'#f0f8ee');text(g,'시험 중',0,-97,18,theme.ink);
      }else if(kind==='office'){
        desk(g,theme);round(g,-35,-145,72,47,5,theme.ink);round(g,-30,-140,62,36,2,theme.id==='night-office'?'#8cb7c9':'#b9e2e3');
        paper(g,-17,-136,34,29);round(g,-4,-99,10,10,2,theme.ink);round(g,-19,-90,40,5,2,theme.ink);lamp(g,-52,-155,theme);
        round(g,50,-113,16,28,4,'#f4dec1');oval(g,58,-113,7,3,'#5e5b60');line(g,[[65,-110],[71,-110],[71,-96],[65,-96]],'#f4dec1',4);
      }else if(kind==='files'){
        round(g,-63,-152,126,144,6,theme.wood);round(g,-55,-143,110,129,3,'#d2dfe0');
        for(let i=0;i<3;i++){round(g,-49,-137+i*41,98,34,3,theme.ink);round(g,-17,-127+i*41,34,9,2,'#dfe9dc');round(g,-13,-111+i*41,26,3,1,'#b2d3d9');}
        for(let i=0;i<3;i++){round(g,-52+i*7,-160-i*10,77,9,1,['#f2d8a8','#e8eee0','#abd2da'][i]);}
        paper(g,-26,-193,58,20);snow(g,26,-157,39);
      }else if(kind==='column'){
        round(g,-59,-24,118,21,4,'#b0c9d4');round(g,-49,-36,98,15,3,'#d7e5e8');round(g,-38,-191,76,158,6,'#e6eef0');
        for(let i=0;i<5;i++)round(g,-30+i*13,-181,6,134,3,'#b3cedb');
        round(g,-47,-198,94,14,4,'#b8d3dd');round(g,-58,-213,116,18,4,'#e2eff1');snow(g,-64,-221,128);
      }else if(kind==='scales'){
        round(g,-61,-69,122,63,4,theme.wood);round(g,-67,-76,134,13,3,'#e0d5bf');
        line(g,[[0,-80],[0,-181]],'#d3ae61',8);oval(g,0,-185,8,8,'#f2d38e');line(g,[[-56,-161],[56,-161]],'#d3ae61',6);
        for(const side of SIDES){line(g,[[side*48,-160],[side*70,-113],[side*26,-113],[side*48,-160]],'#e6cb8b',3);g.fillStyle='#d2af68';g.beginPath();g.arc(side*48,-112,23,0,Math.PI);g.fill();}
        round(g,-26,-84,52,10,3,'#c7a35b');text(g,'법원',0,-38,20,'#fff2d7');snow(g,-68,-77,43);
      }
      sprites.set(key,canvas);return canvas;
    }

    function prepare(theme) {
      if(activeTheme===theme.id)return;
      for(const kind of theme.props)makeSprite(kind,theme);
      activeTheme=theme.id;
    }

    function paintBackdrop(g,width,height,level) {
      const theme=getTheme(level);prepare(theme);
      g.save();g.lineCap='round';g.lineJoin='round';
      const compact=width<=700,unit=Math.min(width*.25,height*.5),base=height*.47,wall=theme.id==='night-office'?'#335c7e':'#bedce5';
      const building=(side)=>{
        g.save();g.translate(side<0?unit*.62:width-unit*.51,base);g.scale(unit/200,unit/200);
        const x=side<0?-123:-77;
        poly(g,[[x,-141],[x+178,-141],[x+191,16],[x-12,16]],'#6fa7bf88');
        round(g,x,-140,178,151,6,wall);round(g,x+9,-131,160,132,3,theme.id==='night-office'?'#376084':'#d3e7e8');
        const roofY=-149;snow(g,x-12,roofY,202);
        if(theme.id==='campus'){
          if(side<0){
            round(g,x+17,-120,145,91,4,'#a37e5a');round(g,x+24,-113,131,76,2,'#376d69');text(g,'민법 강의실',x+89,-92,16,'#f4ead1');
            line(g,[[x+38,-72],[x+138,-72]],'#b8dad3',3);text(g,'§',x+64,-52,19,'#d8f1df');line(g,[[x+85,-58],[x+137,-58]],'#dce6d0',2);line(g,[[x+85,-48],[x+122,-48]],'#a9cac3',2);
            round(g,x+32,-31,112,6,2,'#bb9a6d');round(g,x+108,-36,19,4,1,'#e6e5cb');
          }else{
            round(g,x+19,-119,141,99,3,'#a38168');round(g,x+27,-112,125,84,2,'#55797f');
            for(let row=0;row<2;row++){for(let i=0;i<8;i++)book(g,x+33+i*14,-104+row*41,9,31,['#e5bd80','#8cafae','#bab7cc','#c89695'][i%4]);round(g,x+23,-72+row*41,133,5,2,'#b89b76');}
            text(g,'독서실',x+89,-7,13,theme.ink);
          }
        }else if(theme.id==='graduation'){
          if(side<0){round(g,x+17,-119,145,86,4,'#8d7e99');round(g,x+24,-112,131,71,2,'#5c5476');text(g,'졸업시험',x+89,-90,19,'#ffefd2');line(g,[[x+44,-68],[x+133,-68]],'#d4c6d8',3);text(g,'답안지 확인',x+89,-53,11,'#d9d9e1');}
          else{clock(g,x+88,-88,34,theme);paper(g,x+28,-40,52,36);paper(g,x+95,-40,52,36);}
        }else if(theme.id==='bar-exam'){
          if(side<0){round(g,x+15,-120,149,37,4,theme.ink);text(g,'변호사시험',x+89,-101,19,'#fff1ce');round(g,x+30,-72,119,58,3,'#f4f3df');text(g,'수험표 · 답안지',x+89,-50,12,theme.ink);line(g,[[x+44,-33],[x+136,-33]],'#a2bac7',3);}
          else{clock(g,x+87,-91,39,theme);round(g,x+25,-37,128,26,4,'#dcebed');text(g,'시험 중',x+89,-24,16,theme.ink);}
        }else if(theme.id==='court'){
          round(g,x+14,-111,150,115,1,'#7fa9bd');
          for(let i=0;i<4;i++){round(g,x+22+i*37,-119,20,117,4,'#e3edf0');round(g,x+19+i*37,-123,26,8,2,'#f2f7f5');line(g,[[x+29+i*37,-109],[x+29+i*37,-13]],'#bbd2dd',3);}
          poly(g,[[x+4,-126],[x+88,-173],[x+173,-126]],'#dce9ec');poly(g,[[x+19,-131],[x+88,-161],[x+157,-131]],'#a6c3d2');text(g,side<0?'법원':'법정',x+89,-140,15,theme.ink);snow(g,x+2,5,174);
        }else{
          const night=theme.id==='night-office';round(g,x+17,-123,145,93,4,theme.ink);round(g,x+24,-116,131,79,2,night?'#315575':'#b2d9e1');
          for(let i=0;i<4;i++){const bx=x+29+i*31;round(g,bx,-83-i%2*15,23,46+i%2*15,1,night?'#24466a':'#84afc2');for(let r=0;r<3;r++)for(let c=0;c<2;c++)round(g,bx+5+c*9,-76-i%2*15+r*12,4,6,1,night?'#e9d49b':'#d6eff0');}
          line(g,[[x+88,-115],[x+88,-37]],'#d9e8e7',4);line(g,[[x+25,-76],[x+155,-76]],'#d9e8e7',4);
          round(g,x+13,-25,153,24,3,theme.wood);text(g,side<0?'법률사무소':night?'사건 기록':'회의실',x+89,-13,14,'#fff5db');
          if(side>0){round(g,x+128,-56,9,30,3,'#5d7d84');poly(g,[[x+116,-56],[x+149,-56],[x+140,-71],[x+123,-71]],'#e3bf72');}
        }
        if(theme.id!=='court'){round(g,x+5,4,168,13,3,'#86b5c8');snow(g,x-5,9,188);}
        g.restore();
      };
      building(-1);building(1);
      // Snowy foundations keep the indoor objects anchored in the polar landscape.
      for(const side of SIDES){const x=side<0?0:width;poly(g,[[x,height*.48],[x-side*width*.17,height*.49],[x-side*width*.21,height*.56],[x,height*.61]],'#d8f2f5b3');}
      if(!compact){
        const x=width*.5,beam=width*.16;g.globalAlpha=.36;line(g,[[x-beam,height*.205],[x+beam,height*.205]],'#e7f5f3',Math.max(3,height*.012));g.globalAlpha=1;
      }
      g.restore();
    }

    function drawRoadside(g,{width,height,level,distance,project}) {
      const theme=getTheme(level);prepare(theme);
      const first=Math.floor(distance/72),baseSize=Math.min(190,Math.max(105,width*.19));
      // Five fixed world rows per side: at most ten cached images and no drawing paths.
      g.save();
      for(let i=4;i>=0;i--){
        const row=first+i,z=row*72+24-distance;if(z< -28||z>330)continue;
        for(const side of SIDES){
          const lane=side*(3.08+(row%2)*.19),p=project(lane,z),kind=theme.props[(row+(side>0?1:0))%theme.props.length],sprite=sprites.get(theme.id+':'+kind);
          const w=baseSize*p.scale,h=w*256/240,x=p.x-w/2,y=p.y-h*.93;
          if(x+w< -8||x>width+8||y>height+12)continue;
          g.globalAlpha=Math.min(1,Math.max(.32,(330-z)/160));g.drawImage(sprite,x,y,w,h);
        }
      }
      g.restore();
    }

    return Object.freeze({paintBackdrop,drawRoadside,getTheme,clear(){sprites.clear();activeTheme=null;}});
  }
  window.LawinusPolarScenery=Object.freeze({create,version:'20261025-scenery'});
})();
