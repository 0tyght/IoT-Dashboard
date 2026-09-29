const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const colors=['#59e9a0','#a9cba7','#efbc6c','#f27b7b'],states=['Good','Satisfactory','Unsatisfactory','Unacceptable'];
const limits=[[.71,1.8,4.5],[1.12,2.8,7.1],[1.8,4.5,11.2],[2.8,7.1,18]];
const STORE='vectra.motors.v1';
const originalPositions=[[455,260],[550,222],[632,290],[700,270],[738,453],[825,405],[916,442],[1002,403],[849,159],[945,178],[345,530],[1110,602]];
const seed=Array.from({length:12},(_,i)=>MotorData.validate({key:`demo-${i+1}`,id:`MTR-${String(i+1).padStart(2,'0')}`,label:`MTR-${String(i+1).padStart(2,'0')}`,cls:i%4,base:[.38,.72,1.12,1.65,.49,.83,6.3,2.12,.56,8.4,1.36,19.2][i],zone:'ABC'[Math.floor(i/4)],name:['Supply fan','Coolant pump','Main drive','Conveyor drive'][i%4],x:originalPositions[i][0]/16,y:originalPositions[i][1]/9.5,plate:{},ratings:[]}));
let storageProblem='',motors=seed;
try{const saved=localStorage.getItem(STORE);if(saved!==null)motors=MotorData.parseBackup(saved);}catch(error){motors=[];storageProblem='อ่านข้อมูลที่บันทึกไม่ได้ กรุณาส่งออกไฟล์เดิมก่อนนำเข้าไฟล์ที่ถูกต้อง';}
const hydrate=m=>({...m,value:m.base,history:Array(30).fill(m.base),received:Date.now()});
motors=motors.map(hydrate);
let selected=motors.length?Math.min(3,motors.length-1):-1,paused=false,currentView='overview';
const state=m=>limits[m.cls].filter(x=>m.value>=x).length;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Reconcile nodes instead of replacing interactive targets every two seconds.
function setMarkup(target,html){const next=target.cloneNode(false);next.innerHTML=html;function sync(a,b){for(let i=0;i<b.childNodes.length;i++){const fresh=b.childNodes[i];let old=a.childNodes[i];if(!old){a.append(fresh.cloneNode(true));continue;}if(old.nodeType!==fresh.nodeType||old.nodeName!==fresh.nodeName){old.replaceWith(fresh.cloneNode(true));continue;}if(old.nodeType===3){if(old.textContent!==fresh.textContent)old.textContent=fresh.textContent;continue;}if(old.nodeType!==1)continue;for(const attr of [...old.attributes])if(!fresh.hasAttribute(attr.name))old.removeAttribute(attr.name);for(const attr of [...fresh.attributes])if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);sync(old,fresh);}while(a.childNodes.length>b.childNodes.length)a.lastChild.remove();}sync(target,next);}
function building(x,y,w,d,h,label){return `<g transform="translate(${x} ${y})"><polygon points="0,0 ${w},0 ${w+d*.65},${-d*.4} ${d*.65},${-d*.4}" fill="url(#roof)" stroke="#4e6965" stroke-width="1"/><polygon points="0,0 ${w},0 ${w},${h} 0,${h}" fill="#192c2e" stroke="#35534e"/><polygon points="${w},0 ${w+d*.65},${-d*.4} ${w+d*.65},${h-d*.4} ${w},${h}" fill="#102322" stroke="#35534e"/>${Array.from({length:Math.floor(w/23)},(_,i)=>`<path d="M${13+i*23} 19v12 m0 12v12" stroke="${i%3===0?'#5bdfb9':'#3f7c71'}" stroke-width="8"/><path d="M${13+i*23} -7l${d*.43} ${-d*.27}" stroke="#5d8c82" stroke-width="2"/>`).join('')}<path d="M0 ${h-5}h${w}" stroke="#60d5a466"/><text x="${w/2}" y="${h+23}" fill="#68897e" font-size="10" text-anchor="middle" letter-spacing="3">${label}</text></g>`}
$('plant').innerHTML=`<defs><pattern id="grid" width="55" height="55" patternUnits="userSpaceOnUse" patternTransform="matrix(1 0 -.65 .4 0 0)"><path d="M55 0H0V55" fill="none" stroke="#42685d" stroke-opacity=".22"/></pattern><linearGradient id="roof" x2=".8" y2="1"><stop stop-color="#3b5052"/><stop offset="1" stop-color="#213936"/></linearGradient><radialGradient id="glow"><stop stop-color="#43e6a0" stop-opacity=".19"/><stop offset="1" stop-color="#43e6a0" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="950" fill="url(#grid)"/><ellipse cx="760" cy="430" rx="570" ry="360" fill="url(#glow)"/><path d="M100 315L1330 35M170 795L1490 490" stroke="#111c22" stroke-width="64"/><path d="M100 315L1330 35M170 795L1490 490" stroke="#9ac2b4" stroke-dasharray="20 22" stroke-opacity=".3" stroke-width="2"/>${building(430,300,250,200,85,'ASSEMBLY / A')}${building(820,210,200,180,95,'UTILITIES / C')}${building(705,485,310,230,90,'PRODUCTION / B')}${building(285,565,230,190,75,'PACKAGING / D')}${building(1000,640,200,170,75,'WAREHOUSE')}<g id="pins"></g>`;
function select(i){if(!motors[i])return;selected=i;$('motor-inspector').hidden=false;render();}
function render(){
 const counts=[0,0,0,0];motors.forEach(m=>counts[state(m)]++);
 const pct=motors.length?Math.round(counts[0]/motors.length*100):0;
 $('motor-total').textContent=motors.length;$('healthy-count').textContent=counts[0];$('healthy-pct').innerHTML=`${motors.length?pct:'—'}<span>${motors.length?'%':''}</span>`;
 document.querySelector('.gauge').style.background=`conic-gradient(from 225deg,#51e29b 0deg,#74fbc0 ${pct*2.7}deg,#35483f ${pct*2.7}deg 270deg,transparent 270deg)`;
 $('health-message').textContent=motors.length?'● '+counts[0]+' ตัว อยู่ใน Zone A':'ยังไม่มีมอเตอร์';
 setMarkup($('breakdown'),states.map((name,i)=>`<div class="zone-metric" style="--zone-color:${colors[i]}"><span><i class="dot"></i>ZONE ${'ABCD'[i]}</span><strong>${counts[i]}</strong><small>${['ดีตามเกณฑ์เดิม','ยอมรับได้ตามเกณฑ์เดิม','ควรตรวจสอบ','ระดับรุนแรง'][i]}</small><div class="metric-track"><i style="width:${motors.length?counts[i]/motors.length*100:0}%"></i></div></div>`).join(''));
 setMarkup($('pins'),motors.map((m,i)=>{const c=colors[state(m)],w=Math.min(220,Math.max(76,m.label.length*7));return `<g class="motor-pin" data-index="${i}" tabindex="0" role="button" aria-pressed="${i===selected}" aria-label="${esc(m.id)} ${esc(m.label)}" transform="translate(${m.x*16} ${m.y*9.5})"><title>${esc(m.id)} · ${esc(m.name)} · ${m.value.toFixed(2)} mm/s</title><circle r="25" fill="transparent"/><circle r="${i===selected?21:14}" fill="${c}" opacity=".13"/><circle r="11" fill="none" stroke="${c}"/><circle class="pin-core" r="6" fill="${c}"/><path d="M0 -12V-27" stroke="${c}"/><rect x="${-w/2}" y="-49" width="${w}" height="23" rx="9" fill="${i===selected?'#37684f':'#203530'}" stroke="${c}" stroke-opacity=".4"/><text y="-34" text-anchor="middle" fill="#eefbf3" font-size="10">${esc(m.label)}</text></g>`;}).join(''));
 const m=motors[selected];
 $('motor-name').textContent=m?m.label:'ยังไม่มีมอเตอร์';$('motor-zone').textContent=m?`LINE ${m.zone||'—'} · ${m.id}`:'เพิ่มมอเตอร์เพื่อเริ่มต้น';$('motor-desc').textContent=m?`${m.name||'ไม่ระบุหน้าที่'} · Class ${['I','II','III','IV'][m.cls]}`:'—';$('motor-value').textContent=m?m.value.toFixed(2):'—';$('motor-status').textContent=m?states[state(m)].toUpperCase():'NO DATA';$('motor-status').style.color=m?colors[state(m)]:'#a0afa6';$('received').textContent=m?new Date(m.received).toLocaleTimeString('en-GB'):'—';
 if(m){const points=m.history.map((v,i)=>`${i*300/29},${55-v/Math.max(m.base*1.5,1)*45}`).join(' ');$('spark').innerHTML=`<path d="M0 55H300M0 25H300" stroke="#ffffff08"/><polyline points="${points}" fill="none" stroke="${colors[state(m)]}" stroke-width="1.6"/>`;}else{$('spark').innerHTML='';$('motor-inspector').hidden=true;}
 const alerts=motors.map((m,i)=>({...m,index:i})).filter(m=>state(m)>=2).sort((a,b)=>state(b)-state(a)||b.value/limits[b.cls][2]-a.value/limits[a.cls][2]);$('watch-count').textContent=alerts.length;$('alert-count').textContent=alerts.length;
 setMarkup($('alerts'),alerts.length?alerts.map(m=>`<button class="alert-row" aria-pressed="${m.index===selected}" data-index="${m.index}"><span class="alert-symbol" style="color:${colors[state(m)]}">⌁</span><span><strong>${esc(m.label)}</strong><small>${esc(m.id)} · Class ${['I','II','III','IV'][m.cls]} · Line ${esc(m.zone||'—')}</small></span><span class="alert-value" style="color:${colors[state(m)]}">${m.value.toFixed(2)}<small>${states[state(m)]} · mm/s</small></span></button>`).join(''):`<p class="empty-state">${motors.length?'ไม่มีมอเตอร์ใน Zone C / D':'ยังไม่มีมอเตอร์ เพิ่มรายการได้ที่เมนูจัดการมอเตอร์'}</p>`);
 drawChart();if(m)drawMotorInspector();window.updateMapPinScale?.();window.refreshMotorHover?.();
}
// Legacy reference only. Not a plant-approved alarm/trip configuration.
function drawChart(){
 const ticks=[0,.28,.45,.71,1.12,1.8,2.8,4.5,7.1,11.2,18,28,45];
 const top=63,row=21,left=128,width=216;
 const y=v=>{if(v<=0)return top;if(v>=45)return top+12*row;const i=ticks.findIndex(t=>t>v)-1;return top+row*(i+(v-ticks[i])/(ticks[i+1]-ticks[i]));};
 const fills=['#187952','#b3cd80','#f1c38a','#d85757'];
 const zoneNames=['A · GOOD','B · SATISFACTORY','C · UNSATISFACTORY','D · UNACCEPTABLE'];
 const descriptions=['Small machines','Medium machines','Large · rigid support','Large · flexible support'];
 let svg=`<rect x="0" y="0" width="992" height="${top}" rx="7" fill="#304740"/><text x="62" y="22" text-anchor="middle" fill="#e3efe8" font-size="11">VELOCITY RMS</text><text x="29" y="48" text-anchor="middle" fill="#9eb6aa" font-size="10">in/s</text><text x="91" y="48" text-anchor="middle" fill="#ffffff" font-size="12">mm/s</text>`;
 for(let c=0;c<4;c++){
  const x=left+c*width,bounds=[0,...limits[c],45];
  svg+=`<text x="${x+width/2}" y="23" text-anchor="middle" fill="#eef7ad" font-size="15" font-weight="700">Class ${['I','II','III','IV'][c]}</text><text x="${x+width/2}" y="45" text-anchor="middle" fill="#c2d1c8" font-size="11">${descriptions[c]}</text>`;
  for(let z=0;z<4;z++){
   const yy=y(bounds[z]),h=y(bounds[z+1])-yy;
   svg+=`<rect x="${x}" y="${yy}" width="${width}" height="${h}" fill="${fills[z]}"/><text x="${x+width/2}" y="${yy+h/2+4}" text-anchor="middle" fill="${z===0?'#daf7e6':'#332c23'}" opacity=".8" font-size="10" font-weight="600">${zoneNames[z]}</text>`;
  }
  for(const bound of limits[c])svg+=`<path d="M${x} ${y(bound)}h${width}" stroke="#fff" stroke-opacity=".8" stroke-width="1.3"/><rect x="${x+width-43}" y="${y(bound)-7}" width="40" height="14" rx="3" fill="#13231ee8"/><text x="${x+width-23}" y="${y(bound)+3}" text-anchor="middle" fill="#fff" font-size="9">${bound.toFixed(2)}</text>`;
  svg+=`<path d="M${x} 0V${y(45)}" stroke="#10211a" stroke-width="1"/>`;
 }
 ticks.forEach(v=>{const yy=y(v);svg+=`<path d="M0 ${yy}H992" stroke="#152b22" stroke-opacity=".24"/><text x="48" y="${yy+4}" text-anchor="end" fill="#8fa99b" font-size="10">${(v/25.4).toFixed(3)}</text><text x="113" y="${yy+4}" text-anchor="end" fill="#e5f0e8" font-size="11" font-weight="600">${v.toFixed(2)}</text>`});
 motors.forEach((m,i)=>{const peers=motors.filter(n=>n.cls===m.cls),slot=peers.indexOf(m),x=left+m.cls*width+16+(slot+1)/(peers.length+1)*(width-32),yy=y(m.value),active=i===selected;svg+=`<g data-index="${i}" class="chart-point" tabindex="0" role="button" aria-pressed="${i===selected}" aria-label="${esc(m.id)} ${esc(m.label)}"><title>${esc(m.id)}: ${m.value.toFixed(2)} mm/s RMS · ${states[state(m)]}${m.value>45?' · เกินช่วงกราฟ':''}</title><circle cx="${x}" cy="${yy}" r="11" fill="transparent"/><circle cx="${x}" cy="${yy}" r="${active?7:5}" fill="#f8fffd" stroke="#102b22" stroke-width="2"/>${active?`<circle cx="${x}" cy="${yy}" r="10" fill="none" stroke="#fff"/>`:''}<rect x="${x-23}" y="${yy-24}" width="46" height="14" rx="4" fill="#12251fed"/><text x="${x}" y="${yy-14}" text-anchor="middle" fill="#fff" font-size="8">${m.value>45?'↓ ':''}${esc(m.id)}</text></g>`});
 svg+='<text x="128" y="342" fill="#90a99b" font-size="10">ค่าเพิ่มจากบนลงล่าง · ระยะระหว่างแถวเท่ากันตามตารางอ้างอิง · in/s = mm/s ÷ 25.4</text>';
 setMarkup($('chart'),svg);
 const m=motors[selected];if(!m){$('chart-selection').textContent='ยังไม่มีมอเตอร์ — เพิ่มรายการในเมนูจัดการมอเตอร์';return;}$('chart-selection').textContent=`${m.id} · Class ${['I','II','III','IV'][m.cls]} · ${m.value.toFixed(2)} mm/s RMS · Zone ${'ABCD'[state(m)]} ${m.value>45?' · เกินช่วงกราฟ 45 mm/s (จุดแสดงที่ขอบ)':''} — ข้อมูลจำลอง / เกณฑ์เดิม`;
}
function tick(){if(!paused){motors.forEach(m=>{m.value=m.base*(.97+Math.random()*.06);m.history.push(m.value);m.history=m.history.slice(-30);m.received=Date.now();});render();}$('clock').textContent=new Date().toLocaleString('en-GB');}
function setView(view){currentView=view;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});document.querySelector('.app').classList.toggle('map-only',view==='map');document.querySelector('.app').classList.toggle('manage-mode',view==='motors');document.querySelector('.app').classList.toggle('alert-focus',view==='alerts');$('motor-registry').hidden=view!=='motors';if(view==='motors'){$('motor-inspector').hidden=true;renderRegistry();}if(view==='alerts')document.querySelector('.watch').scrollIntoView({behavior:'smooth',block:'center'});}
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'เริ่มข้อมูลจำลอง':'หยุดข้อมูลจำลอง');document.querySelector('.demo').innerHTML=`<i></i> ${paused?'PAUSED':'SIMULATION'}`;document.querySelector('.detail-note').textContent=paused?'หยุดข้อมูลจำลองแล้ว · ค่าบนจอค้างจากรอบล่าสุด':'เลือกจุดมอเตอร์บนแปลนหรือกราฟเพื่อดูรายละเอียด';};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
for(const id of ['pins','chart','alerts']){const el=$(id);el.addEventListener('click',e=>{const target=e.target.closest('[data-index]');if(target)select(Number(target.dataset.index));});if(id!=='alerts')el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const target=e.target.closest('[data-index]');if(target){e.preventDefault();select(Number(target.dataset.index));}}});}
$('standard-info').onclick=()=>$('standards-dialog').showModal();$('close-standard').onclick=()=>$('standards-dialog').close();
// Separate inspector: selection never filters or replaces the overview matrix.
function drawMotorInspector(){
 const m=motors[selected],cls=['I','II','III','IV'][m.cls],zone=state(m);
 $('inspector-title').textContent=m.label;$('inspector-id').textContent=m.id;
 $('inspector-class').textContent=`Class ${cls} · Line ${m.zone}`;
 $('inspector-reading').innerHTML=`<span>${m.value.toFixed(2)}</span><small>mm/s RMS</small>`;
 $('inspector-status').style.color=colors[zone];
 $('inspector-status').textContent=`Zone ${'ABCD'[zone]} · ${states[zone]}${m.value>45?' · เกินช่วงกราฟ 45 mm/s (จุดแสดงที่ขอบ)':''}`;
 const ticks=[0,.28,.45,.71,1.12,1.8,2.8,4.5,7.1,11.2,18,28,45];
 const y=v=>{if(v<=0)return 36;if(v>=45)return 288;const i=ticks.findIndex(t=>t>v)-1;return 36+21*(i+(v-ticks[i])/(ticks[i+1]-ticks[i]));};
 const bounds=[0,...limits[m.cls],45],fills=['#187952','#b3cd80','#f1c38a','#d85757'];
 let svg=`<text x="4" y="20" fill="#b7ccbf" font-size="11">mm/s</text><text x="175" y="20" text-anchor="middle" fill="#eef7ad" font-size="14" font-weight="600">Class ${cls}</text>`;
 for(let z=0;z<4;z++){const yy=y(bounds[z]),h=y(bounds[z+1])-yy;svg+=`<rect x="54" y="${yy}" width="240" height="${h}" fill="${fills[z]}"/><text x="230" y="${yy+h/2+4}" text-anchor="middle" font-size="11" fill="${z===0?'#edfff3':'#332c23'}">ZONE ${'ABCD'[z]}</text>`;}
 ticks.forEach(v=>svg+=`<path d="M54 ${y(v)}H294" stroke="#102b2233"/><text x="46" y="${y(v)+4}" text-anchor="end" fill="#c2d8ca" font-size="10">${v.toFixed(2)}</text>`);
 for(const v of limits[m.cls])svg+=`<path d="M54 ${y(v)}H294" stroke="#fff9"/>`;
 const yy=y(m.value);svg+=`<g class="inspector-point"><title>${esc(m.id)}: ${m.value.toFixed(2)} mm/s RMS</title><path d="M54 ${yy}H170" stroke="#fff" stroke-dasharray="3 3"/><circle cx="110" cy="${yy}" r="8" fill="#fff" stroke="#142d24" stroke-width="3"/><rect x="76" y="${yy-28}" width="68" height="17" rx="4" fill="#10271f"/><text x="110" y="${yy-16}" text-anchor="middle" fill="#fff" font-size="10">${esc(m.id)}</text></g>`;
 $('inspector-chart').innerHTML=svg;
 $('inspector-chart').setAttribute('aria-label',`${m.id} เฉพาะ Class ${cls}`);
}
$('close-inspector').onclick=()=>{$('motor-inspector').hidden=true;};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))$('motor-inspector').hidden=true;});
// Motor registry and nameplate editor.
let editingKey=null,editorDirty=false,pendingConfirm=null,deletedMotor=null,nameplateKey=null;
let storageSnapshot=null;
try{storageSnapshot=localStorage.getItem(STORE);}catch{}
const form=$('motor-form');
function announce(message,undo=false){$('toast-text').textContent=message;$('toast').hidden=false;$('undo-delete').hidden=!undo;}
function saveList(next,{replace=false}={}){
 const valid=MotorData.validateList(next);
 if(storageProblem&&!replace)throw Error('ข้อมูลที่บันทึกเดิมมีปัญหา กรุณาส่งออกสำรองก่อนนำเข้าไฟล์ที่ถูกต้อง');
 if(!replace&&localStorage.getItem(STORE)!==storageSnapshot)throw Error('ข้อมูลถูกเปลี่ยนในแท็บอื่น กรุณาสำรองสิ่งที่กำลังแก้ไขและรีเฟรชหน้านี้ก่อนบันทึก');
 const raw=JSON.stringify({version:1,motors:valid});
 try{localStorage.setItem(STORE,raw);}catch{throw Error('บันทึกไม่ได้: พื้นที่เบราว์เซอร์เต็มหรือปิดการจัดเก็บ ข้อมูลเดิมยังไม่ถูกเปลี่ยน');}
 const selectedKey=motors[selected]?.key,previous=new Map(motors.map(m=>[m.key,m]));
 motors=valid.map(m=>{const old=previous.get(m.key);return old&&old.base===m.base?{...m,value:old.value,history:old.history,received:old.received}:hydrate(m);});
 selected=motors.findIndex(m=>m.key===selectedKey);if(selected<0)selected=motors.length?0:-1;
 storageSnapshot=raw;storageProblem='';$('storage-banner').textContent='บันทึกเฉพาะเบราว์เซอร์นี้ · ยังไม่ซิงก์ข้ามอุปกรณ์ · ค่าการสั่นเป็นข้อมูลจำลอง';
 render();renderRegistry();
}
function renderRegistry(){
 const q=$('motor-search').value.trim().toLowerCase();const filtered=motors.filter(m=>[m.id,m.label,m.zone,m.name,m.plate.manufacturer,m.plate.model,m.plate.serial].some(v=>v.toLowerCase().includes(q)));
 $('registry-count').textContent=`${filtered.length} / ${motors.length} มอเตอร์`;
 $('registry-list').innerHTML=filtered.length?filtered.map(m=>`<article class="motor-card"><div class="motor-card-main"><span class="asset-icon">⌁</span><div><h2>${esc(m.label)}</h2><p>${esc(m.id)} · ${esc(m.name||'ยังไม่ระบุหน้าที่')}</p></div></div><dl><div><dt>พื้นที่</dt><dd>${esc(m.zone||'—')}</dd></div><div><dt>เกณฑ์เดิม</dt><dd>Class ${['I','II','III','IV'][m.cls]}</dd></div><div><dt>รุ่น</dt><dd>${esc(m.plate.model||'ยังไม่ระบุ')}</dd></div><div><dt>ตำแหน่ง</dt><dd>${m.x.toFixed(1)}%, ${m.y.toFixed(1)}%</dd></div></dl><div class="card-actions"><button data-action="locate" data-key="${esc(m.key)}">ดูบนแปลน</button><button data-action="plate" data-key="${esc(m.key)}">ฉลาก</button><button data-action="edit" data-key="${esc(m.key)}">แก้ไข</button><button class="delete-button" data-action="delete" data-key="${esc(m.key)}" aria-label="ลบ ${esc(m.id)}">ลบ</button></div></article>`).join(''):`<div class="empty-state"><h2>${q?'ไม่พบมอเตอร์ที่ค้นหา':'ยังไม่มีมอเตอร์'}</h2><p>${q?'ลองค้นหาด้วยรหัส ฉลาก หรือพื้นที่อื่น':'กด “เพิ่มมอเตอร์” เพื่อเพิ่มตำแหน่งและข้อมูลฉลากเครื่อง'}</p></div>`;
}
function openConfirm(title,message,action,button='ยืนยัน'){pendingConfirm=action;$('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-action').textContent=button;$('confirm-error').hidden=true;$('confirm-dialog').showModal();}
$('confirm-action').onclick=()=>{try{pendingConfirm?.();$('confirm-dialog').close();pendingConfirm=null;}catch(error){$('confirm-error').textContent=error.message;$('confirm-error').hidden=false;}};
function requestDelete(key){const m=motors.find(m=>m.key===key);if(!m)return;openConfirm(`ลบ ${m.id}?`,`จะนำ “${m.label}” ออกจากแปลน ตาราง และรายการมอเตอร์ในเบราว์เซอร์นี้ สามารถกู้คืนได้จากข้อความหลังลบ`,()=>{const index=motors.findIndex(n=>n.key===key);saveList(motors.filter(n=>n.key!==key));deletedMotor={motor:m,index};announce(`ลบ ${m.id} แล้ว`,true);},'ลบมอเตอร์');}
$('undo-delete').onclick=()=>{if(!deletedMotor)return;try{const next=[...motors];next.splice(Math.min(deletedMotor.index,next.length),0,deletedMotor.motor);saveList(next);deletedMotor=null;announce('กู้คืนมอเตอร์แล้ว');}catch(error){announce(error.message,true);}};
$('dismiss-toast').onclick=()=>{$('toast').hidden=true;};
$('registry-list').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const key=b.dataset.key;switch(b.dataset.action){case 'edit':openEditor(key);break;case 'plate':openNameplate(key);break;case 'delete':requestDelete(key);break;case 'locate':setView('map');select(motors.findIndex(m=>m.key===key));document.querySelector('.factory').scrollIntoView({block:'center',behavior:'smooth'});break;}});
$('motor-search').addEventListener('input',renderRegistry);
$('plate-fields').innerHTML=Object.entries(MotorData.plateFields).map(([key,label])=>`<label>${label}<input name="plate-${key}" maxlength="100" ${['ambient','weight'].includes(key)?`type="number" step="any" ${key==='weight'?'min="0"':''}`:''}></label>`).join('');
function addRating(row={}){if($('rating-rows').children.length>=12){announce('รองรับพิกัดไฟฟ้าสูงสุด 12 แถว');return;}const tr=document.createElement('tr');tr.innerHTML=Object.entries(MotorData.ratingFields).map(([key,label])=>`<td><input data-rating="${key}" aria-label="${label}" value="${esc(row[key]||'')}" maxlength="40" ${['voltage','connection'].includes(key)?'':`type="number" step="any" min="0" ${key==='pf'?'max="1"':key==='efficiency'?'max="100"':''}`} ${key==='connection'?'placeholder="DELTA / STAR"':''}></td>`).join('')+'<td><button type="button" class="remove-rating" aria-label="ลบแถวพิกัด">✕</button></td>';$('rating-rows').append(tr);}
$('rating-rows').addEventListener('click',e=>{if(e.target.closest('.remove-rating')){e.target.closest('tr').remove();editorDirty=true;}});
$('add-rating').onclick=()=>{addRating();editorDirty=true;};
function positionPreview(){const svg=$('plant').cloneNode(true);svg.querySelector('#pins').remove();$('position-preview').innerHTML=svg.innerHTML.replaceAll('id="','id="preview-').replaceAll('url(#','url(#preview-')+'<g id="position-marker"><circle r="26" fill="#62f0ab44"/><circle r="12" fill="#82ffc3" stroke="white" stroke-width="3"/></g>';updatePositionMarker();}
function updatePositionMarker(){const x=Number(form.elements.x.value),y=Number(form.elements.y.value);$('position-marker')?.setAttribute('transform',`translate(${Math.max(0,Math.min(100,x))*16} ${Math.max(0,Math.min(100,y))*9.5})`);}
$('position-preview').addEventListener('click',e=>{const svg=$('position-preview'),point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const matrix=svg.getScreenCTM();if(!matrix)return;const p=point.matrixTransform(matrix.inverse());form.elements.x.value=Math.max(0,Math.min(100,p.x/16)).toFixed(1);form.elements.y.value=Math.max(0,Math.min(100,p.y/9.5)).toFixed(1);editorDirty=true;updatePositionMarker();});
form.addEventListener('input',()=>{editorDirty=true;updatePositionMarker();});
function openEditor(key=null){
 const m=key?motors.find(m=>m.key===key):null;if(key&&!m)return;
 editingKey=key;form.reset();$('form-error').hidden=true;$('editor-title').textContent=m?`แก้ไข ${m.id}`:'เพิ่มมอเตอร์';
 let idNumber=motors.length+1;while(motors.some(n=>n.id.toLowerCase()===`mtr-${String(idNumber).padStart(2,'0')}`))idNumber++;
 const initial=m||{id:`MTR-${String(idNumber).padStart(2,'0')}`,label:'',name:'',zone:'',cls:0,base:1,x:50,y:50,plate:{},ratings:[]};
 for(const key of ['id','label','name','zone','cls','base','x','y'])form.elements.namedItem(key).value=['x','y'].includes(key)?Number(initial[key]).toFixed(1):initial[key];
 for(const key of Object.keys(MotorData.plateFields))form.elements.namedItem('plate-'+key).value=initial.plate[key]||'';
 $('rating-rows').innerHTML='';(initial.ratings.length?initial.ratings:[{}]).forEach(addRating);
 positionPreview();editorDirty=false;$('motor-editor').showModal();$('motor-editor').scrollTop=0;
}
function closeEditor(){if(editorDirty)openConfirm('ออกโดยไม่บันทึก?','ข้อมูลที่แก้ไขในแบบฟอร์มนี้จะไม่ถูกบันทึก',()=>{editorDirty=false;$('motor-editor').close();},'ไม่บันทึก');else $('motor-editor').close();}
$('motor-editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.dataset.close==='motor-editor'?closeEditor():$(b.dataset.close).close());
form.addEventListener('submit',e=>{e.preventDefault();try{
 const fd=new FormData(form),plate={};for(const key of Object.keys(MotorData.plateFields))plate[key]=String(fd.get('plate-'+key)||'');
 const ratings=[...$('rating-rows').children].map(tr=>Object.fromEntries([...tr.querySelectorAll('[data-rating]')].map(input=>[input.dataset.rating,input.value])));
 const next=MotorData.validate({key:editingKey||crypto.randomUUID(),id:String(fd.get('id')),label:String(fd.get('label')),name:String(fd.get('name')),zone:String(fd.get('zone')),cls:Number(fd.get('cls')),base:Number(fd.get('base')),x:Number(fd.get('x')),y:Number(fd.get('y')),plate,ratings});
 saveList(editingKey?motors.map(m=>m.key===editingKey?next:m):[...motors,next]);selected=motors.findIndex(m=>m.key===next.key);render();editorDirty=false;$('motor-editor').close();if($('nameplate-dialog').open)openNameplate(next.key);announce(`บันทึก ${next.id} แล้ว — ในเบราว์เซอร์นี้`);
 }catch(error){$('form-error').textContent=error.message;$('form-error').hidden=false;$('form-error').scrollIntoView({block:'nearest'});}});
function openNameplate(key){const m=motors.find(m=>m.key===key);if(!m)return;nameplateKey=key;$('nameplate-title').textContent=`ฉลากเครื่อง · ${m.id}`;
 const p=m.plate;$('nameplate-content').innerHTML=`<div class="nameplate"><div class="nameplate-brand"><strong>${esc(p.manufacturer||'ไม่ระบุผู้ผลิต')}</strong><span>${esc(p.motorType||'Motor nameplate')}</span></div><h3>${esc(p.model||'ยังไม่ระบุรุ่น')}</h3><p>${esc(m.label)} · ${esc(p.marking||'—')} · ${esc(p.standard||'—')}</p><dl class="plate-specs">${Object.entries(MotorData.plateFields).filter(([k])=>!['manufacturer','model','motorType','marking','standard'].includes(k)).map(([k,label])=>`<div><dt>${label}</dt><dd>${esc(p[k]||'—')}</dd></div>`).join('')}</dl><div class="rating-scroll"><table><caption>พิกัดตามฉลากเครื่อง</caption><thead><tr>${Object.values(MotorData.ratingFields).map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${m.ratings.length?m.ratings.map(row=>`<tr>${Object.keys(MotorData.ratingFields).map(k=>`<td>${esc(row[k]||'—')}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="8">ยังไม่มีข้อมูลพิกัดไฟฟ้า</td></tr>'}</tbody></table></div></div><p class="field-note">ข้อมูลกรอกโดยผู้ใช้ · ช่องว่างแสดง “—” · ไม่ใช้ข้อมูลฉลากกำหนด Class อัตโนมัติ</p>`;if(!$('nameplate-dialog').open)$('nameplate-dialog').showModal();}
$('edit-nameplate').onclick=()=>openEditor(nameplateKey);
$('view-nameplate').onclick=()=>{if(motors[selected])openNameplate(motors[selected].key);};
$('edit-selected').onclick=()=>{if(motors[selected])openEditor(motors[selected].key);};
$('add-motor').onclick=()=>openEditor();
function download(raw){const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`vectra-motors-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-motors').onclick=()=>{try{download(storageProblem?(localStorage.getItem(STORE)||'{}'):JSON.stringify({version:1,motors:motors.map(MotorData.validate)},null,2));}catch(error){announce(error.message);}};
$('import-motors').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>2*1024*1024)throw Error('ไฟล์ต้องไม่เกิน 2 MB');const next=MotorData.parseBackup(await file.text());openConfirm('นำเข้ารายการมอเตอร์?',`ไฟล์นี้มี ${next.length} ตัว และจะแทนที่รายการปัจจุบัน ${motors.length} ตัวในเบราว์เซอร์นี้ กรุณาส่งออกสำรองก่อนหากต้องการเก็บรายการเดิม`,()=>{saveList(next,{replace:true});deletedMotor=null;announce(`นำเข้า ${next.length} มอเตอร์แล้ว`);},'แทนที่ด้วยไฟล์นี้');}catch(error){announce(`นำเข้าไม่ได้: ${error.message}`);}};
window.addEventListener('storage',e=>{if(e.key===STORE){$('storage-banner').textContent='รายการถูกแก้ไขในแท็บอื่น กรุณารีเฟรชหน้านี้ก่อนบันทึก';announce('รายการถูกแก้ไขในแท็บอื่น กรุณารีเฟรชก่อนบันทึก');}});
if(storageProblem){$('storage-banner').textContent=storageProblem;announce(storageProblem);}
renderRegistry();tick();setInterval(tick,2000);
