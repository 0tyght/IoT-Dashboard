'use strict';
const powerStates=new Map();
let selectedMeterId = '', meterWorkspaceId = '';
const powerLive=document.createElement('section');powerLive.className='power-panel power-live';powerLive.hidden=true;document.querySelector('.power-main').append(powerLive);
const powerHistory=document.createElement('details');powerHistory.className='power-history';powerHistory.id='power-history';
powerHistory.innerHTML=`<summary>ประวัติ Power Meter ที่บันทึก</summary><div class="power-history-controls"><label>วันที่<select id="power-history-day"><option value="">ยังไม่มีข้อมูล</option></select></label><label>รอบอ่าน<select id="power-history-run"><option value="">ทุกรอบ</option></select></label><button type="button" id="power-run-folder">CSV รอบนี้</button></div><p id="power-history-status" role="status">เลือกวันที่ที่บันทึก</p><div id="power-history-rows"></div>`;
document.getElementById('history-view').append(powerHistory);
let powerHistoryGeneration=0;
const refreshPowerRunFolder = bindRunFolderButton(document.getElementById('power-run-folder'), document.getElementById('power-history-run'));
async function loadPowerHistory(){
  const generation=++powerHistoryGeneration,day=document.getElementById('power-history-day').value,run=document.getElementById('power-history-run'),status=document.getElementById('power-history-status'),rows=document.getElementById('power-history-rows');rows.replaceChildren(); refreshPowerRunFolder();
  if(!day){status.textContent='ยังไม่มีข้อมูลที่บันทึก';run.replaceChildren(new Option('ทุกรอบ',''));refreshPowerRunFolder();return;}
  status.textContent='กำลังโหลดข้อมูล…';
  try{const result=check(await api.powerHistory({date:day,runId:run.value}));if(generation!==powerHistoryGeneration)return;const selected=run.value;run.replaceChildren(new Option('ทุกรอบ',''),...result.runs.map(item=>new Option(`${item.groupName||'ไม่ระบุชุด'} · ${item.runName?item.runName+' · ':''}${runDateLabel(item.firstTimestamp)} · ${item.runId.slice(0,8)}`,item.runId)));run.value=[...run.options].some(option=>option.value===selected)?selected:'';refreshPowerRunFolder();
    status.textContent=`${result.total.toLocaleString()} รายการ · แสดงล่าสุด ${result.rows.length} รายการ${result.skipped?` · ข้ามข้อมูลเสีย ${result.skipped}`:''}`;
    for(const reading of result.rows.reverse()){const row=document.createElement('p'),value=reading.values?.voltageAB,words=reading.raw?.voltageAB||[];row.textContent=`${reading.timestamp} · ${reading.groupName||'ไม่ระบุชุด'} · ${reading.meterId} · A–B ${Number.isFinite(value)?`${value} V`:reading.quality==='unconfirmed'?'รอยืนยัน Float':'ไม่มีค่าที่ใช้ได้'} · Raw ${words.map(word=>'0x'+Number(word).toString(16).toUpperCase().padStart(4,'0')).join(' ')}`;rows.append(row);}
  }catch(error){if(generation===powerHistoryGeneration){status.textContent=`โหลดประวัติไม่สำเร็จ: ${error.message}`;rows.replaceChildren();}}
}
powerHistory.addEventListener('toggle',async()=>{if(!powerHistory.open)return;try{const result=check(await api.powerDays()),day=document.getElementById('power-history-day'),previous=day.value;day.replaceChildren(new Option(result.days.length?'เลือกวันที่':'ยังไม่มีข้อมูล',''),...result.days.map(value=>new Option(value,value)));day.value=result.days.includes(previous)?previous:(result.days[0]||'');document.getElementById('power-history-run').value='';await loadPowerHistory();}catch(error){document.getElementById('power-history-status').textContent=`อ่านรายการไม่สำเร็จ: ${error.message}`;}});
document.getElementById('power-history-day').onchange=()=>{document.getElementById('power-history-run').value='';void loadPowerHistory();};
document.getElementById('power-history-run').onchange=()=>void loadPowerHistory();
function renderPowerReading(reading) {
  if (!activeWorkspace()?.meters.some(meter => meter.id === reading?.meterId)) return;
  powerStates.set(reading.meterId,reading);
  if (reading.meterId !== selectedMeterId) return;
  if (currentTab === 'monitor') renderSelectedPower();
  if (currentTab === 'registers') renderPowerRegisters(selectedPowerMeter());
  refreshSelectionState();
}
function renderSelectedPower() {
  const meter=selectedPowerMeter(), entry=powerStates.get(meter?.id);
  const preview=document.querySelector('.power-measurements');
  powerLive.replaceChildren();
  powerLive.hidden=!entry; preview.hidden=Boolean(entry);
  if (!entry) {
    preview.querySelector('.power-preview').textContent=!meter?'เลือกอุปกรณ์':meter.path.startsWith('UNBOUND:')?'ยังไม่เชื่อมบัส · เปิดแผนผังเพื่อเชื่อมอุปกรณ์':mode==='live'?'กำลังรอข้อมูลจากมิเตอร์':'กดเริ่มอ่านเพื่อรับค่าจากมิเตอร์';
    return;
  }
  powerLive.append(node('h2','ค่าจากมิเตอร์'));
  const box=document.createElement('div');box.className='power-live-meter';
  const status=node('p',null,'footnote');
  if(entry.state!=='receiving'){
    status.textContent=`อ่านไม่สำเร็จ · ${entry.message||'ตรวจการเชื่อมต่อ'}`;
    box.append(status);powerLive.append(box);return;
  }
  const point={'motor-input':'ไฟเข้ามอเตอร์','generator-output':'ไฟออกเจเนอเรเตอร์',other:'จุดวัดอื่น'}[meter.point];
  status.textContent=[point,timestamp(entry.timestamp),entry.presetError?`อ่านบาง Register ไม่สำเร็จ ${entry.presetError}`:entry.quality==='unconfirmed'?'รอยืนยัน Float32':null,entry.storageError?`บันทึกไม่สำเร็จ ${entry.storageError}`:entry.recorded?'บันทึกแล้ว':''].filter(Boolean).join(' · ');
  box.append(status);
  const list=document.createElement('div');list.className='power-live-values';
  for(const {key,label,unit,address} of PowerRegisters.preset(meter.model).fields){const row=document.createElement('div'),value=entry.values?.[key],words=entry.raw?.[key];const name=document.createElement('span');name.textContent=label;name.title=`Address RTU ${address+(entry.offsetAdjust||0)}`;const out=document.createElement('strong');out.textContent=Number.isFinite(value)?`${Number(value.toPrecision(6))} ${unit}`:'—';row.append(name,out);if(words){const raw=document.createElement('small');raw.textContent=`Raw ${words.map(word=>'0x'+word.toString(16).toUpperCase().padStart(4,'0')).join(' ')}`;row.append(raw);}list.append(row);}
  for(const point of entry.points||[]){const row=document.createElement('div'),name=document.createElement('span'),out=document.createElement('strong'),detail=document.createElement('small');name.textContent=point.name;out.textContent=point.status==='disabled'?'พักอ่าน':point.status==='ok'?`${point.value} ${point.unit}`:'อ่านไม่สำเร็จ';detail.textContent=point.status==='ok'?`Raw ${point.raw.join(' / ')} · × ${point.scale} + ${point.offset}`:(point.message||'');row.append(name,out,detail);list.append(row);}
  box.append(list);powerLive.append(box);
}
function clearPowerReadings() { powerStates.clear(); renderSelectedPower(); }
function renderPowerRegisters(meter) {
  const body=$('register-body'), entry=powerStates.get(meter.id);
  if (entry?.state!=='receiving') return emptyRow(body,7,entry?.message||'เริ่มอ่านข้อมูลเพื่อแสดงค่าดิบของมิเตอร์');
  body.replaceChildren();
  const hex=value=>`${Number(value).toString(16).toUpperCase().padStart(4,'0')}H`;
  const append=(label,address,count,raw,value,unit,registerType)=>{
    const base=registerType==='input'?30001:40001, row=node('tr');
    const addresses=Array.from({length:count},(_,i)=>address+i);
    row.append(node('td',addresses.map(hex).join(' / '),'mono'),node('td',addresses.map(item=>base+item).join(' / '),'mono'),
      node('td',label),node('td',raw?.join(' / ')||'—','mono'),node('td',raw?.map(hex).join(' / ')||'—','mono'),
      node('td',Number.isFinite(value)?String(value):'—','numeric'),node('td',unit||'—'));
    body.append(row);
  };
  for(const {key,label,address,unit} of PowerRegisters.preset(meter.model).fields) {
    append(label,address+(entry.offsetAdjust??meter.offsetAdjust??0),2,entry.raw?.[key],entry.values?.[key],unit,meter.registerType);
  }
  for(const point of entry.points||[]) {
    const count=['float32','uint32','int32'].includes(point.dataType)?2:1;
    append(point.name,point.registerAddress,point.raw?.length||count,point.raw,point.value,point.unit,point.registerType||meter.registerType);
  }
}
let powerDiagnosticKey='', powerDiagnosticGeneration=0;
const diagnostic = document.createElement('details');
diagnostic.className = 'power-diagnostic';
diagnostic.innerHTML = `<summary>อ่าน Register จากมิเตอร์</summary><p>หยุดรอบอ่านก่อน · อ่าน 2 Register โดยไม่เปลี่ยนค่ามิเตอร์</p><label>Address ที่ส่งในคำสั่ง<input id="power-test-address" type="number" min="0" max="65534" step="1" value="3019"></label><label>Function<select id="power-test-function"><option value="holding">FC03 · Holding</option><option value="input">FC04 · Input</option></select></label><button id="power-test-button" type="button">อ่านค่าดิบ</button><p id="power-test-result" role="status" aria-live="polite">เทียบค่าที่อ่านกับหน้ามิเตอร์</p>`;
document.querySelector('.power-setup').prepend(diagnostic);
function selectedPowerMeter() {
  return activeWorkspace()?.meters.find(meter => meter.id === selectedMeterId);
}
function refreshPowerDiagnostic() {
  const group=activeWorkspace();
  if (meterWorkspaceId!==(group?.id||'')) {
    meterWorkspaceId=group?.id||'';
    selectedMeterId='';
  }
  if (!selectedPowerMeter()) selectedMeterId=!workspaceProfiles().length?group?.meters[0]?.id||'':'';
  const meter=selectedPowerMeter();
  const key=meter?`${group.id}:${meter.id}:${meter.path}:${meter.slaveId}:${meter.model}:${meter.offsetAdjust}:${meter.registerType}`:'';
  diagnostic.hidden=!meter;
  if(key===powerDiagnosticKey)return;
  powerDiagnosticKey=key; ++powerDiagnosticGeneration;
  document.getElementById('power-test-button').disabled=!meter || meter.path.startsWith('UNBOUND:');
  document.getElementById('power-test-address').value=String(3019+(meter?.offsetAdjust||0));
  document.getElementById('power-test-function').value=meter?.registerType||'holding';
  document.getElementById('power-test-result').textContent=meter?.path.startsWith('UNBOUND:')?'เชื่อมมิเตอร์เข้าบัสจากแผนผังก่อน':'เทียบค่าที่อ่านกับหน้ามิเตอร์';
}
document.getElementById('power-open-history').onclick=()=>{
  setTab('history');
  powerHistory.open=true;
  powerHistory.querySelector('summary').focus();
  powerHistory.scrollIntoView({block:'nearest'});
};

