'use strict';
let fleetViewMode='flow', flowItems=[], flowFrame=0;
function setupFlowUI(){
  const view=$('fleet-view'), toolbar=view.querySelector('.fleet-toolbar'), legacy=node('div'); legacy.id='fleet-legacy';
  for(const item of [$('fleet-empty'),$('fleet-list'),$('fleet-no-matches'),view.querySelector(':scope > .footnote')]) legacy.append(item);
  view.append(legacy);
  const switcher=node('div',null,'flow-switch');switcher.setAttribute('aria-label','มุมมองภาพรวม');
  const flow=node('button','แผนผัง'),list=node('button','รายการและกราฟ');flow.type=list.type='button';flow.id='flow-mode';list.id='list-mode';
  flow.onclick=()=>setFleetMode('flow');list.onclick=()=>setFleetMode('list');switcher.append(flow,list);toolbar.querySelector('.inline-controls').prepend(switcher);
  const panel=node('section',null,'flow-panel');panel.id='flow-panel';toolbar.after(panel);
  setFleetMode('flow');
}
function setFleetMode(value){
  fleetViewMode=value; if(!$('flow-panel'))return;
  $('flow-panel').hidden=value!=='flow';$('fleet-legacy').hidden=value!=='list';$('fleet-filter').hidden=value!=='list';
  $('flow-mode').setAttribute('aria-pressed',String(value==='flow'));$('list-mode').setAttribute('aria-pressed',String(value==='list'));
  $('graph-tools').hidden=!(currentTab==='monitor'||(currentTab==='fleet'&&value==='list'));
  if(value==='flow')renderFlow();else refreshFleet();
}
function renderFlow(){
  const panel=$('flow-panel');if(!panel)return;
  const group=measurementGroups.find(g=>g.id===selectedMeasurementGroup), groupProfiles=group?group.motorIds.map(id=>profiles.find(p=>p.motorId===id)||{motorId:id,missing:true}):profiles.filter(p=>p.enabled!==false);
  const meters=group?.meters||[], buses=new Map();flowItems=[];
  const addBus=(item,type)=>{const key=(item.path||'').trim().toUpperCase()||'?';if(!buses.has(key))buses.set(key,{key,path:item.path||'ไม่ได้ตั้งพอร์ต',items:[]});buses.get(key).items.push({item,type});};
  groupProfiles.forEach(p=>addBus(p,'sensor'));meters.forEach(m=>addBus(m,'meter'));
  panel.replaceChildren();
  const head=node('div',null,'flow-header'), title=node('div');title.append(node('h2','แผนผังการเชื่อมต่อ'),node('p',group?`ชุดการวัด: ${group.name}`:'มอเตอร์ที่เปิดอ่านทั้งหมด · ยังไม่ได้เลือกชุดการวัด'));
  const groupButton=node('button','เลือก / จัดการชุด');groupButton.type='button';groupButton.onclick=()=>{if(busy)return;if(mode!=='offline')return stopBeforeChange(()=>groupButton.click());$('groups-quick').click();};head.append(title,groupButton);panel.append(head);
  const note=node('p','เส้นแสดงการตั้งค่าในโปรแกรม ไม่ใช่การตรวจพบสายจริง · บัสเดียวกันอ่านอุปกรณ์ตามลำดับ','flow-note');panel.append(note);
  if(!buses.size){const empty=node('div',null,'flow-empty');empty.append(node('strong','ยังไม่มีอุปกรณ์ในแผนผัง'),node('p','เพิ่มมอเตอร์ หรือเลือกชุดการวัดที่มีเซ็นเซอร์และ Power Meter'));const b=node('button','เพิ่มมอเตอร์','primary');b.onclick=()=>openEditor();empty.append(b);panel.append(empty);return;}
  const canvas=node('div',null,'flow-canvas'), lanes=node('div',null,'flow-lanes'), devices=node('div',null,'flow-column'),buscol=node('div',null,'flow-column flow-buses'),hostcol=node('div',null,'flow-column flow-computer');
  devices.append(node('h3','อุปกรณ์วัด'));buscol.append(node('h3','บัสสื่อสาร'));hostcol.append(node('h3','เครื่องรับข้อมูล'));
  const links=[];
  for(const bus of buses.values()){
    const sourceGroup=node('div',null,'flow-device-group');
    for(const {item,type} of bus.items){
      const button=node('button',null,`flow-node ${type}`);button.type='button';button.dataset.nodeType=type;button.dataset.nodeId=type==='sensor'?item.motorId:item.id;button.dataset.nodePort=bus.key;
      const header=node('span',type==='sensor'?'เซ็นเซอร์สั่น':'POWER METER','flow-node-kind'),name=node('strong',type==='sensor'?(item.name||item.motorId):(item.name||item.id));
      const info=node('span',item.missing?'ไม่พบในทะเบียน':`${type==='sensor'?item.motorId:item.id} · ${bus.path} / ID ${item.slaveId}`,'flow-node-info');
      const status=node('span','','flow-status');button.append(header,name,info,status);
      if(type==='meter'){button.append(node('span',item.point==='motor-input'?'ไฟเข้ามอเตอร์':item.point==='generator-output'?'ไฟออกเจเนอเรเตอร์':'จุดวัดอื่น','flow-node-info'));button.append(node('span',item.byteOrder==='unconfirmed'?'รอยืนยัน Float / Address':'Address ต้องเทียบกับมิเตอร์','flow-warn'));}
      button.onclick=()=>item.missing?toast('ไม่พบมอเตอร์ในทะเบียน กรุณาแก้ไขชุดการวัด'):type==='sensor'?openEditor(profiles.find(p=>p.motorId===item.motorId)):openFlowMeterEditor(item.id);
      sourceGroup.append(button);flowItems.push({button,status,item,type});
    }
    devices.append(sourceGroup);
    const busButton=node('button',null,'flow-node bus');busButton.type='button';busButton.dataset.nodeType='bus';busButton.dataset.nodePort=bus.key;busButton.append(node('span','MODBUS RTU','flow-node-kind'),node('strong',bus.path),node('span',`${bus.items.length} อุปกรณ์ · RS485`,'flow-node-info'),node('span','ดูการตั้งค่าพอร์ต →','flow-action'));
    busButton.onclick=()=>openFlowBus(bus);buscol.append(busButton);
    for(const element of sourceGroup.children)links.push([element,busButton]);
    bus.button=busButton;
  }
  const pc=node('button',null,'flow-node computer');pc.type='button';pc.dataset.nodeType='computer';pc.append(node('span','เครื่องนี้','flow-node-kind'),node('strong','VECTRA Monitor'),node('span','รับและบันทึกข้อมูลในเครื่อง','flow-node-info'),node('span','ตั้งค่าการบันทึก →','flow-action'));pc.onclick=()=>{if(busy)return;if(mode!=='offline')return stopBeforeChange(()=>$('record-settings').click());$('record-settings').click();};hostcol.append(pc);
  buses.forEach(bus=>links.push([bus.button,pc]));lanes.append(devices,buscol,hostcol);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('flow-wires');svg.setAttribute('aria-hidden','true');canvas.append(svg,lanes);panel.append(canvas);
  const redraw=()=>{if(!canvas.isConnected||!canvas.clientWidth)return;svg.replaceChildren();const area=canvas.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${canvas.clientWidth} ${canvas.scrollHeight}`);svg.setAttribute('height',canvas.scrollHeight);for(const [a,b] of links){const x=a.getBoundingClientRect(),y=b.getBoundingClientRect(),x1=x.right-area.left,y1=x.top+x.height/2-area.top,x2=y.left-area.left,y2=y.top+y.height/2-area.top,mid=(x1+x2)/2;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);svg.append(path);}};
  cancelAnimationFrame(flowFrame);flowFrame=requestAnimationFrame(redraw);if(window.flowResizeObserver)window.flowResizeObserver.disconnect();window.flowResizeObserver=new ResizeObserver(()=>requestAnimationFrame(redraw));window.flowResizeObserver.observe(canvas);refreshFlowStatus();
}
function refreshFlowStatus(){
  for(const ref of flowItems){let text='หยุดอ่าน',kind='idle';
    if(ref.item.missing){text='ไม่พบในทะเบียน';kind='fault';}
    else if(ref.type==='sensor'){const status=fleetStatus(ref.item,stateFor(ref.item.motorId));text=status.text;kind=status.kind;}
    else if(mode==='demo'){text='ไม่ได้จำลองมิเตอร์';}
    else if(mode==='live'){const reading=powerStates.get(ref.item.id);if(!reading)text='รอข้อมูล';else if(reading.state==='receiving'){text='รับข้อมูล';kind='online';}else{text='ขัดข้อง';kind='fault';}}
    ref.status.textContent=text;ref.status.dataset.status=kind;
  }
}
function openFlowBus(bus){
  const dialog=node('dialog',null,'flow-dialog'),header=node('div',null,'dialog-header'),heading=node('div');heading.append(node('h2',`พอร์ต ${bus.path}`),node('p','ตั้งค่าการสื่อสารที่อุปกรณ์ซึ่งใช้พอร์ตนี้'));const close=node('button','ปิด');close.onclick=()=>dialog.close();header.append(heading,close);dialog.append(header);
  const body=node('div',null,'flow-dialog-body');for(const {item,type} of bus.items){const button=node('button',`${type==='sensor'?'เซ็นเซอร์':'Power Meter'} · ${item.name||item.motorId||item.id} · ID ${item.slaveId??'—'} →`);button.onclick=()=>{dialog.close();if(type==='sensor'){if(item.missing)toast('ไม่พบมอเตอร์ในทะเบียน');else openEditor(profiles.find(p=>p.motorId===item.motorId));}else openFlowMeterEditor(item.id);};body.append(button);}dialog.append(body);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
