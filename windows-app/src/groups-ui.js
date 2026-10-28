'use strict';
let measurementGroups=[], selectedMeasurementGroup='', editGroupId='';
const selectedGroupId=()=>selectedMeasurementGroup;
function updateGroupsControls(locked) { for(const id of ['groups-open','groups-quick']){const trigger=document.getElementById(id);if(trigger)trigger.disabled=locked;} }
function renderGroupOptions() {
  const select=document.getElementById('groups-select');if(!select)return;
  const old=selectedMeasurementGroup;
  select.replaceChildren(new Option('เซ็นเซอร์ทั้งหมดที่เปิดใช้งาน',''),...measurementGroups.map(group=>new Option(`${group.name} · ${group.motorIds.length+group.meters.length} อุปกรณ์`,group.id)));
  selectedMeasurementGroup=measurementGroups.some(group=>group.id===old)?old:'';select.value=selectedMeasurementGroup;
  document.getElementById('groups-active').textContent=selectedMeasurementGroup?`ชุดที่จะใช้: ${measurementGroups.find(group=>group.id===selectedMeasurementGroup).name}`:'รอบถัดไป: เซ็นเซอร์ทั้งหมดที่เปิดใช้งาน';
  const members=document.getElementById('groups-members'),group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);
  members.textContent=group?`สมาชิก: ${[...group.motorIds.map(id=>`เซ็นเซอร์ ${id}`),...group.meters.map(meter=>`มิเตอร์ ${meter.id} (${meter.path} / ID ${meter.slaveId}${meter.motorId?` → ${meter.motorId}`:''})`)].join(' · ')}`:'ใช้ทะเบียนเซ็นเซอร์ที่เปิดใช้งาน';
  const summary=document.querySelector('#session-actions > summary');summary.textContent=selectedMeasurementGroup?'เพิ่มเติม · มีชุด':'เพิ่มเติม';summary.title=selectedMeasurementGroup?`รอบถัดไปใช้ชุด ${measurementGroups.find(group=>group.id===selectedMeasurementGroup).name}`:'เซ็นเซอร์ทั้งหมดที่เปิดใช้งาน';
  const quick=document.getElementById('groups-quick');if(quick){quick.textContent=selectedMeasurementGroup?`ชุด: ${measurementGroups.find(group=>group.id===selectedMeasurementGroup).name}`:'เลือกชุดการวัด';quick.title=quick.textContent;}
}
let openFlowMeterEditor = () => {};
let openFlowNewMeter = () => {};
function setupGroupsUI() {
  api.onPower(reading=>{if(mode==='live'&&(!reading.runId||!recordingState.runId||reading.runId===recordingState.runId))renderPowerReading(reading);});
  const trigger=node('button','ชุดการวัด');trigger.id='groups-open';trigger.type='button';document.querySelector('#session-actions .session-options').prepend(trigger);
  const quick=node('button','เลือกชุดการวัด');quick.id='groups-quick';quick.type='button';document.getElementById('session-actions').before(quick);
  const dialog=node('dialog');dialog.id='groups-dialog';dialog.setAttribute('aria-labelledby','groups-title');
  dialog.innerHTML=`<div class="dialog-header"><div><h2 id="groups-title">ชุดการวัด</h2><p>เลือกชุดสำหรับรอบถัดไป หรือจัดอุปกรณ์ตามงาน</p></div><button type="button" id="groups-close" aria-label="ปิดชุดการวัด">ปิด</button></div><div class="groups-body"><label>ชุดสำหรับรอบถัดไป<select id="groups-select"></select></label><p id="groups-active" class="footnote"></p><p id="groups-members" class="footnote"></p><div class="groups-actions"><button type="button" id="groups-new">เพิ่มชุด</button><button type="button" id="groups-edit">แก้ไขชุดที่เลือก</button><button type="button" id="groups-delete">ลบชุดที่เลือก</button></div><div id="groups-editor" hidden><label>ชื่อชุด<input id="groups-name" maxlength="80" placeholder="เช่น ชุดทดสอบมอเตอร์ 1"></label><h3>เซ็นเซอร์สั่น</h3><p class="footnote">เลือกจากทะเบียนเซ็นเซอร์ · พอร์ตเดียวกันต้องใช้ค่าการสื่อสารตรงกัน</p><div id="groups-motors" class="groups-motors"></div><h3>Power Meter</h3><p class="footnote">เลือกพอร์ตและตั้งค่าการสื่อสารของมิเตอร์ · เลข Address และ Float ยังต้องยืนยันกับมิเตอร์จริง</p><div id="groups-meters"></div><button type="button" id="groups-add-meter">เพิ่ม Power Meter</button><div id="groups-error" class="message error" role="alert" hidden></div><div class="groups-actions"><button type="button" id="groups-save" class="primary">บันทึกชุด</button><button type="button" id="groups-cancel">ยกเลิก</button></div></div></div>`;
  document.body.append(dialog);const $g=id=>document.getElementById(id);
  trigger.onclick=()=>{document.getElementById('session-actions').open=false;renderGroupOptions();$g('groups-editor').hidden=true;dialog.showModal();};
  quick.onclick=trigger.onclick;
  $g('groups-close').onclick=()=>dialog.close();
  $g('groups-select').onchange=()=>{selectedMeasurementGroup=$g('groups-select').value;renderGroupOptions();renderFlow();updateControls();};
  const openEditor=group=>{
    editGroupId=group?.id||'';$g('groups-name').value=group?.name||'';$g('groups-editor').hidden=false;$g('groups-error').hidden=true;
    const list=$g('groups-motors');list.replaceChildren();
    if(!profiles.length)list.append(node('p','ยังไม่มีเซ็นเซอร์ในทะเบียน','footnote'));
    profiles.forEach(profile=>{const label=node('label'),input=node('input');input.type='checkbox';input.value=profile.motorId;input.checked=group?.motorIds.includes(profile.motorId)||false;label.append(input,node('span',`${profile.name||profile.motorId} · ${profile.path} / ${profile.slaveId}`));list.append(label);});
    $g('groups-meters').replaceChildren();(group?.meters||[]).forEach(addMeterEditor);$g('groups-name').focus();
  };
  function addMeterEditor(meter={}) {
    const box=node('div',null,'groups-meter'); box.dataset.meterId=meter.id||'';
    box.innerHTML=`<p class="meter-type">ชนิดมิเตอร์: Schneider PM2200 · อ่านแรงดันและ Current unbalance ตามตารางที่ได้รับ</p><label>รหัสมิเตอร์<input class="meter-id" maxlength="24" placeholder="PM-01"></label><label>ชื่อ<input class="meter-name" maxlength="80" placeholder="ไฟเข้ามอเตอร์"></label><label>จุดวัด<select class="meter-point"><option value="motor-input">ไฟเข้ามอเตอร์</option><option value="generator-output">ไฟออกเจเนอเรเตอร์</option><option value="other">จุดวัดอื่น</option></select></label><label>ตั้งค่าการสื่อสาร<select class="meter-port"></select></label><div class="meter-independent" hidden><label>COM Port<input class="meter-path" placeholder="COM3"></label><label>Baud rate<select class="meter-baud"><option>9600</option><option>19200</option><option>38400</option><option>57600</option><option>115200</option><option>4800</option><option>2400</option><option>1200</option></select></label><label>Parity<select class="meter-parity"><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></select></label><label>Stop bits<select class="meter-stop"><option value="1">1</option><option value="2">2</option></select></label><label>ช่วงอ่าน (ms)<input class="meter-interval" type="number" min="250" max="3600000" value="2000"></label><label>Timeout (ms)<input class="meter-timeout" type="number" min="200" max="30000" value="1500"></label></div><label>Slave ID<input class="meter-slave" type="number" min="1" max="247" value="3"></label><label>Function<select class="meter-function"><option value="holding">FC03</option><option value="input">FC04</option></select></label><label>ลำดับ Float ที่ยืนยันแล้ว<select class="meter-order"><option value="unconfirmed">ยังไม่ยืนยัน · บันทึก Raw</option><option>ABCD</option><option>CDAB</option><option>BADC</option><option>DCBA</option></select></label><p class="meter-register-note">Register ที่อ่าน: 3017, 3019–3031 และ 3035 · Float32 สอง Register ต่อค่า · ตรวจเทียบคู่มือและเครื่องจริง</p><label>ปรับ Address จากตาราง<select class="meter-offset"><option value="0">0 · ตามตาราง</option><option value="1">+1</option><option value="-1">−1</option></select></label><button type="button" class="meter-remove">ลบมิเตอร์จากชุด</button>`;
    box.querySelector('.meter-id').value=meter.id||'';box.querySelector('.meter-name').value=meter.name||'';box.querySelector('.meter-slave').value=meter.slaveId??3;
    const ownerLabel=node('label','อุปกรณ์วัดที่เกี่ยวข้อง (ไม่บังคับ)'),owner=node('select');owner.className='meter-owner';owner.add(new Option('ไม่ระบุ',''));profiles.forEach(profile=>owner.add(new Option(`${profile.motorId} · ${profile.name||''}`,profile.motorId)));owner.value=meter.motorId||'';ownerLabel.append(owner);box.querySelector('.meter-point').parentElement.after(ownerLabel);
    const port=box.querySelector('.meter-port');port.add(new Option('ยังไม่เชื่อมบัส','unbound'));port.add(new Option('กำหนด COM Port และการสื่อสารเอง','independent'));profiles.filter(profile=>!String(profile.path).toUpperCase().startsWith('UNBOUND:')).forEach(profile=>port.add(new Option(`${profile.path} · ${profile.baudRate}/${profile.parity}/${profile.stopBits} · ${profile.motorId}`,profile.motorId)));
    const match=profiles.find(profile=>meter.path&&!String(profile.path).toUpperCase().startsWith('UNBOUND:')&&profile.path.toUpperCase()===meter.path.toUpperCase()&&profile.baudRate===meter.baudRate&&profile.parity===meter.parity&&profile.stopBits===meter.stopBits);port.value=String(meter.path||'').toUpperCase().startsWith('UNBOUND:')?'unbound':match?.motorId||(meter.path?'independent':'unbound'); const independent=box.querySelector('.meter-independent');const syncPort=()=>{independent.hidden=port.value!=='independent';};port.onchange=syncPort;syncPort();box.querySelector('.meter-path').value=meter.path||'';box.querySelector('.meter-baud').value=String(meter.baudRate||9600);box.querySelector('.meter-parity').value=meter.parity||'none';box.querySelector('.meter-stop').value=String(meter.stopBits||1);box.querySelector('.meter-interval').value=meter.pollInterval||2000;box.querySelector('.meter-timeout').value=meter.timeout||1500;
    box.querySelector('.meter-point').value=meter.point||'motor-input';box.querySelector('.meter-function').value=meter.registerType||'holding';box.querySelector('.meter-order').value=meter.byteOrder||'unconfirmed';box.querySelector('.meter-offset').value=String(meter.offsetAdjust??0);box.querySelector('.meter-remove').onclick=()=>box.remove();$g('groups-meters').append(box);
  }
  openFlowNewMeter = () => {
    if (busy) return;
    if (mode !== 'offline') return stopBeforeChange(() => openFlowNewMeter());
    const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);
    trigger.onclick(); openEditor(group || null); addMeterEditor();
    const box=$g('groups-meters').lastElementChild; box.scrollIntoView({block:'center'});box.querySelector('.meter-id').focus();
  };
  openFlowMeterEditor = (meterId) => {
    if (busy) return;
    if (mode !== 'offline') return stopBeforeChange(() => openFlowMeterEditor(meterId));
    const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);
    if (!group) return toast('เลือกชุดการวัดก่อน');
    trigger.onclick(); openEditor(group);
    const box=[...$g('groups-meters').children].find(item=>item.dataset.meterId===meterId);
    if(box){box.scrollIntoView({block:'center'});box.querySelector('.meter-id').focus();}
  };
  $g('groups-new').onclick=()=>openEditor(null);
  $g('groups-edit').onclick=()=>{const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);if(group)openEditor(group);else toast('เลือกชุดที่ต้องการแก้ไข');};
  $g('groups-delete').onclick=()=>{const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);if(!group){toast('เลือกชุดที่ต้องการลบ');return;} dialog.close();confirmAction(`ลบชุด ${group.name}?`,'ลบเฉพาะชุดการวัด ข้อมูลที่บันทึกและทะเบียนเซ็นเซอร์ยังอยู่',async()=>{measurementGroups=check(await api.saveGroups(measurementGroups.filter(item=>item.id!==group.id))).groups;selectedMeasurementGroup='';renderGroupOptions();renderFlow();updateControls();});};
  $g('groups-add-meter').onclick=()=>addMeterEditor();$g('groups-cancel').onclick=()=>{$g('groups-editor').hidden=true;};
  $g('groups-save').onclick=async()=>{
    $g('groups-error').hidden=true;
    try{
      const name=$g('groups-name').value.trim();if(!name)throw new Error('ระบุชื่อชุด');
      const motorIds=[...$g('groups-motors').querySelectorAll('input:checked')].map(input=>input.value);
      const meters=[...$g('groups-meters').children].map(box=>{const profile=profiles.find(item=>item.motorId===box.querySelector('.meter-port').value), manual=box.querySelector('.meter-port').value==='independent',unbound=box.querySelector('.meter-port').value==='unbound';if(!profile&&!manual&&!unbound)throw new Error('เลือกพอร์ตให้ Power Meter ทุกตัว');const serial=unbound?{path:`UNBOUND:POWER:${box.querySelector('.meter-id').value.trim()}`,baudRate:9600,parity:'none',stopBits:1,pollInterval:2000,timeout:1500}:manual?{path:box.querySelector('.meter-path').value.trim(),baudRate:Number(box.querySelector('.meter-baud').value),parity:box.querySelector('.meter-parity').value,stopBits:Number(box.querySelector('.meter-stop').value),pollInterval:Number(box.querySelector('.meter-interval').value),timeout:Number(box.querySelector('.meter-timeout').value)}:profile;if(!serial.path)throw new Error('ระบุ COM Port ให้ Power Meter');return {id:box.querySelector('.meter-id').value.trim(),name:box.querySelector('.meter-name').value.trim(),point:box.querySelector('.meter-point').value,motorId:box.querySelector('.meter-owner').value,path:serial.path,baudRate:serial.baudRate,parity:serial.parity,stopBits:serial.stopBits,timeout:serial.timeout,pollInterval:serial.pollInterval,slaveId:Number(box.querySelector('.meter-slave').value),registerType:box.querySelector('.meter-function').value,byteOrder:box.querySelector('.meter-order').value,offsetAdjust:Number(box.querySelector('.meter-offset').value)};});
      const id=editGroupId||`G${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
      const proposed=[...measurementGroups.filter(group=>group.id!==id),{id,name,motorIds,meters}];
      measurementGroups=check(await api.saveGroups(proposed)).groups;selectedMeasurementGroup=id;renderGroupOptions();renderFlow();$g('groups-editor').hidden=true;updateControls();toast('บันทึกชุดแล้ว');
    }catch(error){$g('groups-error').textContent=error.message;$g('groups-error').hidden=false;}
  };
  renderGroupOptions();
}