diagnostic.querySelector('#power-test-button').addEventListener('click', async event => {
  const result = document.getElementById('power-test-result'), button = event.currentTarget;
  if (mode !== 'offline' || busy) { result.textContent = 'หยุดการอ่านและรอให้โปรแกรมพร้อมก่อนทดสอบ'; return; }
  const group=activeWorkspace(),meter=selectedPowerMeter();
  if (!meter || meter.path.startsWith('UNBOUND:')) return;
  const input = document.getElementById('power-test-address');
  if (!input.reportValidity()) return;
  const generation=++powerDiagnosticGeneration;
  button.disabled = true; result.textContent = 'กำลังอ่านค่าดิบจากมิเตอร์…';
  try {
    const options={address:Number(input.value),registerType:document.getElementById('power-test-function').value};
    const data = check(await api.testPowerMeter(group.id,meter.id,options));
    if (generation!==powerDiagnosticGeneration) return;
    const raw = data.raw.map(value => `0x${value.toString(16).toUpperCase().padStart(4,'0')}`).join(' ');
    const bytes = [data.raw[0] >> 8, data.raw[0] & 255, data.raw[1] >> 8, data.raw[1] & 255];
    const orders = {ABCD:[0,1,2,3],CDAB:[2,3,0,1],BADC:[1,0,3,2],DCBA:[3,2,1,0]};
    const candidates = Object.entries(orders).map(([name, order]) => {
      const buffer = new Uint8Array(order.map(index => bytes[index]));
      const value = new DataView(buffer.buffer).getFloat32(0, false);
      return `${name}: ${Number.isFinite(value) ? Number(value.toPrecision(6)) : 'ไม่ใช่ค่าที่ใช้ได้'}`;
    });
    result.textContent = `${data.path} · Slave ${data.slaveId} · Address ${data.address} · Raw ${raw}\nตัวเลือก Float (ยังไม่ยืนยัน): ${candidates.join(' · ')}\nเทียบกับหน้ามิเตอร์ขณะมีค่าที่ไม่เป็นศูนย์; ค่าที่ดูสมเหตุสมผลอย่างเดียวไม่ยืนยันลำดับ`;
  } catch (error) { if(generation===powerDiagnosticGeneration) result.textContent = `อ่านไม่สำเร็จ: ${error.message}`; }
  finally { if(generation===powerDiagnosticGeneration) button.disabled = false; }
});
