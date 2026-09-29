/* Pointer previews complement selection; touch and keyboard retain explicit actions. */
(()=>{
 const tip=document.createElement('div');tip.id='motor-preview';tip.role='tooltip';tip.hidden=true;document.querySelector('.map-workspace').append(tip);
 let target=null,origin=null,point={x:0,y:0},frame=0;
 const selector='#pins [data-index],#chart [data-index],#alerts [data-index]';
 function hide(){if(target)target.removeAttribute('aria-describedby');target=null;tip.hidden=true;document.querySelectorAll('.motor-hover').forEach(el=>el.classList.remove('motor-hover'));}
 function refresh(){
  if(!target||!target.isConnected||!target.getClientRects().length){hide();return;}
  const index=Number(target.dataset.index),m=motors[index];if(!m){hide();return;}
  document.querySelectorAll(selector).forEach(el=>el.classList.toggle('motor-hover',Number(el.dataset.index)===index));
  tip.replaceChildren();const name=document.createElement('strong'),meta=document.createElement('span'),value=document.createElement('b'),hint=document.createElement('small');
  name.textContent=m.label;meta.textContent=`${m.id} · Class ${['I','II','III','IV'][m.cls]} · ${m.zone||'ไม่ระบุพื้นที่'}`;
  value.textContent=`${m.value.toFixed(2)} mm/s RMS · Zone ${'ABCD'[state(m)]}`;value.style.color=colors[state(m)];hint.textContent='ข้อมูลจำลอง · คลิก / Enter เพื่อเปิดด้านข้าง';tip.append(name,meta,value,hint);tip.hidden=false;target.setAttribute('aria-describedby',tip.id);
  const box=tip.getBoundingClientRect();tip.style.left=`${Math.max(8,Math.min(innerWidth-box.width-8,point.x+16))}px`;tip.style.top=`${Math.max(8,Math.min(innerHeight-box.height-8,point.y+18))}px`;
 }
 window.refreshMotorHover=refresh;
 function show(el,x,y){if(target!==el)hide();target=el;point={x,y};refresh();}
 document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const el=e.target.closest(selector);if(el)show(el,e.clientX,e.clientY);});
 document.addEventListener('pointermove',e=>{if(!target||e.pointerType!=='mouse')return;point={x:e.clientX,y:e.clientY};if(!frame)frame=requestAnimationFrame(()=>{frame=0;refresh();});});
 document.addEventListener('pointerout',e=>{if(target&&target.contains(e.target)&&!target.contains(e.relatedTarget))hide();});
 document.addEventListener('focusin',e=>{const el=e.target.closest(selector);if(el){const r=el.getBoundingClientRect();show(el,r.right,r.top);}else hide();});
 document.addEventListener('focusout',hide);
 document.addEventListener('click',e=>{const el=e.target.closest(selector);if(el){origin=el;hide();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();if(e.key==='Enter'||e.key===' '){const el=e.target.closest(selector);if(el){origin=el;hide();}}});
 window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
 $('close-inspector').addEventListener('click',()=>{if(origin?.isConnected)origin.focus({preventScroll:true});hide();});
 document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();setView('overview');window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
 $('pause').setAttribute('aria-label','หยุดข้อมูลจำลอง');$('pause').setAttribute('aria-pressed','false');
 $('pause').addEventListener('click',()=>{$('pause').setAttribute('aria-pressed',String(paused));document.body.classList.toggle('simulation-paused',paused);});
 // One delegated listener, no per-card listeners or continuous animation loop.
 document.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const panel=e.target.closest('.panel,.motor-card');if(!panel)return;const r=panel.getBoundingClientRect();panel.style.setProperty('--mouse-x',`${e.clientX-r.left}px`);panel.style.setProperty('--mouse-y',`${e.clientY-r.top}px`);});
})();
/* Local map camera: buttons work with touch/keyboard; drag only the map background. */
(()=>{
 const map=$('plant'),host=map.parentElement,bar=document.createElement('div');bar.className='map-controls';bar.setAttribute('aria-label','ปรับมุมมองแปลน');bar.innerHTML='<span>แปลนจำลอง · ลากเพื่อเลื่อน</span><button type="button" data-camera="out" aria-label="ย่อแปลน">−</button><output aria-live="polite">100%</output><button type="button" data-camera="in" aria-label="ขยายแปลน">＋</button><button type="button" data-camera="fit">พอดี</button>';host.append(bar);
 let camera={x:0,y:0,w:1600,h:950},drag=null;
 function paint(){map.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);bar.querySelector('output').textContent=`${Math.round(1600/camera.w*100)}%`;bar.querySelector('[data-camera="in"]').disabled=camera.w<=400;bar.querySelector('[data-camera="out"]').disabled=camera.w>=1600;}
 function clamp(){camera.x=Math.max(0,Math.min(1600-camera.w,camera.x));camera.y=Math.max(0,Math.min(950-camera.h,camera.y));paint();}
 bar.addEventListener('click',e=>{const action=e.target.closest('[data-camera]')?.dataset.camera;if(!action)return;if(action==='fit'){camera={x:0,y:0,w:1600,h:950};paint();return;}const w=Math.max(400,Math.min(1600,camera.w*(action==='in'?.8:1.25))),h=w*950/1600;camera={x:camera.x+(camera.w-w)/2,y:camera.y+(camera.h-h)/2,w,h};clamp();});
 map.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('[data-index]')||drag)return;const matrix=map.getScreenCTM();if(!matrix)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,cx:camera.x,cy:camera.y,scale:matrix.a};map.setPointerCapture(e.pointerId);map.classList.add('dragging');});
 map.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;camera.x=drag.cx-(e.clientX-drag.x)/drag.scale;camera.y=drag.cy-(e.clientY-drag.y)/drag.scale;clamp();});
 function end(e){if(drag?.id!==e.pointerId)return;drag=null;map.classList.remove('dragging');}
 map.addEventListener('pointerup',end);map.addEventListener('pointercancel',end);map.addEventListener('lostpointercapture',end);paint();
})();
/* Keep map targets legible as the viewport and camera change. */
(()=>{
 window.updateMapPinScale=()=>{const scale=$('plant').getScreenCTM()?.a;if(!scale)return;const size=Math.max(1,Math.min(2.6,.72/scale));const pins=[...document.querySelectorAll('#pins [data-index]')];pins.forEach(el=>{const m=motors[Number(el.dataset.index)];if(m)el.setAttribute('transform',`translate(${m.x*16} ${m.y*9.5}) scale(${size})`);el.removeAttribute('data-compact');});const occupied=[];pins.sort((a,b)=>Number(Number(b.dataset.index)===selected)-Number(Number(a.dataset.index)===selected)).forEach(el=>{const r=el.querySelector('rect').getBoundingClientRect();if(occupied.some(b=>r.left<b.right+3&&r.right>b.left-3&&r.top<b.bottom+3&&r.bottom>b.top-3))el.setAttribute('data-compact','true');else occupied.push(r);});};
 const observer=new MutationObserver(()=>window.updateMapPinScale());observer.observe($('plant'),{attributes:true,attributeFilter:['viewBox']});new ResizeObserver(()=>window.updateMapPinScale()).observe($('plant'));window.updateMapPinScale();
})();
/* Expanded workspace includes both independent motor panels. Native fullscreen has a viewport fallback. */
(()=>{
 const workspace=document.querySelector('.map-workspace'),button=document.createElement('button');button.type='button';button.id='expand-map';button.textContent='⛶ เต็มจอ';button.setAttribute('aria-label','ขยายแปลนเต็มจอ');button.setAttribute('aria-expanded','false');document.querySelector('.map-controls').append(button);
 let expanded=false,busy=false,previousFocus=null,dialogHomes=[];
 function enter(){previousFocus=document.activeElement;expanded=true;workspace.classList.add('is-expanded');document.body.classList.add('map-fullscreen');button.textContent='✕ ออกเต็มจอ';button.setAttribute('aria-label','ออกจากแปลนเต็มจอ');button.setAttribute('aria-expanded','true');dialogHomes=[...document.querySelectorAll('dialog')].map(el=>({el,parent:el.parentNode,next:el.nextSibling}));dialogHomes.forEach(({el})=>workspace.append(el));button.focus({preventScroll:true});}
 function restore(){if(!expanded)return;expanded=false;workspace.classList.remove('is-expanded');document.body.classList.remove('map-fullscreen');button.textContent='⛶ เต็มจอ';button.setAttribute('aria-label','ขยายแปลนเต็มจอ');button.setAttribute('aria-expanded','false');[...dialogHomes].reverse().forEach(({el,parent,next})=>parent.insertBefore(el,next?.parentNode===parent?next:null));dialogHomes=[];previousFocus?.focus({preventScroll:true});}
 async function leave(){if(document.fullscreenElement===workspace){try{await document.exitFullscreen();}catch{restore();}}else restore();}
 button.addEventListener('click',async()=>{if(busy)return;busy=true;try{if(expanded)await leave();else{enter();try{await workspace.requestFullscreen?.();}catch{/* Keep the viewport fallback when fullscreen is unsupported or denied. */}}}finally{busy=false;}});
 document.addEventListener('fullscreenchange',()=>{if(expanded&&document.fullscreenElement!==workspace)restore();});
 document.addEventListener('keydown',e=>{if(!expanded||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();leave();}if(e.key==='Tab'){const candidates=[...workspace.querySelectorAll('button:not(:disabled),[tabindex="0"],a[href],input,select')].filter(el=>el.getClientRects().length);const i=candidates.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();candidates.at(-1)?.focus();}else if(!e.shiftKey&&(i===candidates.length-1||i<0)){e.preventDefault();candidates[0]?.focus();}}},true);
})();
