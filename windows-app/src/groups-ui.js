'use strict';
let measurementGroups=[], selectedMeasurementGroup='', editGroupId='';
const selectedGroupId=()=>selectedMeasurementGroup;
function updateGroupsControls(locked) { for(const id of ['groups-open','groups-quick']){const trigger=document.getElementById(id);if(trigger)trigger.disabled=locked;} document.querySelectorAll('#sidebar-groups button').forEach(button=>{button.disabled=locked;}); if(locked)document.getElementById('group-context-menu')?.hidePopover(); }
function renderGroupOptions() {
  const select=document.getElementById('groups-select');if(!select)return;
  const old=selectedMeasurementGroup;
  select.replaceChildren(new Option('อุปกรณ์เดิมที่เปิดอ่าน (ไม่รวม Power Meter)',''),...measurementGroups.map(group=>new Option(`${group.name} · ${group.motorIds.length+group.meters.length} อุปกรณ์`,group.id)));
  selectedMeasurementGroup=measurementGroups.some(group=>group.id===old)?old:'';select.value=selectedMeasurementGroup;
  document.getElementById('groups-active').textContent=selectedMeasurementGroup?`พื้นที่งานที่จะใช้: ${measurementGroups.find(group=>group.id===selectedMeasurementGroup).name}`:'รอบถัดไป: อุปกรณ์เดิมที่เปิดอ่าน (ไม่รวม Power Meter)';
  const members=document.getElementById('groups-members'),group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);
  members.textContent=group?`สมาชิก: ${[...group.motorIds.map(id=>`เซ็นเซอร์ ${id}`),...group.meters.map(meter=>`มิเตอร์ ${meter.id} (${meter.path} / ID ${meter.slaveId}${meter.motorId?` → ${meter.motorId}`:''})`)].join(' · ')}`:'ใช้ทะเบียนอุปกรณ์ที่เปิดใช้งาน · เลือกพื้นที่งานที่มีมิเตอร์เพื่ออ่านค่าไฟฟ้า';
  const summary=document.querySelector('#session-actions > summary');summary.textContent=selectedMeasurementGroup?'เพิ่มเติม · มีพื้นที่งาน':'เพิ่มเติม';summary.title=selectedMeasurementGroup?`รอบถัดไปใช้พื้นที่งาน ${measurementGroups.find(group=>group.id===selectedMeasurementGroup).name}`:'อุปกรณ์เดิมที่เปิดอ่าน (ไม่รวม Power Meter)';
  if (typeof refreshPowerDiagnostic === 'function') refreshPowerDiagnostic();
  renderGroupSidebar();
  const quick=document.getElementById('groups-quick');if(quick){quick.textContent=selectedMeasurementGroup?`พื้นที่งาน: ${measurementGroups.find(group=>group.id===selectedMeasurementGroup).name}`:'เลือกพื้นที่งาน';quick.title=quick.textContent;}
}
let returnToFlowAfterMeter=false;
let openFlowMeterEditor = () => {};
let openFlowNewMeter = (model = 'pm2230') => {};
function setupGroupsUI() {
  api.onPower(reading=>{if(mode==='live'&&(!reading.runId||!recordingState.runId||reading.runId===recordingState.runId))renderPowerReading(reading);});
  const trigger=node('button','พื้นที่งาน');trigger.id='groups-open';trigger.type='button';document.querySelector('#session-actions .session-options').prepend(trigger);
  const quick=node('button','เลือกพื้นที่งาน');quick.id='groups-quick';quick.type='button';document.getElementById('session-actions').before(quick);
  const dialog=node('dialog');dialog.id='groups-dialog';dialog.setAttribute('aria-labelledby','groups-title');
  dialog.innerHTML=`<div class="dialog-header"><div><h2 id="groups-title">พื้นที่งาน</h2><p>เลือกพื้นที่งานสำหรับรอบถัดไป หรือจัดอุปกรณ์ตามงาน</p></div><button type="button" id="groups-close" aria-label="ปิดพื้นที่งาน">ปิด</button></div><div class="groups-body"><label>พื้นที่งานสำหรับรอบถัดไป<select id="groups-select"></select></label><p id="groups-active" class="footnote"></p><p id="groups-members" class="footnote"></p><div class="groups-actions"><button type="button" id="groups-new">สร้างพื้นที่งาน</button><button type="button" id="groups-edit">แก้ไขพื้นที่งานที่เลือก</button><button type="button" id="groups-delete">ลบพื้นที่งานที่เลือก</button></div><div id="groups-editor" hidden><label>ชื่อพื้นที่งาน<input id="groups-name" maxlength="80" placeholder="เช่น ชุดทดสอบมอเตอร์ 1"></label><h3>อุปกรณ์ Modbus</h3><p class="footnote">เลือกอุปกรณ์ที่จะอ่านในพื้นที่งานนี้ (ไม่บังคับ) · พอร์ตเดียวกันต้องใช้ค่าการสื่อสารตรงกัน</p><div id="groups-motors" class="groups-motors"></div><h3>Power Meter</h3><p class="footnote">ตั้งค่า Slave ID และ Register ที่ตัวมิเตอร์ แล้วเชื่อมบัสในแผนผัง · เลข Address และ Float ยังต้องยืนยันกับมิเตอร์จริง</p><div id="groups-meters"></div><button type="button" id="groups-add-meter">เพิ่ม Power Meter</button><div id="groups-error" class="message error" role="alert" hidden></div><div class="groups-actions"><button type="button" id="groups-save" class="primary">บันทึกพื้นที่งาน</button><button type="button" id="groups-cancel">ยกเลิก</button></div></div></div>`;
  document.body.append(dialog);const $g=id=>document.getElementById(id);
  const groupList=node('div',null,'sidebar-groups');groupList.id='sidebar-groups';document.querySelector('.sidebar .side-heading').after(groupList);
  const sensorLabel=node('p','อุปกรณ์ในพื้นที่งาน','sidebar-device-label');document.querySelector('.sidebar .search').before(sensorLabel);renderGroupSidebar();
  trigger.onclick=()=>{returnToFlowAfterMeter=false;document.getElementById('session-actions').open=false;dialog.classList.remove('meter-focus');$g('groups-title').textContent='พื้นที่งาน';dialog.querySelector('.dialog-header p').textContent='เลือกพื้นที่งานสำหรับรอบถัดไป หรือจัดอุปกรณ์ตามงาน';$g('groups-save').textContent='บันทึกพื้นที่งาน';renderGroupOptions();$g('groups-editor').hidden=true;dialog.showModal();};
  quick.onclick=trigger.onclick;
  $g('groups-close').onclick=()=>dialog.close();
  $g('groups-select').onchange=()=>void chooseMeasurementGroup($g('groups-select').value);
  const openEditor=group=>{
    editGroupId=group?.id||'';$g('groups-name').value=group?.name||'';$g('groups-editor').hidden=false;$g('groups-error').hidden=true;
    const list=$g('groups-motors');list.replaceChildren();
    if(!profiles.length)list.append(node('p','ยังไม่มีเซ็นเซอร์ในทะเบียน','footnote'));
    profiles.forEach(profile=>{const label=node('label'),input=node('input');input.type='checkbox';input.value=profile.motorId;input.checked=group?.motorIds.includes(profile.motorId)||false;label.append(input,node('span',`${profile.name||profile.motorId} · ${profile.path} / ${profile.slaveId}`));list.append(label);});
    $g('groups-meters').replaceChildren();(group?.meters||[]).forEach(addMeterEditor);$g('groups-name').focus();
  };
  function meterSerial(box){
    const value=box.querySelector('.meter-port').value,profile=profiles.find(item=>item.motorId===value);
    const bus=value.startsWith('bus:')?flowSavedBuses().find(item=>item.path===value.slice(4)):null;const timing={pollInterval:Number(box.querySelector('.meter-interval').value),timeout:Number(box.querySelector('.meter-timeout').value)};
    if(value==='unbound')return {path:`UNBOUND:POWER:${box.querySelector('.meter-id').value.trim()}`,baudRate:9600,parity:'none',stopBits:1,...timing};
    if(value==='independent')return {path:box.querySelector('.meter-path').value.trim(),baudRate:Number(box.querySelector('.meter-baud').value),parity:box.querySelector('.meter-parity').value,stopBits:Number(box.querySelector('.meter-stop').value),pollInterval:Number(box.querySelector('.meter-interval').value),timeout:Number(box.querySelector('.meter-timeout').value)};
    if(bus)return {...bus,...timing};
    if(profile)return {...profile,...timing};
    throw new Error('เลือกบัสให้ Power Meter');
  }
  function addMeterEditor(meter={}) {
    const box=node('div',null,'groups-meter'); box.dataset.meterId=meter.id||'';
    box.innerHTML=`<label>รุ่นมิเตอร์<select class="meter-model"><option value="pm2230">Schneider Electric PM2230</option><option value="pm2200">Schneider PM2200 · ผังเดิม</option></select></label><label>รหัสมิเตอร์<input class="meter-id" maxlength="24" placeholder="PM-01"></label><label>ชื่อ<input class="meter-name" maxlength="80" placeholder="ไฟเข้ามอเตอร์"></label><label>จุดวัด<select class="meter-point"><option value="motor-input">ไฟเข้ามอเตอร์</option><option value="generator-output">ไฟออกเจเนอเรเตอร์</option><option value="other">จุดวัดอื่น</option></select></label><label>ตั้งค่าการสื่อสาร<select class="meter-port"></select></label><div class="meter-independent" hidden><label>COM Port<input class="meter-path" placeholder="COM3"></label><label>Baud rate<select class="meter-baud"><option>9600</option><option>19200</option><option>38400</option><option>57600</option><option>115200</option><option>4800</option><option>2400</option><option>1200</option></select></label><label>Parity<select class="meter-parity"><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></select></label><label>Stop bits<select class="meter-stop"><option value="1">1</option><option value="2">2</option></select></label><label>ช่วงอ่าน (ms)<input class="meter-interval" type="number" min="250" max="3600000" value="2000"></label><label>Timeout (ms)<input class="meter-timeout" type="number" min="200" max="30000" value="1500"></label></div><label>Slave ID<input class="meter-slave" type="number" min="1" max="247" value="3"></label><label>Function<select class="meter-function"><option value="holding">FC03</option><option value="input">FC04</option></select></label><label>ลำดับ Float ที่ยืนยันแล้ว<select class="meter-order"><option value="unconfirmed">ยังไม่ยืนยัน · บันทึก Raw</option><option>ABCD</option><option>CDAB</option><option>BADC</option><option>DCBA</option></select></label><details class="meter-register-note"><summary>Register ตามรุ่น</summary><p class="meter-map-source footnote"></p><div class="meter-preset-tables"></div></details><label>ปรับ Address ที่ส่ง<select class="meter-offset"><option value="0">0 · ใช้ผังตามรุ่น</option><option value="1">+1</option><option value="-1">−1</option></select></label><button type="button" class="meter-remove">ลบมิเตอร์จากชุด</button>`;
    box.querySelector('.meter-id').value=meter.id||'';box.querySelector('.meter-name').value=meter.name||'';box.querySelector('.meter-slave').value=meter.slaveId??3;
    const ownerLabel=node('label','อุปกรณ์วัดที่เกี่ยวข้อง (ไม่บังคับ)'),owner=node('select');owner.className='meter-owner';owner.add(new Option('ไม่ระบุ',''));profiles.forEach(profile=>owner.add(new Option(`${profile.motorId} · ${profile.name||''}`,profile.motorId)));owner.value=meter.motorId||'';ownerLabel.append(owner);box.querySelector('.meter-point').parentElement.after(ownerLabel);
    const port=box.querySelector('.meter-port');port.add(new Option('ยังไม่เชื่อมบัส','unbound'));flowSavedBuses().forEach(bus=>port.add(new Option(`บัส ${bus.path} · ${bus.baudRate}/${bus.parity}/${bus.stopBits}`,`bus:${bus.path}`)));port.add(new Option('กำหนด COM Port และการสื่อสารเอง (เดิม)','independent'));profiles.filter(profile=>!String(profile.path).toUpperCase().startsWith('UNBOUND:')).forEach(profile=>port.add(new Option(`${profile.path} · ${profile.baudRate}/${profile.parity}/${profile.stopBits} · ${profile.motorId}`,profile.motorId)));
    const match=profiles.find(profile=>meter.path&&!String(profile.path).toUpperCase().startsWith('UNBOUND:')&&profile.path.toUpperCase()===meter.path.toUpperCase()&&profile.baudRate===meter.baudRate&&profile.parity===meter.parity&&profile.stopBits===meter.stopBits);const savedBus=flowSavedBuses().find(bus=>bus.path.toUpperCase()===String(meter.path||'').toUpperCase());port.value=String(meter.path||'').toUpperCase().startsWith('UNBOUND:')?'unbound':savedBus?`bus:${savedBus.path}`:match?.motorId||(meter.path?'independent':'unbound'); const independent=box.querySelector('.meter-independent');const syncPort=()=>{independent.hidden=port.value!=='independent';};port.onchange=syncPort;syncPort();box.querySelector('.meter-path').value=meter.path||'';box.querySelector('.meter-baud').value=String(meter.baudRate||9600);box.querySelector('.meter-parity').value=meter.parity||'none';box.querySelector('.meter-stop').value=String(meter.stopBits||1);box.querySelector('.meter-interval').value=meter.pollInterval||2000;box.querySelector('.meter-timeout').value=meter.timeout||1500;
    const timing=node('div',null,'meter-timing');timing.append(box.querySelector('.meter-interval').closest('label'),box.querySelector('.meter-timeout').closest('label'));box.querySelector('.meter-independent').after(timing);
    const extra=node('details',null,'meter-extra-points');extra.innerHTML=`<summary>Register เพิ่มเติมของมิเตอร์</summary><p>ตั้งค่าตามคู่มือของอุปกรณ์ · อ่านอย่างเดียว · ตรวจ Address และ Byte/Word order ก่อนใช้</p><div class="points-scroll"><table class="points-table"><thead><tr><th>รหัส</th><th>ชื่อค่า</th><th>Address</th><th>Function</th><th>ชนิด</th><th>Byte/Word</th><th>ตัวคูณ</th><th>ชดเชย</th><th>หน่วย</th><th>แสดงผล</th><th>อ่าน</th><th>บันทึก</th><th>จัดการ</th></tr></thead><tbody></tbody></table></div><button type="button" class="meter-point-add">เพิ่มจุดวัด</button> <button type="button" class="meter-add-currents">เพิ่มแถวกระแส A / B / C</button><p class="meter-current-note">แถวกระแสต้องกรอก Address ตามคู่มือรุ่นและยืนยันลำดับ Float กับมิเตอร์จริงก่อนใช้งาน</p><p class="meter-point-result" role="status"></p>`;
    const pointBody=extra.querySelector('tbody'),result=extra.querySelector('.meter-point-result');
    const testPoint=async row=>{const button=row.querySelector('.point-test'),status=row.querySelector('.point-row-status');button.disabled=true;try{const point=pointFromRow(row),serial=meterSerial(box);if(!point.enabled)throw new Error('เปิดอ่านจุดวัดก่อนทดสอบ');if(!serial.path||serial.path.startsWith('UNBOUND:'))throw new Error('เชื่อมอุปกรณ์กับบัสก่อนทดสอบ');result.textContent='กำลังอ่าน…';const config={...serial,motorId:box.querySelector('.meter-id').value.trim(),slaveId:Number(box.querySelector('.meter-slave').value),sensorModel:'custom',registerAddress:0,dataType:'uint16',byteOrder:'ABCD',scale:1,unit:'',points:[point]};const read=check(await api.testConnection(config)).points?.[0];result.textContent=read?.status==='ok'?`${read.name}: Raw ${read.raw.join(' / ')} → ${read.value} ${read.unit}`:`อ่านไม่สำเร็จ: ${read?.message||'ไม่ได้รับข้อมูล'}`;}catch(error){result.textContent=`ทดสอบไม่สำเร็จ: ${error.message}`;}finally{status.textContent=result.textContent;button.disabled=false;}};
    extra.querySelector('.meter-point-add').onclick=()=>addPointRow({},pointBody,testPoint);extra.querySelector('.meter-add-currents').onclick=()=>{for(const phase of ['A','B','C']){if([...pointBody.querySelectorAll('.point-id')].some(input=>input.value.toUpperCase()===`CURRENT_${phase}`))continue;const row=addPointRow({id:`CURRENT_${phase}`,name:`กระแส ${phase}`,registerAddress:'',dataType:'float32',byteOrder:'ABCD',scale:1,offset:0,unit:'A'},pointBody,testPoint);const order=row.querySelector('.point-order');order.prepend(new Option('เลือกลำดับ',''));order.value='';}};(meter.points||[]).forEach(point=>addPointRow(point,pointBody,testPoint));box.querySelector('.meter-register-note').after(extra);
    box.querySelector('.meter-point').value=meter.point||'motor-input';box.querySelector('.meter-function').value=meter.registerType||'holding';box.querySelector('.meter-order').value=meter.byteOrder||'unconfirmed';box.querySelector('.meter-offset').value=String(meter.offsetAdjust??0);box.querySelector('.meter-remove').onclick=()=>box.remove();
    const model=box.querySelector('.meter-model'), offset=box.querySelector('.meter-offset');
    model.value=meter.model || (meter.id ? 'pm2200' : 'pm2230');
    const renderPreset = () => {
      box.querySelector('.meter-map-source').textContent=model.value==='pm2230'
        ? 'Schneider FA379514 · Address RTU = เลข Register ในคู่มือ − 1 · Float32 ใช้ 2 Register ต่อค่า'
        : 'ผัง PM2200 ที่ตั้งไว้เดิม · Float32 ใช้ 2 Register ต่อค่า';
      const fields=PowerRegisters.preset(model.value).fields;
      const sections=[
        ['กระแส',fields.filter(field=>field.key.startsWith('current'))],
        ['แรงดัน',fields.filter(field=>field.key.startsWith('voltage'))],
        ['กำลังและความถี่',fields.filter(field=>field.key.includes('Power') || field.key==='frequency')]
      ];
      const tables=sections.filter(([,rows])=>rows.length).map(([title,rows])=>{
        const table=node('table',null,'meter-preset-table');
        table.innerHTML='<caption></caption><thead><tr><th scope="col">ค่าที่อ่าน</th><th scope="col">RTU</th><th scope="col">หน่วย</th></tr></thead><tbody></tbody>';
        table.caption.textContent=title;
        table.tBodies[0].append(...rows.map(field=>{
          const row=node('tr');
          row.append(node('td',field.label),node('td',String(field.address+Number(offset.value)),'mono'),node('td',field.unit));
          return row;
        }));
        return table;
      });
      box.querySelector('.meter-preset-tables').replaceChildren(...tables);
    };
    model.onchange=()=>{
      box.querySelector('.meter-order').value='unconfirmed';
      box.querySelector('.meter-function').value='holding';
      offset.value='0';
      renderPreset();
    };
    offset.onchange=renderPreset;
    renderPreset();
    $g('groups-meters').append(box);
  }
  const focusMeter=box=>{dialog.classList.add('meter-focus');$g('groups-title').textContent='ตั้งค่า Power Meter';dialog.querySelector('.dialog-header p').textContent='ตั้งค่าอุปกรณ์และจุดวัด · การสื่อสารร่วมแก้ไขที่โหนดบัส';$g('groups-save').textContent='บันทึกมิเตอร์';for(const other of $g('groups-meters').children)other.hidden=other!==box;};
  openFlowNewMeter = (model = 'pm2230') => {
    if (busy) return;
    if (mode !== 'offline') return stopBeforeChange(() => openFlowNewMeter(model));
    const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);
    trigger.onclick(); returnToFlowAfterMeter=true;openEditor(group || null); if(!group){const existing=new Set(measurementGroups.map(item=>item.name));let candidate='พื้นที่งานใหม่',number=2;while(existing.has(candidate))candidate=`พื้นที่งานใหม่ ${number++}`;$g('groups-name').value=candidate;} addMeterEditor({model});
    const box=$g('groups-meters').lastElementChild;if(group)focusMeter(box); box.scrollIntoView({block:'center'});box.querySelector('.meter-id').focus();
  };
  openFlowMeterEditor = (meterId) => {
    if (busy) return;
    if (mode !== 'offline') return stopBeforeChange(() => openFlowMeterEditor(meterId));
    const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);
    if (!group) return toast('เลือกพื้นที่งานก่อน');
    trigger.onclick(); openEditor(group);
    const box=[...$g('groups-meters').children].find(item=>item.dataset.meterId===meterId);
    if(box){focusMeter(box);box.scrollIntoView({block:'center'});box.querySelector('.meter-id').focus();}
  };
  $g('groups-new').onclick=()=>openEditor(null);
  $g('groups-edit').onclick=()=>{const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);if(group)openEditor(group);else toast('เลือกพื้นที่งานที่ต้องการแก้ไข');};
  const deleteGroup = group => {
    if (!group || busy || mode !== 'offline') return;
    if (dialog.open) dialog.close();
    const detail = group.meters.length
      ? `การตั้งค่า Power Meter และ Register เพิ่มเติมในพื้นที่งานนี้จะถูกลบ ${group.meters.length} รายการ ข้อมูลที่บันทึกและอุปกรณ์ทั่วไปยังอยู่`
      : 'ข้อมูลที่บันทึกและอุปกรณ์ทั่วไปยังอยู่';
    confirmAction(`ลบพื้นที่งาน ${group.name}?`, detail, async () => {
      measurementGroups = check(await api.saveGroups(measurementGroups.filter(item => item.id !== group.id))).groups;
      if (selectedMeasurementGroup === group.id) {
        selectedMeasurementGroup = '';
        try { check(await api.selectGroup('')); }
        catch (error) { toast(`ลบพื้นที่งานแล้ว แต่บันทึกตัวเลือกไม่ได้: ${error.message}`); }
      }
      renderGroupOptions(); renderMotorList(); renderFlow(); renderSelected(); updateControls();
    });
  };
  $g('groups-delete').onclick = () => {
    const group = measurementGroups.find(item => item.id === selectedMeasurementGroup);
    if (group) deleteGroup(group); else toast('เลือกพื้นที่งานที่ต้องการลบ');
  };
  setupGroupContextMenu((group, action) => {
    if (innerWidth < 1180) closeSidebarDrawer();
    if (action === 'delete') return deleteGroup(group);
    trigger.onclick();
    openEditor(group);
  });
  $g('groups-add-meter').onclick=()=>addMeterEditor();$g('groups-cancel').onclick=()=>{if(dialog.classList.contains('meter-focus'))dialog.close();else $g('groups-editor').hidden=true;};
  $g('groups-save').onclick=async()=>{
    $g('groups-error').hidden=true;
    try{
      const name=$g('groups-name').value.trim();if(!name)throw new Error('ระบุชื่อพื้นที่งาน');
      const motorIds=[...$g('groups-motors').querySelectorAll('input:checked')].map(input=>input.value);
      const meters=[...$g('groups-meters').children].map(box=>{const serial=meterSerial(box);if(!serial.path)throw new Error('ระบุ COM Port ให้ Power Meter');return {model:box.querySelector('.meter-model').value,id:box.querySelector('.meter-id').value.trim(),name:box.querySelector('.meter-name').value.trim(),point:box.querySelector('.meter-point').value,motorId:box.querySelector('.meter-owner').value,path:serial.path,baudRate:serial.baudRate,parity:serial.parity,stopBits:serial.stopBits,timeout:serial.timeout,pollInterval:serial.pollInterval,slaveId:Number(box.querySelector('.meter-slave').value),registerType:box.querySelector('.meter-function').value,byteOrder:box.querySelector('.meter-order').value,offsetAdjust:Number(box.querySelector('.meter-offset').value),points:[...box.querySelectorAll('.meter-extra-points tbody tr')].map(pointFromRow)};});
      const id=editGroupId||`G${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
      const proposed=[...measurementGroups.filter(group=>group.id!==id),{id,name,motorIds,meters}];
      measurementGroups=check(await api.saveGroups(proposed)).groups;selectedMeasurementGroup=id;let selectionWarning='';try{check(await api.selectGroup(id));}catch(error){selectionWarning=`บันทึกพื้นที่งานแล้ว แต่จำตัวเลือกไม่ได้: ${error.message}`;}selected=profiles.find(profile=>motorIds.includes(profile.motorId))?.motorId||'';renderGroupOptions();renderMotorList();renderFlow();renderSelected();$g('groups-editor').hidden=true;updateControls();const showFlow=returnToFlowAfterMeter||(!editGroupId&&!motorIds.length&&!meters.length);returnToFlowAfterMeter=false;if(showFlow||dialog.classList.contains('meter-focus'))dialog.close();if(showFlow)setTab('fleet');toast(selectionWarning||'บันทึกแล้ว');
    }catch(error){$g('groups-error').textContent=error.message;$g('groups-error').hidden=false;$g('groups-error').scrollIntoView({block:'nearest',behavior:'instant'});}
  };
  renderGroupOptions();
}

async function chooseMeasurementGroup(next){
  try{check(await api.selectGroup(next));selectedMeasurementGroup=next;const group=measurementGroups.find(item=>item.id===next);if(group){const first=profiles.find(profile=>group.motorIds.includes(profile.motorId));selected=first?.motorId||'';}else if(!profiles.some(profile=>profile.motorId===selected))selected=profiles[0]?.motorId||'';}
  catch(error){toast(`เลือกพื้นที่งานไม่ได้: ${error.message}`);}
  renderGroupOptions();renderMotorList();renderFlow();renderSelected();updateControls();
}
function renderGroupSidebar(){
 const list=document.getElementById('sidebar-groups');if(!list)return;document.getElementById('group-context-menu')?.hidePopover();list.replaceChildren();const all=node('button','อุปกรณ์เดิม (ไม่รวม Power Meter)','sidebar-group');all.type='button';all.setAttribute('aria-pressed',String(!selectedMeasurementGroup));all.onclick=()=>{void chooseMeasurementGroup('').then(()=>setTab('fleet'));};list.append(all);
 for(const group of measurementGroups){const button=node('button',null,'sidebar-group');button.type='button';button.setAttribute('aria-pressed',String(group.id===selectedMeasurementGroup));button.append(node('span',group.name),node('small',String(group.motorIds.length+group.meters.length)));button.onclick=()=>{void chooseMeasurementGroup(group.id).then(()=>setTab('fleet'));};
   const row=node('div',null,'sidebar-group-row'), options=node('button','⋯','sidebar-group-options');
   options.type='button'; options.setAttribute('aria-label',`จัดการพื้นที่งาน ${group.name}`);
   options.setAttribute('aria-controls','group-context-menu'); options.setAttribute('aria-expanded','false');
   options.dataset.groupOptions=group.id;
   button.addEventListener('contextmenu', event=>openGroupContextMenu(event, group.id, options));
   options.addEventListener('contextmenu', event=>openGroupContextMenu(event, group.id, options));
   options.onclick=event=>openGroupContextMenu(event, group.id, options);
   row.append(button,options);list.append(row);}
 const add=node('button','＋ สร้างพื้นที่งาน','sidebar-group-add');add.type='button';add.onclick=()=>{document.getElementById('groups-quick').click();document.getElementById('groups-new').click();};list.append(add);const count=document.getElementById('motor-count');if(count)count.textContent=measurementGroups.length;
}

let groupMenuTrigger;
function setupGroupContextMenu(onAction) {
  const menu=node('div',null,'group-context-menu');
  menu.id='group-context-menu';
  menu.popover='auto';
  menu.setAttribute('role','group');
  const title=node('strong');
  title.id='group-context-title';
  menu.setAttribute('aria-labelledby',title.id);
  menu.append(title);
  for (const [action,label] of [['edit','ตั้งค่าพื้นที่งาน'],['delete','ลบพื้นที่งาน…']]) {
    const button=node('button',label,action==='delete'?'group-context-delete':'');
    button.type='button';
    button.onclick=()=>{
      const group=measurementGroups.find(item=>item.id===menu.dataset.groupId);
      menu.hidePopover();
      if(group && !busy && mode==='offline') onAction(group,action);
    };
    menu.append(button);
  }
  menu.addEventListener('toggle',()=>{
    if (!menu.matches(':popover-open')) groupMenuTrigger?.setAttribute('aria-expanded','false');
  });
  document.getElementById('motor-sidebar').append(menu);
  window.addEventListener('resize',()=>menu.hidePopover());
}

function openGroupContextMenu(event, groupId, trigger) {
  event.preventDefault();
  const menu=document.getElementById('group-context-menu');
  if(!menu || busy || mode!=='offline' || trigger.disabled) return;
  if(menu.matches(':popover-open')) {
    menu.hidePopover();
    if(event.type==='click' && groupMenuTrigger===trigger) return;
  }
  const group=measurementGroups.find(item=>item.id===groupId);
  if(!group) return;
  groupMenuTrigger?.setAttribute('aria-expanded','false');
  groupMenuTrigger=trigger;
  trigger.setAttribute('aria-expanded','true');
  menu.dataset.groupId=groupId;
  menu.querySelector('strong').textContent=group.name;
  const anchor=trigger.getBoundingClientRect();
  const atPointer=event.type==='contextmenu' && (event.clientX || event.clientY);
  menu.showPopover({source:trigger});
  menu.style.left=`${Math.max(8,Math.min(atPointer?event.clientX:anchor.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))}px`;
  menu.style.top=`${Math.max(8,Math.min(atPointer?event.clientY:anchor.bottom+4,innerHeight-menu.offsetHeight-8))}px`;
  menu.querySelector('button').focus({preventScroll:true});
}
