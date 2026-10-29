'use strict';
let fleetViewMode='flow', flowItems=[], flowFrame=0, flowAddingSensorGroup='';
let savedFlowBuses=[];
function flowSavedBuses(){return savedFlowBuses;}
function setupFlowUI(){
  $('connection-dialog').addEventListener('close',()=>{flowAddingSensorGroup='';});
  const view=$('fleet-view'), toolbar=view.querySelector('.fleet-toolbar'), legacy=node('div'); legacy.id='fleet-legacy';
  for(const item of [$('fleet-empty'),$('fleet-list'),$('fleet-no-matches'),view.querySelector(':scope > .footnote')]) legacy.append(item);
  view.append(legacy);
  const switcher=node('div',null,'flow-switch');switcher.setAttribute('aria-label','มุมมองภาพรวม');
  const flow=node('button','แผนผัง'),list=node('button','รายการอุปกรณ์');flow.type=list.type='button';flow.id='flow-mode';list.id='list-mode';
  flow.onclick=()=>setFleetMode('flow');list.onclick=()=>setFleetMode('list');switcher.append(flow,list);toolbar.querySelector('.inline-controls').prepend(switcher);
  const panel=node('section',null,'flow-panel');panel.id='flow-panel';toolbar.after(panel);
  setFleetMode('flow');
}
function setFleetMode(value){
  fleetViewMode=value; if(!$('flow-panel'))return;
  $('flow-panel').hidden=value!=='flow';$('fleet-legacy').hidden=value!=='list';document.querySelector('.fleet-totals').hidden=value==='flow';$('fleet-filter').hidden=value!=='list';
  $('flow-mode').setAttribute('aria-pressed',String(value==='flow'));$('list-mode').setAttribute('aria-pressed',String(value==='list'));
  $('graph-tools').hidden=!((currentTab==='monitor'&&profiles.length)||(currentTab==='fleet'&&value==='list'));
  if(value==='flow')renderFlow();else refreshFleet();
}
function renderFlow(){
  const panel=$('flow-panel');if(!panel)return;
  const group=measurementGroups.find(g=>g.id===selectedMeasurementGroup), groupProfiles=group?group.motorIds.map(id=>profiles.find(p=>p.motorId===id)||{motorId:id,missing:true}):profiles.filter(p=>p.enabled!==false);
  const meters=group?.meters||[], buses=new Map();flowItems=[];
  const addBus=(item,type)=>{const key=(item.path||'').trim().toUpperCase()||'?';if(!buses.has(key))buses.set(key,{key,path:item.path||'ไม่ได้ตั้งพอร์ต',items:[]});buses.get(key).items.push({item,type});};
  groupProfiles.forEach(p=>addBus(p,'sensor'));meters.forEach(m=>addBus(m,'meter'));
  for(const config of flowSavedBuses()){const key=String(config.path||'').toUpperCase();if(key&&!buses.has(key))buses.set(key,{key,path:config.path,items:[],config});else if(key)buses.get(key).config=config;}
  panel.replaceChildren();
  const groupChoice=node('label',null,'flow-group-choice');groupChoice.append(node('span','พื้นที่งานสำหรับรอบถัดไป'));const groupSelect=node('select');groupSelect.id='flow-group-select';groupSelect.setAttribute('aria-label','เลือกพื้นที่งานสำหรับรอบถัดไป');groupSelect.add(new Option('อุปกรณ์เดิมที่เปิดอ่าน (ไม่รวม Power Meter)',''));measurementGroups.forEach(item=>groupSelect.add(new Option(`${item.name} · ${item.motorIds.length+item.meters.length} อุปกรณ์`,item.id)));groupSelect.value=selectedMeasurementGroup;groupSelect.disabled=mode!=='offline'||busy;groupSelect.onchange=()=>{const target=$('groups-select');target.value=groupSelect.value;target.dispatchEvent(new Event('change'));};groupChoice.append(groupSelect);panel.append(groupChoice);
  const missing=[...groupProfiles,...meters].filter(item=>String(item.path||'').toUpperCase().startsWith('UNBOUND:'));
  if(missing.length){const warning=node('p',`ยังมี ${missing.length} อุปกรณ์ที่ไม่ได้เชื่อมบัส · กดเปลี่ยนบัสหรือลากไปยังพอร์ตก่อนเริ่มอ่าน`,'flow-setup-warning');warning.setAttribute('role','status');panel.append(warning);}
  else if(!group&&measurementGroups.some(item=>item.meters.length)){const warning=node('p','ยังไม่ได้เลือกพื้นที่งาน · รอบนี้อ่านเฉพาะอุปกรณ์เดิมที่เปิดใช้งาน และไม่รวม Power Meter','flow-setup-warning');warning.setAttribute('role','status');panel.append(warning);}
  const head=node('div',null,'flow-header'), title=node('div');title.append(node('h2','แผนผังการเชื่อมต่อ'),node('p',group?`พื้นที่งาน: ${group.name}`:'อุปกรณ์เดิมที่เปิดอ่านทั้งหมด · ยังไม่ได้เลือกพื้นที่งาน'));
  const actions=node('div',null,'flow-actions');const addButton=node('button','＋ เพิ่มอุปกรณ์','primary');addButton.type='button';addButton.onclick=openFlowAddDevice;actions.append(addButton);const busAdd=node('button','＋ เพิ่มบัส Modbus');busAdd.type='button';busAdd.onclick=()=>openFlowNewBus(buses);actions.append(busAdd);const groupButton=node('button','เลือก / จัดการพื้นที่งาน');groupButton.type='button';groupButton.onclick=()=>{if(busy)return;if(mode!=='offline')return stopBeforeChange(()=>groupButton.click());$('groups-quick').click();};actions.append(groupButton);head.append(title,actions);panel.append(head);
  const note=node('p','เส้นแสดงการตั้งค่าในโปรแกรม ไม่ใช่การตรวจพบสายจริง · ลากอุปกรณ์ไปยังบัส หรือกดเปลี่ยนบัส · อ่านตามลำดับ','flow-note');panel.append(note);
  if(!buses.size){const empty=node('div',null,'flow-empty');empty.append(node('strong','พื้นที่งานยังไม่มีอุปกรณ์'),node('p','เพิ่มอุปกรณ์และบัส แล้วเชื่อมอุปกรณ์เข้ากับบัสในแผนผัง'));const b=node('button','เพิ่มอุปกรณ์','primary');b.onclick=openFlowAddDevice;empty.append(b);panel.append(empty);return;}
  const canvas=node('div',null,'flow-canvas'), lanes=node('div',null,'flow-lanes'), devices=node('div',null,'flow-column'),buscol=node('div',null,'flow-column flow-buses'),hostcol=node('div',null,'flow-column flow-computer');
  devices.append(node('h3','อุปกรณ์วัด'));buscol.append(node('h3','บัสสื่อสาร'));hostcol.append(node('h3','เครื่องรับข้อมูล'));
  const links=[];
  for(const bus of buses.values()){
    const sourceGroup=node('div',null,'flow-device-group');
    for(const {item,type} of bus.items){
      const deviceWrap=node('div',null,'flow-device-wrap');const button=node('button',null,`flow-node ${type}`);button.type='button';button.draggable=!item.missing;button.ondragstart=event=>{event.dataTransfer.setData('text/plain',JSON.stringify({type,id:type==='sensor'?item.motorId:item.id}));event.dataTransfer.effectAllowed='move';};button.dataset.nodeType=type;button.dataset.nodeId=type==='sensor'?item.motorId:item.id;button.dataset.nodePort=bus.key;
      const header=node('span',type==='sensor'?(item.sensorModel===MODEL?'เซ็นเซอร์ · VemSee':'อุปกรณ์ · กำหนดเอง'):'POWER METER · PM2200','flow-node-kind'),name=node('strong',type==='sensor'?(item.name||item.motorId):(item.name||item.id));
      const unbound=bus.key.startsWith('UNBOUND:');const info=node('span',item.missing?'ไม่พบในทะเบียน':`${type==='sensor'?item.motorId:item.id} · ${unbound?'ยังไม่เชื่อมบัส':bus.path} / ID ${item.slaveId}`,'flow-node-info');
      const status=node('span','','flow-status');button.append(header,name,info,status);
      if(type==='meter'){button.append(node('span',item.point==='motor-input'?'ไฟเข้ามอเตอร์':item.point==='generator-output'?'ไฟออกเจเนอเรเตอร์':'จุดวัดอื่น','flow-node-info'));button.append(node('span',item.byteOrder==='unconfirmed'?'รอยืนยัน Float / Address':'Address ต้องเทียบกับมิเตอร์','flow-warn'));}
      button.onclick=()=>item.missing?toast('ไม่พบอุปกรณ์ในทะเบียน กรุณาแก้ไขพื้นที่งาน'):type==='sensor'?openEditor(profiles.find(p=>p.motorId===item.motorId)):openFlowMeterEditor(item.id);
      deviceWrap.append(button);if(!item.missing){const link=node('button','เปลี่ยนบัส','flow-relink');link.type='button';link.onclick=()=>openFlowRelink(type,item,buses);deviceWrap.append(link);}sourceGroup.append(deviceWrap);flowItems.push({button,status,item,type});
    }
    devices.append(sourceGroup);
    if(bus.key.startsWith('UNBOUND:')) continue;
    const busButton=node('button',null,'flow-node bus');busButton.type='button';busButton.dataset.nodeType='bus';busButton.dataset.nodePort=bus.key;busButton.append(node('span','RS485 · MODBUS RTU','flow-node-kind'),node('strong',bus.path),node('span',`${bus.items.length} อุปกรณ์ · พอร์ต RS485 / USB Adapter`,'flow-node-info'),node('span','ดูการตั้งค่าพอร์ต →','flow-action'));
    busButton.onclick=()=>openFlowBus(bus);busButton.ondragover=event=>{event.preventDefault();event.dataTransfer.dropEffect='move';};busButton.ondrop=event=>{event.preventDefault();try{const dragged=JSON.parse(event.dataTransfer.getData('text/plain'));void moveFlowDevice(dragged.type,dragged.id,bus);}catch{toast('เลือกอุปกรณ์แล้วลองใหม่');}};buscol.append(busButton);
    for(const element of sourceGroup.querySelectorAll('.flow-node'))links.push([element,busButton]);
    bus.button=busButton;
  }
  const pc=node('button',null,'flow-node computer');pc.type='button';pc.dataset.nodeType='computer';pc.append(node('span','เครื่องนี้','flow-node-kind'),node('strong','VECTRA Monitor'),node('span','รับและบันทึกข้อมูลในเครื่อง','flow-node-info'),node('span','ตั้งค่าการบันทึก →','flow-action'));pc.onclick=()=>{if(busy)return;if(mode!=='offline')return stopBeforeChange(()=>$('record-settings').click());$('record-settings').click();};hostcol.append(pc);
  buses.forEach(bus=>{if(bus.button)links.push([bus.button,pc]);});lanes.append(devices,buscol,hostcol);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('flow-wires');svg.setAttribute('aria-hidden','true');canvas.append(svg,lanes);panel.append(canvas);
  const redraw=()=>{if(!canvas.isConnected||!canvas.clientWidth)return;svg.replaceChildren();const area=canvas.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${canvas.clientWidth} ${canvas.scrollHeight}`);svg.setAttribute('height',canvas.scrollHeight);for(const [a,b] of links){const x=a.getBoundingClientRect(),y=b.getBoundingClientRect(),x1=x.right-area.left,y1=x.top+x.height/2-area.top,x2=y.left-area.left,y2=y.top+y.height/2-area.top,mid=(x1+x2)/2;const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);svg.append(path);}};
  cancelAnimationFrame(flowFrame);flowFrame=requestAnimationFrame(redraw);if(window.flowResizeObserver)window.flowResizeObserver.disconnect();window.flowResizeObserver=new ResizeObserver(()=>requestAnimationFrame(redraw));window.flowResizeObserver.observe(canvas);refreshFlowStatus();
}
function refreshFlowStatus(){
  for(const ref of flowItems){let text='หยุดอ่าน',kind='idle';
    if(ref.item.missing){text='ไม่พบในทะเบียน';kind='fault';}
    else if(String(ref.item.path||'').toUpperCase().startsWith('UNBOUND:')){text='ยังไม่เชื่อมบัส';kind='idle';}
    else if(ref.type==='sensor'){const status=fleetStatus(ref.item,stateFor(ref.item.motorId));text=status.text;kind=status.kind;}
    else if(mode==='demo'){text='ไม่ได้จำลองมิเตอร์';}
    else if(mode==='live'){const reading=powerStates.get(ref.item.id);if(!reading)text='รอข้อมูล';else if(reading.state==='receiving'){if(reading.presetError||reading.points?.some(point=>point.status==='read-error')){text='บางจุดอ่านไม่สำเร็จ';kind='fault';}else{text='รับข้อมูล';kind='online';}}else{text='ขัดข้อง';kind='fault';}}
    ref.status.textContent=text;ref.status.dataset.status=kind;
  }
}
function openFlowBus(bus){
  const dialog=node('dialog',null,'flow-dialog'),header=node('div',null,'dialog-header'),heading=node('div');heading.append(node('h2',`พอร์ต ${bus.path}`),node('p',bus.items.length?'ตั้งค่าการสื่อสารร่วมของอุปกรณ์บนบัสนี้':'บัสที่เพิ่มไว้ ยังไม่มีอุปกรณ์เชื่อม'));const close=node('button','ปิด');close.onclick=()=>dialog.close();header.append(heading,close);dialog.append(header);
  const body=node('div',null,'flow-dialog-body');const configure=node('button','ตั้งค่าการสื่อสารบัส');configure.type='button';configure.disabled=!bus.config&&!bus.items.some(entry=>entry.item.path);configure.onclick=()=>{dialog.close();openFlowNewBus(new Map(),bus);};body.append(configure);if(!bus.items.length){const config=bus.config;body.append(node('p',`${config.baudRate} baud · ${config.parity} · ${config.stopBits} stop bit`));const remove=node('button','ลบบัสที่ยังไม่ใช้งาน');remove.onclick=async()=>{try{savedFlowBuses=check(await api.saveBuses(flowSavedBuses().filter(item=>item.path.toUpperCase()!==bus.key))).buses;dialog.close();renderFlow();}catch(error){toast(`ลบบัสไม่สำเร็จ: ${error.message}`);}};body.append(remove);}for(const {item,type} of bus.items){const button=node('button',`${type==='sensor'?'เซ็นเซอร์':'Power Meter'} · ${item.name||item.motorId||item.id} · ID ${item.slaveId??'—'} →`);button.onclick=()=>{dialog.close();if(type==='sensor'){if(item.missing)toast('ไม่พบอุปกรณ์ในทะเบียน');else openEditor(profiles.find(p=>p.motorId===item.motorId));}else openFlowMeterEditor(item.id);};body.append(button);}dialog.append(body);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}

function openFlowAddDevice(){
  if(busy)return;if(mode!=='offline')return stopBeforeChange(openFlowAddDevice);
  const dialog=node('dialog',null,'flow-dialog');const header=node('div',null,'dialog-header');header.append(node('h2','เพิ่มอุปกรณ์'));const close=node('button','ปิด');close.onclick=()=>dialog.close();header.append(close);dialog.append(header);
  const body=node('div',null,'flow-dialog-body flow-device-choices');body.append(node('p','เลือกแบบตั้งต้นตามอุปกรณ์ หรือกำหนด Register เอง แล้วเชื่อมอุปกรณ์เข้ากับบัสในแผนผัง'));
  const choose=(title,description,action)=>{const button=node('button',null,'flow-choice');button.type='button';button.append(node('strong',title),node('span',description));button.onclick=action;body.append(button);};
  choose('VemSee SN-3001-WZ3A-N01','เซ็นเซอร์ความสั่น 3 แกน · ใช้ Register จากคู่มือ',async()=>{dialog.close();flowAddingSensorGroup=selectedMeasurementGroup;await openEditor(undefined,'__UNBOUND__');});
  choose('Schneider PM2200','Power Meter · ตรวจสอบ Address และลำดับ Float กับเครื่องจริง',()=>{dialog.close();openFlowNewMeter();});
  choose('กำหนดอุปกรณ์เอง','อุปกรณ์ Modbus รุ่นอื่น · เพิ่มจุดวัดและ Register เอง',async()=>{dialog.close();flowAddingSensorGroup=selectedMeasurementGroup;await openEditor(undefined,'__UNBOUND__');form.elements.sensorModel.value='custom';$('points-enabled').checked=true;if(!$('points-body').children.length)addPointRow({});presetVisibility();editorBaseline=JSON.stringify(configFromForm());});
  dialog.append(body);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
function openFlowRelink(type,item,buses){
  if(busy)return;if(mode!=='offline')return stopBeforeChange(()=>openFlowRelink(type,item,buses));
  const dialog=node('dialog',null,'flow-dialog'),header=node('div',null,'dialog-header');header.append(node('h2','เปลี่ยนบัสของอุปกรณ์'));const close=node('button','ปิด');close.onclick=()=>dialog.close();header.append(close);dialog.append(header);
  const body=node('div',null,'flow-dialog-body');body.append(node('p','เลือกบัสที่ตั้งค่าแล้ว การเปลี่ยนจะบันทึก COM และค่าการสื่อสารไปยังอุปกรณ์'));
  for(const bus of buses.values()){if(bus.key==='?'||bus.key.startsWith('UNBOUND:'))continue;const b=node('button',`${bus.path} · ${bus.items.length} อุปกรณ์`);b.onclick=()=>{dialog.close();void moveFlowDevice(type,type==='sensor'?item.motorId:item.id,bus);};body.append(b);}dialog.append(body);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
async function moveFlowDevice(type,id,bus){
  if(busy)return;if(mode!=='offline')return stopBeforeChange(()=>moveFlowDevice(type,id,bus));
  try{
    const template=bus.config||bus.items.find(entry=>entry.item.path)?.item;if(!template||!['sensor','meter'].includes(type))throw new Error('ไม่พบการตั้งค่าบัส');
    const serial={path:template.path,baudRate:template.baudRate,parity:template.parity,stopBits:template.stopBits};
    if(type==='sensor'){
      const profile=profiles.find(p=>p.motorId===id);if(!profile)throw new Error('ไม่พบเซ็นเซอร์');
      const updated=profiles.map(p=>p.motorId===id?{...p,...serial}:p);
      for(const group of measurementGroups){
        const sensors=group.motorIds.map(key=>updated.find(p=>p.motorId===key)).filter(Boolean), devices=[...sensors,...group.meters], keys=new Set(),serials=new Map();
        for(const dev of devices){const port=dev.path.toUpperCase(),key=`${port}:${dev.slaveId}`,setting=JSON.stringify([dev.baudRate,dev.parity,dev.stopBits]);if(keys.has(key))throw new Error(`Slave ID ซ้ำในชุด ${group.name}: ${key}`);if(serials.has(port)&&serials.get(port)!==setting)throw new Error(`ค่าการสื่อสารไม่ตรงกันในชุด ${group.name}: ${port}`);keys.add(key);serials.set(port,setting);}
      }
      profiles=check(await api.saveProfiles(updated)).profiles;cache.delete(id);renderProfiles();renderSelected();
    }else{
      const group=measurementGroups.find(g=>g.id===selectedMeasurementGroup);if(!group||!group.meters.some(m=>m.id===id))throw new Error('ไม่พบมิเตอร์ในชุดที่เลือก');
      const groups=measurementGroups.map(g=>g.id===group.id?{...g,meters:g.meters.map(m=>m.id===id?{...m,...serial}:m)}:g);
      measurementGroups=check(await api.saveGroups(groups)).groups;renderGroupOptions();renderFlow();
    }
    toast(`เชื่อม ${id} กับ ${serial.path} แล้ว · ตรวจสายจริงและ Slave ID`);
  }catch(error){toast(`เชื่อมบัสไม่สำเร็จ: ${error.message}`);}
}

function openFlowNewBus(buses,existing=null){
  if(busy)return;if(mode!=='offline')return stopBeforeChange(()=>openFlowNewBus(buses,existing));
  const dialog=node('dialog',null,'flow-dialog'),header=node('div',null,'dialog-header');header.append(node('h2',existing?'ตั้งค่าบัส Modbus RTU':'เพิ่มบัส Modbus RTU'));const close=node('button','ปิด');close.onclick=()=>dialog.close();header.append(close);dialog.append(header);
  const form=node('form',null,'flow-dialog-body');form.innerHTML=`<p>บัสคือพอร์ต RS485 ที่ใช้ร่วมกัน อุปกรณ์ที่เชื่อมต้องใช้ Baud rate, Parity และ Stop bits ตรงกัน</p><label>COM Port <input name="path" required maxlength="128" placeholder="เช่น COM3"></label><label>Baud rate <select name="baudRate"><option>9600</option><option>19200</option><option>38400</option><option>57600</option><option>115200</option><option>4800</option><option>2400</option><option>1200</option></select></label><label>Parity <select name="parity"><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></select></label><label>Stop bits <select name="stopBits"><option value="1">1</option><option value="2">2</option></select></label><p class="flow-bus-error" role="alert"></p><button type="submit" class="primary">เพิ่มบัส</button>`;
  if(existing){const c=existing.config||existing.items.find(entry=>entry.item.path)?.item;form.elements.path.value=existing.path;form.elements.path.readOnly=true;form.elements.baudRate.value=String(c.baudRate);form.elements.parity.value=c.parity;form.elements.stopBits.value=String(c.stopBits);form.querySelector('button[type=submit]').textContent='บันทึกค่าบัส';}
  form.onsubmit=async event=>{event.preventDefault();const path=form.elements.path.value.trim();if(!path){form.querySelector('.flow-bus-error').textContent='ระบุ COM Port';return;}if(!existing&&buses.has(path.toUpperCase())){form.querySelector('.flow-bus-error').textContent='พอร์ตนี้มีในแผนผังแล้ว';return;}const saved=flowSavedBuses().filter(item=>item.path.toUpperCase()!==path.toUpperCase());saved.push({path,baudRate:Number(form.elements.baudRate.value),parity:form.elements.parity.value,stopBits:Number(form.elements.stopBits.value)});try{savedFlowBuses=check(await api.saveBuses(saved)).buses;}catch(error){form.querySelector('.flow-bus-error').textContent=`บันทึกบัสไม่สำเร็จ: ${error.message}`;return;}const updated=savedFlowBuses.find(item=>item.path.toUpperCase()===path.toUpperCase());if(updated){const merge=item=>item.path.toUpperCase()===path.toUpperCase()?{...item,baudRate:updated.baudRate,parity:updated.parity,stopBits:updated.stopBits}:item;profiles=profiles.map(merge);measurementGroups=measurementGroups.map(group=>({...group,meters:group.meters.map(merge)}));renderProfiles();renderGroupOptions();}dialog.close();renderFlow();};
  dialog.append(form);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
