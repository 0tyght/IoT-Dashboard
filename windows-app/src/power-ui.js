'use strict';
// Preview only: no meter configuration, Modbus reads or persisted measurements.
const powerTab = document.createElement('button');
powerTab.dataset.tab = 'power';
powerTab.textContent = 'ค่าไฟฟ้า';
const mainTabs=document.querySelector('.tabs'), analysisTab=mainTabs.querySelector('[data-tab="analysis"]');mainTabs.insertBefore(powerTab,analysisTab);mainTabs.insertBefore(mainTabs.querySelector('[data-tab="history"]'),analysisTab);
const powerStates=new Map();
const powerFields=[['currentUnbalanceWorst','กระแสไม่สมดุลสูงสุด','%'],['voltageAB','แรงดัน A–B','V'],['voltageBC','แรงดัน B–C','V'],['voltageCA','แรงดัน C–A','V'],['voltageLLAvg','แรงดันเฉลี่ย L–L','V'],['voltageAN','แรงดัน A–N','V'],['voltageBN','แรงดัน B–N','V'],['voltageCN','แรงดัน C–N','V'],['voltageLNAvg','แรงดันเฉลี่ย L–N','V']];
const powerLive=document.createElement('section');powerLive.className='power-panel power-live';powerLive.hidden=true;document.querySelector('.power-main').prepend(powerLive);
const powerHistory=document.createElement('details');powerHistory.className='power-panel power-history';
powerHistory.innerHTML=`<summary>ประวัติ Power Meter ที่บันทึก</summary><div class="power-history-controls"><label>วันที่<select id="power-history-day"><option value="">ยังไม่มีข้อมูล</option></select></label><label>รอบอ่าน<select id="power-history-run"><option value="">ทุกรอบ</option></select></label></div><p id="power-history-status" role="status">เลือกวันที่ที่บันทึก</p><div id="power-history-rows"></div>`;
document.querySelector('.power-setup').append(powerHistory);
let powerHistoryGeneration=0;
async function loadPowerHistory(){
  const generation=++powerHistoryGeneration,day=document.getElementById('power-history-day').value,run=document.getElementById('power-history-run'),status=document.getElementById('power-history-status'),rows=document.getElementById('power-history-rows');rows.replaceChildren();
  if(!day){status.textContent='ยังไม่มีข้อมูลที่บันทึก';run.replaceChildren(new Option('ทุกรอบ',''));return;}
  status.textContent='กำลังโหลดข้อมูล…';
  try{const result=check(await api.powerHistory({date:day,runId:run.value}));if(generation!==powerHistoryGeneration)return;const selected=run.value;run.replaceChildren(new Option('ทุกรอบ',''),...result.runs.map(item=>new Option(`${item.groupName||'ไม่ระบุชุด'} · ${item.firstTimestamp} · ${item.runId.slice(0,8)}`,item.runId)));run.value=[...run.options].some(option=>option.value===selected)?selected:'';
    status.textContent=`${result.total.toLocaleString()} รายการ · แสดงล่าสุด ${result.rows.length} รายการ${result.skipped?` · ข้ามข้อมูลเสีย ${result.skipped}`:''}`;
    for(const reading of result.rows.reverse()){const row=document.createElement('p'),value=reading.values?.voltageAB,words=reading.raw?.voltageAB||[];row.textContent=`${reading.timestamp} · ${reading.groupName||'ไม่ระบุชุด'} · ${reading.meterId} · A–B ${Number.isFinite(value)?`${value} V`:'รอยืนยัน Float'} · Raw ${words.map(word=>'0x'+Number(word).toString(16).toUpperCase().padStart(4,'0')).join(' ')}`;rows.append(row);}
  }catch(error){if(generation===powerHistoryGeneration){status.textContent=`โหลดประวัติไม่สำเร็จ: ${error.message}`;rows.replaceChildren();}}
}
powerHistory.addEventListener('toggle',async()=>{if(!powerHistory.open)return;try{const result=check(await api.powerDays()),day=document.getElementById('power-history-day'),previous=day.value;day.replaceChildren(new Option(result.days.length?'เลือกวันที่':'ยังไม่มีข้อมูล',''),...result.days.map(value=>new Option(value,value)));day.value=result.days.includes(previous)?previous:(result.days[0]||'');document.getElementById('power-history-run').value='';await loadPowerHistory();}catch(error){document.getElementById('power-history-status').textContent=`อ่านรายการไม่สำเร็จ: ${error.message}`;}});
document.getElementById('power-history-day').onchange=()=>{document.getElementById('power-history-run').value='';void loadPowerHistory();};
document.getElementById('power-history-run').onchange=()=>void loadPowerHistory();
function renderPowerReading(reading) {
  if(!reading?.meterId)return;
  powerStates.set(reading.meterId,reading);powerLive.hidden=false;document.getElementById('power-view').classList.add('power-live-active');powerLive.replaceChildren();
  const header=document.createElement('h3');header.textContent='Power Meter ในรอบนี้';powerLive.append(header);
  for(const entry of powerStates.values()) {
    const box=document.createElement('div');box.className='power-live-meter';
    const title=document.createElement('strong');const point={'motor-input':'ไฟเข้ามอเตอร์','generator-output':'ไฟออกเจเนอเรเตอร์',other:'จุดวัดอื่น'}[entry.point]||'ไม่ระบุจุดวัด';title.textContent=`${entry.name||entry.meterId} · ${point}${entry.motorId?` · ${entry.motorId}`:''} · ${entry.path} / Slave ${entry.slaveId}`;box.append(title);
    const status=document.createElement('p');status.className='footnote';
    if(entry.state!=='receiving'){status.textContent=`อ่านไม่สำเร็จ · ${entry.message||'ตรวจการเชื่อมต่อ'}`;box.append(status);powerLive.append(box);continue;}
    const time=new Date(entry.timestamp).toLocaleString('th-TH',{hour12:false});
    status.textContent=`${time} · Address ตามตาราง ${entry.offsetAdjust >= 0?'+':''}${entry.offsetAdjust ?? 0} · ต้องยืนยันกับมิเตอร์ · ${entry.quality==='unconfirmed'?'Raw · รอยืนยัน Float':'ลำดับ Float ที่ผู้ใช้ตั้งไว้ · ต้องเทียบกับมิเตอร์'} · ${entry.actualIntervalMs==null?'รอรอบถัดไป':`รอบรับ ${entry.actualIntervalMs} ms`} · ${entry.storageError?`บันทึกไม่สำเร็จ: ${entry.storageError}`:entry.recorded?'บันทึกแล้ว':'ไม่ได้บันทึก'}`;box.append(status);
    const list=document.createElement('div');list.className='power-live-values';
    for(const [key,label,unit] of powerFields){const row=document.createElement('div'),value=entry.values?.[key],words=entry.raw?.[key];const name=document.createElement('span');name.textContent=label;const out=document.createElement('strong');out.textContent=Number.isFinite(value)?`${Number(value.toPrecision(6))} ${unit}`:'รอยืนยัน';row.append(name,out);if(words){const raw=document.createElement('small');raw.textContent=`Raw ${words.map(word=>'0x'+word.toString(16).toUpperCase().padStart(4,'0')).join(' ')}`;row.append(raw);}list.append(row);}box.append(list);powerLive.append(box);
  }
  document.querySelector('.power-preview').textContent='ข้อมูลจากรอบอ่าน · ตรวจสอบคุณภาพข้อมูล';
}
function clearPowerReadings(){powerStates.clear();powerLive.replaceChildren();powerLive.hidden=true;document.getElementById('power-view').classList.remove('power-live-active');document.querySelector('.power-preview').textContent='ยังไม่เริ่มอ่านมิเตอร์';}
let powerDiagnosticKey='';
const diagnostic = document.createElement('details');
diagnostic.className = 'power-diagnostic';
diagnostic.innerHTML = `<summary>ทดสอบอ่าน Register</summary><p>หยุดการอ่านก่อนทดสอบ · อ่าน 2 Register โดยไม่เปลี่ยนค่ามิเตอร์</p><label>Power Meter<select id="power-test-device"></select></label><label>Address ที่ส่งในคำสั่ง<input id="power-test-address" type="number" min="0" max="65534" step="1" value="3019"></label><label>Function<select id="power-test-function"><option value="holding">FC03 · Holding</option><option value="input">FC04 · Input</option></select></label><button id="power-test-button" type="button">ทดสอบอ่านค่าดิบ</button><p id="power-test-result" role="status" aria-live="polite">3019 เป็นเลขจากตาราง ยังต้องเทียบค่ากับหน้ามิเตอร์</p>`;
document.querySelector('.power-setup').append(diagnostic);
function refreshPowerDiagnostic(){
  const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup),meters=group?.meters||[],select=document.getElementById('power-test-device'),previous=select.value;
  select.replaceChildren();if(meters.length){meters.forEach(meter=>select.add(new Option(`${meter.name||meter.id} · ${meter.path.startsWith('UNBOUND:')?'ยังไม่เชื่อมบัส':meter.path} / ID ${meter.slaveId}`,meter.id)));select.value=meters.some(m=>m.id===previous)?previous:meters[0].id;}
  else select.add(new Option('ใช้พอร์ตเซ็นเซอร์ที่เลือก · Slave 3 (ทดสอบเดิม)','legacy'));
  const info=document.querySelector('.power-point-confirmed'),first=meters[0];
  info.querySelector('strong').textContent=first?({'motor-input':'ไฟเข้ามอเตอร์','generator-output':'ไฟออกเจเนอเรเตอร์',other:'จุดวัดอื่น'}[first.point]||'จุดวัดอื่น'):'ยังไม่ได้เลือก Power Meter';
  info.querySelector('span').textContent=first?`${first.name||first.id} · ${meters.length} มิเตอร์ในชุด`: 'เลือกชุดที่มีมิเตอร์เพื่อดูอุปกรณ์';
  document.getElementById('power-selected-point').textContent=first?(first.name||first.id):'ยังไม่มีมิเตอร์ที่เลือก';
  const syncSelection=()=>{const meter=meters.find(item=>item.id===select.value),key=meter?`${group.id}:${meter.id}:${meter.offsetAdjust}:${meter.registerType}`:'legacy';if(key!==powerDiagnosticKey){powerDiagnosticKey=key;document.getElementById('power-test-address').value=String(3019+(meter?.offsetAdjust||0));document.getElementById('power-test-function').value=meter?.registerType||'holding';}};
  select.onchange=syncSelection;syncSelection();
}

diagnostic.querySelector('#power-test-button').addEventListener('click', async event => {
  const result = document.getElementById('power-test-result'), button = event.currentTarget;
  if (mode !== 'offline' || busy) { result.textContent = 'หยุดการอ่านและรอให้โปรแกรมพร้อมก่อนทดสอบ'; return; }
  const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup),meter=group?.meters.find(item=>item.id===document.getElementById('power-test-device').value),profile=currentProfile();
  if (!meter&&!profile) { result.textContent = 'เพิ่ม Power Meter ในชุด หรือเลือกเซ็นเซอร์ที่ตั้งค่าพอร์ตแล้วก่อนทดสอบ'; return; }
  const input = document.getElementById('power-test-address');
  if (!input.reportValidity()) return;
  button.disabled = true; result.textContent = 'กำลังอ่านค่าดิบจากมิเตอร์…';
  try {
    const options={address:Number(input.value),registerType:document.getElementById('power-test-function').value};
    const data = meter ? check(await api.testPowerMeter(group.id,meter.id,options)) : check(await api.testPowerRegister(profile,{...options,slaveId:3}));
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
