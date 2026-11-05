'use strict';
let connectingDevices=false;
let registerTemplates=[],editorDeviceKind='sensor',editorDeviceGroup='',editorTemplateId='';
const deviceTraffic=new Map();
const trafficKey=(kind,id)=>`${kind==='meter'||kind==='power'?'power':'sensor'}:${id}`;
const templateCatalog=()=>[...DeviceTemplates.builtins,...registerTemplates];
const deviceModel=()=>templateCatalog().find(item=>item.id===form.elements.sensorModel.value)?.settings.model||form.elements.sensorModel.value;
const deviceModelLabel=item=>DeviceTemplates.builtins.find(entry=>entry.settings.model===(item.sensorModel||item.model))?.name||'กำหนด Register เอง';
function renderTemplateOptions(value=form.elements.sensorModel.value){
  const select=form.elements.sensorModel;select.replaceChildren();
  for(const [label,items] of [['ผังมาตรฐาน',DeviceTemplates.builtins],['แม่แบบที่บันทึกไว้',registerTemplates]]){
    if(!items.length)continue;
    const group=node('optgroup');group.label=label;
    for(const item of items){const option=new Option(item.name,item.id);option.disabled=Boolean(editing)&&DeviceTemplates.isPower(item.settings.model)!==(editorDeviceKind==='meter');group.append(option);}
    select.append(group);
  }
  select.value=templateCatalog().some(item=>item.id===value)?value:MODEL;
}
function applyRegisterTemplate(){
  const template=templateCatalog().find(item=>item.id===form.elements.sensorModel.value);if(!template)return;
  const settings=template.settings;editorTemplateId=template.id;
  // Apply a register snapshot only. Keep all instance fields, including Slave ID, untouched.
  for(const key of ['registerType','registerAddress','dataType','scale','unit','frequencyByteOrder'])if(settings[key]!==undefined)form.elements.namedItem(key).value=String(settings[key]);
  form.elements.byteOrder.value=settings.byteOrder==='unconfirmed'?'ABCD':settings.byteOrder||'ABCD';
  form.elements.powerByteOrder.value=settings.byteOrder||'unconfirmed';
  form.elements.powerOffset.value=String(settings.offsetAdjust??0);
  loadPointRows({points:settings.points});if(settings.model==='custom'&&!$('points-body').children.length)addPointRow({});presetVisibility();resetTest();
}
function renderDeviceRegisterMap(){
  const section=$('power-device-settings');if(!section)return;
  const power=DeviceTemplates.isPower(deviceModel());section.hidden=!power;
  if(!power)return;
  const body=$('device-preset-registers');body.replaceChildren();
  for(const field of PowerRegisters.preset(deviceModel()).fields){const row=node('tr');row.append(node('td',field.label),node('td',String(field.address+Number(form.elements.powerOffset.value)),'mono'),node('td','Float32'),node('td',field.unit));body.append(row);}
  $('device-register-source').textContent=deviceModel()==='pm2230'?'Schneider FA379514 · RTU Address = เลข Register ในคู่มือ − 1 · 2 Register ต่อค่า':'ผัง PM2200 เดิม · 2 Register ต่อค่า';
}
function meterFromDeviceForm(){
  const raw=configFromForm();
  return {enabled:editing?activeWorkspace()?.meters.find(item=>item.id===editing)?.enabled!==false:true,id:raw.motorId,name:raw.name,model:deviceModel(),point:raw.powerPoint||'motor-input',motorId:raw.powerOwner||'',
    path:raw.path,baudRate:raw.baudRate,parity:raw.parity,stopBits:raw.stopBits,slaveId:raw.slaveId,
    pollInterval:raw.pollInterval,deviceGapMs:raw.deviceGapMs,timeout:raw.timeout,registerType:raw.registerType,
    byteOrder:raw.powerByteOrder||'unconfirmed',offsetAdjust:Number(raw.powerOffset||0),points:$('points-enabled').checked?pointRows():[]};
}
async function openDeviceMeter(meter,model='pm2230'){
  const group=activeWorkspace();if(!group)return showWorkspacePicker();
  const initial=meter?{...meter,motorId:meter.id,sensorModel:meter.model,powerByteOrder:meter.byteOrder,powerOffset:meter.offsetAdjust,powerPoint:meter.point,powerOwner:meter.motorId,byteOrder:meter.byteOrder==='unconfirmed'?'ABCD':meter.byteOrder}:undefined;
  await openEditor(initial,meter?.path||'__UNBOUND__',{kind:'meter',model,isNew:!meter});
}
async function saveDeviceMeter(){
  if(!form.reportValidity())return;
  const group=measurementGroups.find(item=>item.id===editorDeviceGroup);if(!group)return toast('ไม่พบพื้นที่งานที่กำลังแก้ไข');
  const meter=meterFromDeviceForm();
  if(group.motorIds.some(id=>id.toUpperCase()===meter.id.toUpperCase())||group.meters.some(item=>item.id!==editing&&item.id.toUpperCase()===meter.id.toUpperCase())){
    $('form-error').textContent=`รหัสอุปกรณ์ ${meter.id} ซ้ำในพื้นที่งาน`; $('form-error').hidden=false;return;
  }
  setDialogBusy(true);
  try{
    const meters=editing?group.meters.map(item=>item.id===editing?meter:item):[...group.meters,meter];
    measurementGroups=check(await api.saveGroups(measurementGroups.map(item=>item.id===group.id?{...item,meters}:item))).groups;
    powerStates.delete(editing);powerStates.delete(meter.id);deviceTraffic.delete(trafficKey('power',editing));
    selectedMeterId=meter.id;flowAddingSensorGroup='';$('connection-dialog').close();renderGroupOptions();renderProfiles();renderSelected();updateControls();toast('บันทึกอุปกรณ์แล้ว');
  }catch(error){$('form-error').textContent=error.message;$('form-error').hidden=false;}
  finally{setDialogBusy(false);}
}
async function testDeviceMeter(){
  if(!form.reportValidity())return;
  setDialogBusy(true);const result=$('test-result');result.className='test-result';result.querySelector('b').textContent='กำลังรอคำตอบ…';
  try{const data=check(await api.testPowerConfig(meterFromDeviceForm()));result.className='test-result success';result.querySelector('b').textContent='อุปกรณ์ตอบ Modbus สำเร็จ';result.querySelector('p').textContent=`${data.path} · Slave ID ${data.slaveId} · Address ${data.address} · Raw ${data.raw.join(' / ')}\nการตอบกลับยืนยันการสื่อสาร ส่วนลำดับ Float ต้องเทียบค่ากับหน้ามิเตอร์`;}
  catch(error){result.className='test-result error';result.querySelector('b').textContent='ทดสอบไม่สำเร็จ';result.querySelector('p').textContent=error.message;}
  finally{setDialogBusy(false);result.scrollIntoView({block:'nearest'});}
}
function setupDeviceUI(){
  const power=node('fieldset');power.id='power-device-settings';power.hidden=true;
  power.innerHTML='<legend>การแปลงค่าและจุดติดตั้ง</legend><div class="form-grid"><label>Byte / Word order<select name="powerByteOrder"><option value="unconfirmed">ยังไม่ยืนยัน · เก็บ Raw</option><option>ABCD</option><option>CDAB</option><option>BADC</option><option>DCBA</option></select></label><label>ปรับ RTU Address<select name="powerOffset"><option value="0">0 · ตามผัง</option><option value="1">+1</option><option value="-1">−1</option></select></label><label>จุดติดตั้ง<select name="powerPoint"><option value="motor-input">ไฟเข้ามอเตอร์</option><option value="generator-output">ไฟออกเจเนอเรเตอร์</option><option value="other">จุดวัดอื่น</option></select></label><label>อุปกรณ์ที่เกี่ยวข้อง<select name="powerOwner"><option value="">ไม่ระบุ</option></select></label></div><details class="device-register-map"><summary>Register ในแม่แบบ</summary><p class="footnote" id="device-register-source"></p><table><thead><tr><th>ค่าที่อ่าน</th><th>RTU Address</th><th>ชนิดข้อมูล</th><th>หน่วย</th></tr></thead><tbody id="device-preset-registers"></tbody></table></details>';
  $('preset-note').after(power);form.elements.powerOffset.onchange=renderDeviceRegisterMap;
  const note=node('p','แม่แบบเก็บผัง Register และสูตรแปลงค่า · ตั้งบัสและ Slave ID แยกสำหรับอุปกรณ์แต่ละตัว','template-help');$('sensor-model').closest('.device-model-field').after(note);
  $('save-register-template').onclick=()=>openTemplateLibrary(true);
  $('sensor-model').onchange=applyRegisterTemplate;
  const manage=node('button','แม่แบบ Register');manage.type='button';manage.id='manage-register-templates';manage.onclick=()=>{document.getElementById('session-actions').open=false;openTemplateLibrary();};$('open-data').after(manage);
  const remove=node('button','นำออกจากพื้นที่งาน…');remove.type='button';remove.id='remove-editor-device';remove.className='danger-text';remove.onclick=removeEditedDevice;document.querySelector('#connection-dialog .dialog-footer').prepend(remove);
  openFlowMeterEditor=id=>openDeviceMeter(activeWorkspace()?.meters.find(item=>item.id===id));
  openFlowNewMeter=model=>openDeviceMeter(undefined,model);
  api.onDeviceStatus?.(status=>{
    const key=trafficKey(status.deviceType,status.deviceId),previous=deviceTraffic.get(key);
    if(previous?.attemptId>status.attemptId)return;
    deviceTraffic.set(key,{...previous,...status,receivedAt:status.receivedAt||previous?.receivedAt});
    refreshMotorStates();refreshFlowStatus();refreshSelectionState();
  });
}
function prepareDeviceEditor(profile,context){
  editorDeviceKind=context.kind||'sensor';editorDeviceGroup=selectedMeasurementGroup;editorTemplateId='';
  renderTemplateOptions(profile?.sensorModel||context.model||MODEL);
  form.elements.powerByteOrder.value=profile?.powerByteOrder||'unconfirmed';form.elements.powerOffset.value=String(profile?.powerOffset||0);form.elements.powerPoint.value=profile?.powerPoint||'motor-input';
  form.elements.powerOwner.replaceChildren(new Option('ไม่ระบุ',''),...workspaceProfiles().map(item=>new Option(item.name||item.motorId,item.motorId)));form.elements.powerOwner.value=profile?.powerOwner||'';
  if(!profile){applyRegisterTemplate();form.elements.slaveId.value='';}
  $('remove-editor-device').hidden=!editing||!(editorDeviceKind==='meter'||activeWorkspace()?.motorIds.includes(editing));
  renderDeviceRegisterMap();
}
function removeEditedDevice(){
  const group=measurementGroups.find(item=>item.id===editorDeviceGroup);if(!group||!editing)return;
  const id=editing,kind=editorDeviceKind;
  confirmAction(`นำ ${id} ออกจากพื้นที่งาน?`,'ข้อมูลที่บันทึกและแม่แบบยังอยู่',async()=>{
    const next=kind==='meter'?{...group,meters:group.meters.filter(item=>item.id!==id)}:{...group,motorIds:group.motorIds.filter(item=>item!==id),meters:group.meters.map(item=>item.motorId===id?{...item,motorId:''}:item)};
    measurementGroups=check(await api.saveGroups(measurementGroups.map(item=>item.id===group.id?next:item))).groups;
    $('connection-dialog').close();selectedMeterId='';selected=workspaceProfiles()[0]?.motorId||'';renderGroupOptions();renderProfiles();renderSelected();updateControls();
  });
}
function openTemplateLibrary(saveCurrent=false){
  const dialog=node('dialog',null,'template-library');dialog.setAttribute('aria-label','แม่แบบ Register');
  const header=node('div',null,'dialog-header'),close=node('button','ปิด');close.type='button';close.onclick=()=>dialog.close();header.append(node('h2',saveCurrent?'บันทึกแม่แบบ Register':'แม่แบบ Register'),close);dialog.append(header);
  const body=node('div',null,'template-library-body'),notice=node('p','ใช้แม่แบบร่วมกันได้ทุกอุปกรณ์ · ไม่เก็บชื่ออุปกรณ์ บัส Slave ID หรือรอบอ่าน','footnote'),error=node('p',null,'message error');error.hidden=true;error.setAttribute('role','alert');body.append(notice,error);
  const run=async task=>{body.querySelectorAll('button').forEach(button=>button.disabled=true);try{error.hidden=true;await task();render();}catch(reason){error.hidden=false;error.textContent=reason.message;}finally{body.querySelectorAll('button').forEach(button=>button.disabled=false);}};
  if(saveCurrent){
    const existing=registerTemplates.find(item=>item.id===form.elements.sensorModel.value);
    const label=node('label','ชื่อแม่แบบ'),input=node('input');input.maxLength=80;input.id='template-name';input.value=existing?.name||'';label.append(input);const save=node('button',existing?'อัปเดตแม่แบบนี้':'บันทึกแม่แบบ','primary');save.type='button';save.id='confirm-save-template';
    const write=async update=>{
      const name=input.value.trim();if(!name)throw new Error('ระบุชื่อแม่แบบ');
      const raw=DeviceTemplates.isPower(deviceModel())?meterFromDeviceForm():configFromForm();
      const entry={id:update?existing.id:`T${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`,name,settings:DeviceTemplates.snapshot(raw)};
      registerTemplates=check(await api.saveTemplates(update?registerTemplates.map(item=>item.id===existing.id?entry:item):[...registerTemplates,entry])).templates;
      renderTemplateOptions(entry.id);toast('บันทึกแม่แบบแล้ว · การตั้งค่าอุปกรณ์อื่นยังใช้ค่าที่บันทึกไว้');
    };
    save.onclick=()=>run(()=>write(Boolean(existing)));body.append(label,save);
    if(existing){const copy=node('button','บันทึกเป็นแม่แบบใหม่');copy.type='button';copy.onclick=()=>run(()=>write(false));body.append(copy);}
  }
  const list=node('div',null,'template-list');body.append(list);
  const render=()=>{
    list.replaceChildren();
    for(const item of templateCatalog()){
      const row=node('div',null,'template-row'),text=node('div');text.append(node('strong',item.name),node('small',`${deviceModelLabel({model:item.settings.model})}${item.builtin?' · ผังมาตรฐาน':''}`));row.append(text);
      if(!item.builtin){
        const rename=node('button','เปลี่ยนชื่อ');rename.type='button';rename.onclick=()=>{
          const input=node('input');input.value=item.name;input.maxLength=80;input.setAttribute('aria-label','ชื่อแม่แบบ');text.replaceChildren(input);rename.textContent='บันทึก';rename.onclick=()=>run(async()=>{registerTemplates=check(await api.saveTemplates(registerTemplates.map(entry=>entry.id===item.id?{...entry,name:input.value.trim()}:entry))).templates;renderTemplateOptions();});input.focus();
        };
        const remove=node('button','ลบ');remove.type='button';remove.className='danger-text';remove.onclick=()=>run(async()=>{const nextSelection=form.elements.sensorModel.value===item.id?item.settings.model:form.elements.sensorModel.value;registerTemplates=check(await api.saveTemplates(registerTemplates.filter(entry=>entry.id!==item.id))).templates;renderTemplateOptions(nextSelection);});row.append(rename,remove);
      }
      list.append(row);
    }
  };
  render();dialog.append(body);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();if(saveCurrent)$('template-name').focus();
}
function deviceSignal(kind,item){
  const state=deviceTraffic.get(trafficKey(kind,item.motorId&&kind!=='meter'?item.motorId:item.id));
  if(item.enabled===false)return {state:'offline',label:'พักอ่านอุปกรณ์นี้'};
  if(String(item.path).toUpperCase().startsWith('UNBOUND:'))return {state:'offline',label:'ยังไม่เชื่อมบัส'};
  if(mode==='offline'&&!connectingDevices)return {state:'offline',label:'หยุดอ่าน'};
  const names={offline:'รอรอบอ่าน',waiting:'ส่งคำขอ · รอคำตอบ',online:'ได้รับคำตอบ',fault:'สื่อสารผิดพลาด'};
  return {state:state?.state||'offline',label:names[state?.state]||names.offline,detail:[state?.message,state?.sentAt?`ส่ง ${timestamp(state.sentAt)}`:'',state?.receivedAt?`ตอบสำเร็จล่าสุด ${timestamp(state.receivedAt)}`:''].filter(Boolean).join('\n')};
}
function renderDeviceSidebar(){
  const list=$('motor-list'),query=$('motor-search').value.trim().toLowerCase(),group=activeWorkspace();list.replaceChildren();
  const devices=[...workspaceProfiles().map(item=>({kind:'sensor',id:item.motorId,item})),...(group?.meters||[]).map(item=>({kind:'meter',id:item.id,item}))];
  document.querySelector('.sidebar .search').hidden=!devices.length;document.querySelector('.sidebar-device-label').hidden=!devices.length;$('motor-count').textContent=measurementGroups.length;
  for(const {kind,id,item} of devices.filter(({id,item})=>`${id} ${item.name} ${item.area||''} ${deviceModelLabel(item)}`.toLowerCase().includes(query))){
    const active=kind==='meter'?selectedPowerMeter()?.id===id:!selectedPowerMeter()&&selected===id,button=node('button',null,`motor-item device-item${active?' selected':''}`);button.type='button';button.dataset.deviceKind=kind;button.dataset.deviceId=id;
    if(kind==='meter')button.dataset.meterId=id;else button.dataset.motorId=id;
    button.setAttribute('aria-pressed',String(active));const text=node('span',null,'device-item-content');text.append(node('strong',item.name||id),node('small',`${id} · ${deviceModelLabel(item)}`),node('small',`${portLabel(item.path)} · ID ${item.slaveId}`, 'mono'),node('small',null,'device-traffic-label'));
    button.append(node('i',null,'dot offline'),text,node('b','—','item-value'));button.onclick=()=>kind==='meter'?selectMeter(id):selectMotor(id);list.append(button);
  }
  if(!list.children.length&&group)list.append(node('p',devices.length?'ไม่พบอุปกรณ์ตามคำค้น':'ยังไม่มีอุปกรณ์','empty-ports'));
  const picker=$('reading-device');picker.replaceChildren(...devices.map(({kind,id,item})=>new Option(item.name||id,`${kind==='meter'?'meter':'sensor'}:${id}`)));picker.value=selectedPowerMeter()?`meter:${selectedPowerMeter().id}`:`sensor:${selected}`;
  refreshMotorStates();refreshFleet();
}
function refreshDeviceIndicators(){
  for(const button of document.querySelectorAll('.device-item')){
    const {deviceKind:kind,deviceId:id}=button.dataset,item=kind==='meter'?activeWorkspace()?.meters.find(entry=>entry.id===id):profiles.find(entry=>entry.motorId===id);if(!item)continue;
    const signal=deviceSignal(kind,item),dot=button.querySelector('.dot');dot.className=`dot ${signal.state}`;dot.title=signal.label;dot.setAttribute('aria-label',signal.label);
    const label=button.querySelector('.device-traffic-label');label.textContent=signal.label;button.title=[item.name||id,deviceModelLabel(item),signal.label,signal.detail].filter(Boolean).join('\n');
    const last=kind==='meter'?powerStates.get(id):stateFor(id).frames.at(-1),value=kind==='meter'?last?.values?.activePowerTotal??last?.values?.voltageLLAvg:last?.value;
    button.querySelector('.item-value').textContent=digits(value);button.querySelector('.item-value').title=kind==='meter'?(Number.isFinite(last?.values?.activePowerTotal)?'กำลังไฟฟ้ารวม · kW':'แรงดันเฉลี่ย L–L · V'):`ค่าล่าสุด · ${last?.unit||item.unit}`;
  }
}
function renderDeviceRegistry(){
  const body=$('motors-body');body.replaceChildren();
  const entries=[...profiles.map(item=>({kind:'sensor',item,id:item.motorId})),...measurementGroups.flatMap(group=>group.meters.map(item=>({kind:'meter',item,id:item.id,group})))];
  for(const {kind,item,id,group} of entries){
    const row=node('tr'),title=node('td');title.append(node('strong',id),node('small',item.name||'—'));
    const actions=node('td'),buttons=node('div',null,'row-actions'),edit=node('button','แก้ไข'),toggle=node('button',item.enabled===false?'เปิดอ่าน':'พักอ่าน'),remove=node('button','ลบ');
    edit.dataset.edit=id;toggle.dataset.edit=id;remove.dataset.delete=id;
    const withGroup=async task=>{if(mode!=='offline')return stopBeforeChange(()=>withGroup(task));if(group&&selectedMeasurementGroup!==group.id&&!await chooseMeasurementGroup(group.id))return;await task();};
    edit.onclick=()=>kind==='sensor'?openEditor(item):withGroup(()=>openDeviceMeter(item));
    toggle.onclick=()=>kind==='sensor'?toggleMotor(item):action(async()=>{if(busy)return;if(mode!=='offline')return stopBeforeChange(()=>toggle.click());measurementGroups=check(await api.saveGroups(measurementGroups.map(entry=>entry.id===group.id?{...entry,meters:entry.meters.map(meter=>meter.id===id?{...meter,enabled:meter.enabled===false}:meter)}:entry))).groups;renderProfiles();renderSelected();});
    remove.onclick=()=>kind==='sensor'?deleteMotor(item):withGroup(async()=>{if(mode!=='offline')return stopBeforeChange(()=>remove.click());await openDeviceMeter(item);removeEditedDevice();});
    buttons.append(edit,toggle,remove);actions.append(buttons);
    row.append(title,node('td',group?.name||item.area||'—'),node('td',deviceModelLabel(item)),node('td',`${portLabel(item.path)} · ID ${item.slaveId}`,'mono'),node('td',`${item.baudRate} · 8${item.parity[0].toUpperCase()}${item.stopBits}`,'mono'),actions);body.append(row);
  }
  if(!entries.length)emptyRow(body,6,'ยังไม่มีอุปกรณ์ สร้างพื้นที่งานแล้วเพิ่มอุปกรณ์จากหน้าแผนผัง');
}
