'use strict';
const powerTab = document.createElement('button');
powerTab.dataset.tab = 'power';
powerTab.textContent = 'ค่าไฟฟ้า';
const mainTabs=document.querySelector('.tabs'), analysisTab=mainTabs.querySelector('[data-tab="analysis"]');mainTabs.insertBefore(powerTab,analysisTab);mainTabs.insertBefore(mainTabs.querySelector('[data-tab="history"]'),analysisTab);
const powerStates=new Map();
const powerLive=document.createElement('section');powerLive.className='power-panel power-live';powerLive.hidden=true;document.querySelector('.power-main').append(powerLive);
const powerHistory=document.createElement('details');powerHistory.className='power-history';
powerHistory.innerHTML=`<summary>ประวัติ Power Meter ที่บันทึก</summary><div class="power-history-controls"><label>วันที่<select id="power-history-day"><option value="">ยังไม่มีข้อมูล</option></select></label><label>รอบอ่าน<select id="power-history-run"><option value="">ทุกรอบ</option></select></label></div><p id="power-history-status" role="status">เลือกวันที่ที่บันทึก</p><div id="power-history-rows"></div>`;
document.querySelector('.power-setup').append(powerHistory);
let powerHistoryGeneration=0;
async function loadPowerHistory(){
  const generation=++powerHistoryGeneration,day=document.getElementById('power-history-day').value,run=document.getElementById('power-history-run'),status=document.getElementById('power-history-status'),rows=document.getElementById('power-history-rows');rows.replaceChildren();
  if(!day){status.textContent='ยังไม่มีข้อมูลที่บันทึก';run.replaceChildren(new Option('ทุกรอบ',''));return;}
  status.textContent='กำลังโหลดข้อมูล…';
  try{const result=check(await api.powerHistory({date:day,runId:run.value}));if(generation!==powerHistoryGeneration)return;const selected=run.value;run.replaceChildren(new Option('ทุกรอบ',''),...result.runs.map(item=>new Option(`${item.groupName||'ไม่ระบุชุด'} · ${item.runName?item.runName+' · ':''}${item.firstTimestamp} · ${item.runId.slice(0,8)}`,item.runId)));run.value=[...run.options].some(option=>option.value===selected)?selected:'';
    status.textContent=`${result.total.toLocaleString()} รายการ · แสดงล่าสุด ${result.rows.length} รายการ${result.skipped?` · ข้ามข้อมูลเสีย ${result.skipped}`:''}`;
    for(const reading of result.rows.reverse()){const row=document.createElement('p'),value=reading.values?.voltageAB,words=reading.raw?.voltageAB||[];row.textContent=`${reading.timestamp} · ${reading.groupName||'ไม่ระบุชุด'} · ${reading.meterId} · A–B ${Number.isFinite(value)?`${value} V`:'รอยืนยัน Float'} · Raw ${words.map(word=>'0x'+Number(word).toString(16).toUpperCase().padStart(4,'0')).join(' ')}`;rows.append(row);}
  }catch(error){if(generation===powerHistoryGeneration){status.textContent=`โหลดประวัติไม่สำเร็จ: ${error.message}`;rows.replaceChildren();}}
}
powerHistory.addEventListener('toggle',async()=>{if(!powerHistory.open)return;try{const result=check(await api.powerDays()),day=document.getElementById('power-history-day'),previous=day.value;day.replaceChildren(new Option(result.days.length?'เลือกวันที่':'ยังไม่มีข้อมูล',''),...result.days.map(value=>new Option(value,value)));day.value=result.days.includes(previous)?previous:(result.days[0]||'');document.getElementById('power-history-run').value='';await loadPowerHistory();}catch(error){document.getElementById('power-history-status').textContent=`อ่านรายการไม่สำเร็จ: ${error.message}`;}});
document.getElementById('power-history-day').onchange=()=>{document.getElementById('power-history-run').value='';void loadPowerHistory();};
document.getElementById('power-history-run').onchange=()=>void loadPowerHistory();
function renderPowerReading(reading) {
  if(!reading?.meterId)return;
  powerStates.set(reading.meterId,reading);powerLive.hidden=false;powerLive.replaceChildren();
  const header=document.createElement('h3');header.textContent='Power Meter ในรอบนี้';powerLive.append(header);
  for(const entry of powerStates.values()) {
    const box=document.createElement('div');box.className='power-live-meter';
    const title=document.createElement('strong');const point={'motor-input':'ไฟเข้ามอเตอร์','generator-output':'ไฟออกเจเนอเรเตอร์',other:'จุดวัดอื่น'}[entry.point]||'ไม่ระบุจุดวัด';title.textContent=`${entry.name||entry.meterId} · ${PowerRegisters.label(entry.model)} · ${point}${entry.motorId?` · ${entry.motorId}`:''} · ${entry.path} / Slave ${entry.slaveId}`;box.append(title);
    const status=document.createElement('p');status.className='footnote';
    if(entry.state!=='receiving'){status.textContent=`อ่านไม่สำเร็จ · ${entry.message||'ตรวจการเชื่อมต่อ'}`;box.append(status);powerLive.append(box);continue;}
    const time=new Date(entry.timestamp).toLocaleString('th-TH',{hour12:false});
    status.textContent=`${time} · ${entry.presetError?`อ่าน Register แบบตั้งต้นไม่สำเร็จ: ${entry.presetError} · `:''}ปรับ Address ${entry.offsetAdjust >= 0?'+':''}${entry.offsetAdjust ?? 0} · ต้องยืนยันกับมิเตอร์ · ${entry.quality==='unconfirmed'?'Raw · รอยืนยัน Float':'ลำดับ Float ที่ผู้ใช้ตั้งไว้ · ต้องเทียบกับมิเตอร์'} · ${entry.actualIntervalMs==null?'รอรอบถัดไป':`รอบรับ ${entry.actualIntervalMs} ms`} · ${entry.storageError?`บันทึกไม่สำเร็จ: ${entry.storageError}`:entry.recorded?'บันทึกแล้ว':'ไม่ได้บันทึก'}`;box.append(status);
    const list=document.createElement('div');list.className='power-live-values';
    for(const {key,label,unit,address} of PowerRegisters.preset(entry.model).fields){const row=document.createElement('div'),value=entry.values?.[key],words=entry.raw?.[key];const name=document.createElement('span');name.textContent=label;name.title=`Address RTU ${address+(entry.offsetAdjust||0)}`;const out=document.createElement('strong');out.textContent=Number.isFinite(value)?`${Number(value.toPrecision(6))} ${unit}`:entry.presetError?'อ่านไม่สำเร็จ':entry.quality==='unconfirmed'?'รอยืนยัน Float':'ไม่มีค่าที่ใช้ได้';row.append(name,out);if(words){const raw=document.createElement('small');raw.textContent=`Raw ${words.map(word=>'0x'+word.toString(16).toUpperCase().padStart(4,'0')).join(' ')}`;row.append(raw);}list.append(row);}
    for(const point of entry.points||[]){const row=document.createElement('div'),name=document.createElement('span'),out=document.createElement('strong'),detail=document.createElement('small');name.textContent=point.name;out.textContent=point.status==='disabled'?'พักอ่าน':point.status==='ok'?`${point.value} ${point.unit}`:'อ่านไม่สำเร็จ';detail.textContent=point.status==='ok'?`Raw ${point.raw.join(' / ')} · × ${point.scale} + ${point.offset}`:(point.message||'');row.append(name,out,detail);list.append(row);}
    box.append(list);powerLive.append(box);
  }
  document.querySelector('.power-measurements').hidden=true;
}
function clearPowerReadings(){powerStates.clear();powerLive.replaceChildren();powerLive.hidden=true;document.querySelector('.power-measurements').hidden=false;}
let powerDiagnosticKey='';
const diagnostic = document.createElement('details');
diagnostic.className = 'power-diagnostic';
diagnostic.innerHTML = `<summary>อ่าน Register จากมิเตอร์</summary><p>หยุดรอบอ่านก่อน · อ่าน 2 Register โดยไม่เปลี่ยนค่ามิเตอร์</p><label>Power Meter<select id="power-test-device"></select></label><label>Address ที่ส่งในคำสั่ง<input id="power-test-address" type="number" min="0" max="65534" step="1" value="3019"></label><label>Function<select id="power-test-function"><option value="holding">FC03 · Holding</option><option value="input">FC04 · Input</option></select></label><button id="power-test-button" type="button">อ่านค่าดิบ</button><p id="power-test-result" role="status" aria-live="polite">เทียบค่าที่อ่านกับหน้ามิเตอร์</p>`;
document.querySelector('.power-setup').prepend(diagnostic);
function selectedPowerMeter() {
  const id = document.getElementById('power-test-device').value;
  return activeWorkspace()?.meters.find(meter => meter.id === id);
}
function refreshPowerDiagnostic() {
  const group=activeWorkspace(),meters=group?.meters||[];
  const select=document.getElementById('power-test-device'),previous=select.value;
  const preview=document.querySelector('.power-preview'),roster=document.getElementById('power-meter-roster');
  const setup=document.getElementById('power-setup-action');
  diagnostic.hidden=!meters.length;
  preview.textContent=!group?'ยังไม่ได้เลือกพื้นที่งาน':!meters.length?'พื้นที่งานนี้ยังไม่มี Power Meter':'ค่าจากมิเตอร์จะปรากฏเมื่อเริ่มอ่าน';
  roster.replaceChildren(...meters.map(meter=>{
    const row=node('div',null,'power-meter-entry');
    row.append(node('strong',meter.name||meter.id),node('span',`${PowerRegisters.label(meter.model)} · ${meter.path.startsWith('UNBOUND:')?'ยังไม่เชื่อมบัส':meter.path} · ID ${meter.slaveId}`));
    const edit=node('button','ตั้งค่า');edit.type='button';edit.onclick=()=>openFlowMeterEditor(meter.id);
    row.append(edit);return row;
  }));
  setup.hidden=Boolean(meters.length);
  setup.textContent=group?'เพิ่ม Power Meter':'เลือกพื้นที่งาน';
  setup.onclick=group?()=>openFlowNewMeter():showWorkspacePicker;
  select.replaceChildren(...meters.map(meter=>new Option(`${meter.name||meter.id} · ${PowerRegisters.label(meter.model)}`,meter.id)));
  if (meters.some(meter=>meter.id===previous)) select.value=previous;
  const syncSelection=()=>{
    const meter=selectedPowerMeter(), key=meter?`${group.id}:${meter.id}:${meter.model}:${meter.offsetAdjust}:${meter.registerType}`:'';
    updateDeviceSettingsControl();
    document.getElementById('power-test-button').disabled=!meter || meter.path.startsWith('UNBOUND:');
    if(key===powerDiagnosticKey)return;
    powerDiagnosticKey=key;
    document.getElementById('power-test-address').value=String(3019+(meter?.offsetAdjust||0));
    document.getElementById('power-test-function').value=meter?.registerType||'holding';
    document.getElementById('power-test-result').textContent=meter?.path.startsWith('UNBOUND:')?'เชื่อมมิเตอร์เข้าบัสจากแผนผังก่อน':'เทียบค่าที่อ่านกับหน้ามิเตอร์';
  };
  select.onchange=syncSelection;syncSelection();
}

diagnostic.querySelector('#power-test-button').addEventListener('click', async event => {
  const result = document.getElementById('power-test-result'), button = event.currentTarget;
  if (mode !== 'offline' || busy) { result.textContent = 'หยุดการอ่านและรอให้โปรแกรมพร้อมก่อนทดสอบ'; return; }
  const group=activeWorkspace(),meter=selectedPowerMeter();
  if (!meter || meter.path.startsWith('UNBOUND:')) return;
  const input = document.getElementById('power-test-address');
  if (!input.reportValidity()) return;
  button.disabled = true; result.textContent = 'กำลังอ่านค่าดิบจากมิเตอร์…';
  try {
    const options={address:Number(input.value),registerType:document.getElementById('power-test-function').value};
    const data = check(await api.testPowerMeter(group.id,meter.id,options));
    const raw = data.raw.map(value => `0x${value.toString(16).toUpperCase().padStart(4,'0')}`).join(' ');
    const bytes = [data.raw[0] >> 8, data.raw[0] & 255, data.raw[1] >> 8, data.raw[1] & 255];
    const orders = {ABCD:[0,1,2,3],CDAB:[2,3,0,1],BADC:[1,0,3,2],DCBA:[3,2,1,0]};
    const candidates = Object.entries(orders).map(([name, order]) => {
      const buffer = new Uint8Array(order.map(index => bytes[index]));
      const value = new DataView(buffer.buffer).getFloat32(0, false);
      return `${name}: ${Number.isFinite(value) ? Number(value.toPrecision(6)) : 'ไม่ใช่ค่าที่ใช้ได้'}`;
    });
    result.textContent = `${data.path} · Slave ${data.slaveId} · Address ${data.address} · Raw ${raw}\nตัวเลือก Float (ยังไม่ยืนยัน): ${candidates.join(' · ')}\nเทียบกับหน้ามิเตอร์ขณะมีค่าที่ไม่เป็นศูนย์; ค่าที่ดูสมเหตุสมผลอย่างเดียวไม่ยืนยันลำดับ`;
  } catch (error) { result.textContent = `อ่านไม่สำเร็จ: ${error.message}`; }
  finally { button.disabled = false; }
});
