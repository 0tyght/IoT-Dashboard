'use strict';
let recordLibrarySelection=null, recordLibraryDevice='', recordLibraryRuns=[], recordLibraryRows=[], recordLibraryMetrics=[], recordLibraryView='table', recordLibraryGeneration=0,recordCatalogGeneration=0;
const formatRecordedValue=value=>Number.isFinite(value)?new Intl.NumberFormat('en-US',{useGrouping:false,maximumSignificantDigits:8}).format(value):'—';
const recordSvgNode=(tag,attrs={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));return el;};
function setupRecordLibrary(){
  const host=$('history-view'),legacy=node('div');legacy.id='legacy-history';legacy.hidden=true;legacy.append(...host.childNodes);host.append(legacy);
  const library=node('section',null,'record-library');library.id='record-library';
  library.innerHTML='<div class="page-intro"><div><h2>รอบบันทึก</h2><p>ข้อมูลจากอุปกรณ์ทุกชนิดที่บันทึกไว้ในเครื่อง</p></div><button id="runs-refresh" type="button">รีเฟรชรายการ</button></div><div class="run-search"><label>ค้นหารอบหรือพื้นที่งาน<input id="runs-search" type="search" placeholder="ชื่อรอบ รหัส หรือพื้นที่งาน"></label><label>ตั้งแต่<input id="runs-from" type="date"></label><label>ถึง<input id="runs-to" type="date"></label><button id="runs-apply" type="button">ค้นหา</button><button id="runs-import-waveform" type="button">นำเข้าไฟล์คลื่นดิบ / FFT</button></div><p id="runs-status" role="status"></p><div id="run-catalog"></div><section id="record-detail" hidden><div class="run-detail-heading"><div><h3 id="run-detail-name"></h3><p id="run-detail-info"></p></div><button id="run-back-list" type="button">กลับรายการรอบ</button></div><div class="run-device-controls"><label>อุปกรณ์ในรอบนี้<select id="run-device"></select></label><div class="record-view-switch" role="group" aria-label="มุมมองข้อมูล"><button id="run-view-table" type="button">ตาราง</button><button id="run-view-charts" type="button">กราฟเวลา</button></div><button id="run-analyze" type="button">วิเคราะห์ XYZ / FFT ค่ารวม</button><button id="run-csv" type="button">CSV ของรอบนี้</button><details id="run-columns"><summary>คอลัมน์ที่แสดง</summary><div id="run-column-options"></div></details></div><p id="run-data-status" role="status"></p><div id="run-data-table" class="run-data-table"></div><div id="run-data-charts" hidden></div><p id="run-chart-readout" role="status" hidden></p></section>';
  host.prepend(library);
  $('runs-refresh').onclick=$('runs-apply').onclick=()=>void loadRecordLibrary();$('runs-search').oninput=renderRunCatalog;
  $('runs-import-waveform').onclick=()=>{setAnalysisSource('waveform');setTab('analysis');};
  $('run-back-list').onclick=()=>{recordLibrarySelection=null;recordLibraryGeneration++;$('record-detail').hidden=true;$('run-catalog').hidden=false;document.querySelector('.run-search').hidden=false;syncProductNavigation();$('runs-search').focus();};
  $('run-device').onchange=()=>{recordLibraryDevice=$('run-device').value;void loadRecordedDevice();};
  for(const view of ['table','charts'])$(`run-view-${view}`).onclick=()=>{recordLibraryView=view;renderRecordedRows();};
  $('run-csv').onclick=()=>action(async()=>{if(!recordLibrarySelection||recordLibrarySelection.id==='__legacy__')return;const button=$('run-csv');button.disabled=true;button.textContent='กำลังเตรียม CSV…';try{check(await api.openRunDataPath(recordLibrarySelection.id));}finally{button.textContent='CSV ของรอบนี้';updateRunActions();}});
  $('run-analyze').onclick=()=>void openRecordedAnalysis();
  document.addEventListener('pointerdown',event=>{if(!$('run-columns').contains(event.target))$('run-columns').open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('run-columns').open){$('run-columns').open=false;$('run-columns').querySelector('summary').focus();}});
}
async function loadRecordLibrary(){
  const token=++recordCatalogGeneration,button=$('runs-refresh');button.disabled=true;$('runs-status').textContent='กำลังอ่านรายการรอบจากข้อมูลในเครื่อง…';
  try{
    const result=check(await api.recordedRuns({from:$('runs-from').value,to:$('runs-to').value}));if(token!==recordCatalogGeneration)return;
    recordLibraryRuns=result.runs;$('runs-status').textContent=`${result.runs.length} รอบ${result.skipped?` · ข้าม ${result.skipped} รายการที่อ่านไม่ได้`:''}`;renderRunCatalog();
    if(recordLibrarySelection){const updated=result.runs.find(run=>run.id===recordLibrarySelection.id);if(updated)await selectRecordedRun(updated);else $('run-back-list').click();}
  }catch(error){if(token!==recordCatalogGeneration)return;recordLibraryRuns=[];recordLibrarySelection=null;recordLibraryRows=[];renderRunCatalog();$('record-detail').hidden=true;$('run-catalog').hidden=false;document.querySelector('.run-search').hidden=false;syncProductNavigation();$('runs-status').textContent=`อ่านรายการรอบไม่สำเร็จ: ${error.message}`;}
  finally{if(token===recordCatalogGeneration)button.disabled=false;}
}
function renderRunCatalog(){
  const host=$('run-catalog'),query=$('runs-search').value.trim().toLocaleLowerCase();host.replaceChildren();
  const runs=recordLibraryRuns.filter(run=>`${run.name} ${run.id} ${run.groupName} ${run.devices.map(device=>device.id).join(' ')}`.toLocaleLowerCase().includes(query));
  if(!runs.length){const empty=node('div',null,'record-empty');empty.append(node('h3',recordLibraryRuns.length?'ไม่พบรอบตามคำค้น':'ยังไม่มีรอบบันทึก'),node('p',recordLibraryRuns.length?'เปลี่ยนคำค้นหรือช่วงวันที่':'เริ่มอ่านและบันทึกจากพื้นที่งาน แล้วจบรอบเพื่อเปิดข้อมูลที่นี่'));if(!recordLibraryRuns.length){const button=node('button','ไปพื้นที่งาน');button.type='button';button.onclick=()=>setTab('fleet');empty.append(button);}host.append(empty);return;}
  const table=node('table',null,'data-table run-catalog-table'),head=node('thead'),tr=node('tr');for(const label of ['ชื่อรอบ / พื้นที่งาน','เริ่ม – สิ้นสุด (UTC+07:00)','อุปกรณ์','ค่าที่บันทึก',''])tr.append(node('th',label));head.append(tr);const body=node('tbody');
  for(const run of runs){const row=node('tr'),name=node('td');name.append(node('strong',run.name|| (run.id==='__legacy__'?'ข้อมูลรุ่นเดิม':`รอบ ${runDateLabel(run.start)}`)),node('small',`${run.groupName||'ไม่ระบุพื้นที่งาน'} · ${run.id==='__legacy__'?'ไม่มีรหัสรอบ':run.id.slice(0,8)}`));const dates=node('td');dates.append(node('span',runDateLabel(run.start)),node('small',runDateLabel(run.end)));const devices=node('td');devices.append(node('strong',`${run.devices.length} อุปกรณ์`),node('small',run.devices.map(device=>device.id).join(' · ')));const action=node('td'),button=node('button','เปิดรอบ');button.type='button';button.setAttribute('aria-label',`เปิดรอบ ${run.name||runDateLabel(run.start)}`);button.onclick=()=>void selectRecordedRun(run);action.append(button);row.append(name,dates,devices,node('td',run.records.toLocaleString(),'mono'),action);body.append(row);}table.append(head,body);host.append(table);
}
async function selectRecordedRun(run){
  recordLibrarySelection=run;$('record-detail').hidden=false;$('run-catalog').hidden=true;document.querySelector('.run-search').hidden=true;
  $('run-detail-name').textContent=run.name|| (run.id==='__legacy__'?'ข้อมูลรุ่นเดิม':`รอบ ${runDateLabel(run.start)}`);
  $('run-detail-info').textContent=`${run.groupName||'ไม่ระบุพื้นที่งาน'} · ${runDateLabel(run.start)} ถึง ${runDateLabel(run.end)} · UTC+07:00${run.note?` · ${run.note}`:''}`;
  const picker=$('run-device');picker.replaceChildren(...run.devices.map(device=>new Option(device.name===device.id?device.id:`${device.name} · ${device.id}`,device.key)));if(!run.devices.some(device=>device.key===recordLibraryDevice))recordLibraryDevice=run.devices[0]?.key||'';picker.value=recordLibraryDevice;
  syncProductNavigation();await loadRecordedDevice();void loadRecordedQuality(run);
}
function updateRunActions(){
  const run=recordLibrarySelection,device=run?.devices.find(item=>item.key===recordLibraryDevice),active=recordingState.connected&&recordingState.runId===run?.id;
  $('run-analyze').hidden=!device?.xyz;$('run-csv').disabled=!run||run.id==='__legacy__'||active||busy||recordActionBusy;
  $('run-csv').title=active?'จบรอบการทำงานก่อนเปิด CSV':run?.id==='__legacy__'?'ข้อมูลรุ่นเดิมไม่มีรหัสรอบสำหรับ CSV แยกอุปกรณ์':'';
}
async function loadRecordedDevice(){
  const run=recordLibrarySelection,device=run?.devices.find(item=>item.key===recordLibraryDevice);if(!device)return;
  const token=++recordLibraryGeneration;recordLibraryRows=[];recordLibraryMetrics=device.metrics;$('run-data-status').textContent='กำลังอ่านข้อมูลอุปกรณ์…';$('run-data-table').replaceChildren();$('run-data-charts').replaceChildren();$('run-chart-readout').textContent='';updateRunActions();
  const options=$('run-column-options');options.replaceChildren();
  device.metrics.forEach((metric,index)=>{const label=node('label'),input=node('input');input.type='checkbox';input.value=metric.id;input.checked=index<6;input.onchange=renderRecordedRows;label.append(input,document.createTextNode(`${metric.label}${metric.unit?` · ${metric.unit}`:''}`));options.append(label);});
  try{const result=check(await api.recordedDeviceRows({runId:run.id,deviceKey:device.key,limit:2000,from:$('runs-from').value,to:$('runs-to').value}));if(token!==recordLibraryGeneration)return;recordLibraryRows=result.rows;$('run-data-status').textContent=`${device.id} · ${result.records.toLocaleString()} ค่าที่บันทึก · แสดงล่าสุด ${result.rows.length.toLocaleString()} เวลา${result.rows.length===result.limit?' (จำกัดจุดแสดงผล · CSV เก็บทั้งรอบ)':''}${result.skipped?` · ข้ามข้อมูลที่อ่านไม่ได้ ${result.skipped} รายการ`:''}`;renderRecordedRows();}
  catch(error){if(token===recordLibraryGeneration)$('run-data-status').textContent=`โหลดข้อมูลไม่สำเร็จ: ${error.message}`;}
}
function renderRecordedRows(){
  const tableHost=$('run-data-table'),charts=$('run-data-charts');tableHost.hidden=recordLibraryView!=='table';charts.hidden=recordLibraryView!=='charts';$('run-columns').hidden=recordLibraryView!=='table';$('run-chart-readout').hidden=recordLibraryView!=='charts';
  for(const view of ['table','charts'])$(`run-view-${view}`).setAttribute('aria-pressed',String(recordLibraryView===view));
  if(recordLibraryView==='charts')return drawRecordedCharts();
  tableHost.replaceChildren();const ids=new Set([...$('run-column-options').querySelectorAll('input:checked')].map(input=>input.value)),metrics=recordLibraryMetrics.filter(metric=>ids.has(metric.id));
  $('run-columns').querySelector('summary').textContent=`คอลัมน์ ${metrics.length}/${recordLibraryMetrics.length}`;
  const table=node('table',null,'data-table'),head=node('thead'),tr=node('tr');tr.append(node('th','เวลารับ (UTC+07:00)'));for(const metric of metrics)tr.append(node('th',`${metric.label}${metric.unit?` · ${metric.unit}`:''}`));tr.append(node('th','รายละเอียด'));head.append(tr);const body=node('tbody');
  for(const row of [...recordLibraryRows].reverse()){const tr=node('tr');tr.append(node('td',timestamp(row.timestamp),'mono'));for(const metric of metrics){const value=row.values[metric.id],td=node('td',formatRecordedValue(value),'mono');if(!Number.isFinite(value))td.title=row.states[metric.id]||'ไม่มีข้อมูลของค่านี้';tr.append(td);}const details=node('td'),button=node('button','ค่าดิบ / สูตร');button.type='button';button.setAttribute('aria-label',`ค่าดิบและสูตร ${timestamp(row.timestamp)}`);button.onclick=()=>void openRecordedSampleDetails(row);details.append(button);tr.append(details);body.append(tr);}
  if(!recordLibraryRows.length)emptyRow(body,metrics.length+2,'ไม่มีข้อมูลในรอบและอุปกรณ์ที่เลือก');table.append(head,body);tableHost.append(table);
}
function drawRecordedCharts(){
  const host=$('run-data-charts');host.replaceChildren();if(!recordLibraryRows.length){host.append(node('p','ไม่มีข้อมูลสำหรับกราฟ'));return;}
  const groups=new Map(),palette=['#007b8d','#3474bb','#6750c5','#b45424','#347841','#925080'];
  for(const metric of recordLibraryMetrics){const key=metric.key.startsWith('point:')?`${metric.label} (${metric.unit})`:/^(velocity|displacement|acceleration|frequency)[XYZ]$/.test(metric.key)?metric.key.slice(0,-1)+' · '+metric.unit:metric.unit||'ไม่มีหน่วย';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(metric);}
  const first=Date.parse(recordLibraryRows[0].timestamp),last=Date.parse(recordLibraryRows.at(-1).timestamp),intervals=recordLibraryRows.slice(1).map((row,i)=>Date.parse(row.timestamp)-Date.parse(recordLibraryRows[i].timestamp)).filter(value=>value>0).sort((a,b)=>a-b),gap=(intervals[Math.floor(intervals.length/2)]||1000)*3;
  const cursors=[];
  const inspect=(index,shown=recordLibraryMetrics.slice(0,3))=>{const row=recordLibraryRows[index];for(const cursor of cursors)cursor.setAttribute('x1',60+(Date.parse(row.timestamp)-first)/Math.max(1,last-first)*890),cursor.setAttribute('x2',cursor.getAttribute('x1'));$('run-chart-readout').textContent=`${timestamp(row.timestamp)} · ${shown.map(metric=>`${metric.label} ${formatRecordedValue(row.values[metric.id])} ${metric.unit}`).join(' · ')}`;};
  for(const metrics of groups.values()){
    const section=node('section',null,'record-chart'),header=node('div',null,'record-chart-heading');header.append(node('h4',metrics[0].label.replace(/ [XYZ]$/,'')+(metrics[0].unit?` · ${metrics[0].unit}`:'')));const legend=node('div',null,'record-chart-legend');metrics.forEach((metric,i)=>{const label=node('span',metric.label);label.style.color=palette[i%palette.length];legend.append(label);});header.append(legend);section.append(header);
    const svg=recordSvgNode('svg',{viewBox:'0 0 980 210',role:'img',tabindex:0,'aria-label':`กราฟเวลา ${metrics.map(m=>m.label).join(', ')} ใช้ลูกศรซ้ายขวาเลือกเวลา`});
    const values=recordLibraryRows.flatMap(row=>metrics.map(metric=>row.values[metric.id])).filter(Number.isFinite),lo=values.length?Math.min(...values):0,hi=values.length?Math.max(...values):1,pad=hi===0&&lo===0?1:Math.max((hi-lo)*.12,Math.abs(hi)*.03,Number.MIN_VALUE),min=lo-pad,max=hi+pad;
    for(let tick=0;tick<3;tick++){const y=20+tick*75,line=recordSvgNode('line',{x1:60,x2:950,y1:y,y2:y,stroke:'#e5e8ef'}),text=recordSvgNode('text',{x:52,y:y+4,'text-anchor':'end'});text.textContent=formatRecordedValue(max-tick*(max-min)/2);svg.append(line,text);}
    const point=(row,metric)=>[60+(Date.parse(row.timestamp)-first)/Math.max(1,last-first)*890,170-(row.values[metric.id]-min)/(max-min)*150];
    metrics.forEach((metric,color)=>{let d='',previous=null;recordLibraryRows.forEach(row=>{const value=row.values[metric.id];if(!Number.isFinite(value)){previous=null;return;}const [x,y]=point(row,metric),stamp=Date.parse(row.timestamp);d+=`${previous===null||stamp-previous>gap?'M':'L'}${x.toFixed(2)},${y.toFixed(2)} `;previous=stamp;});const path=recordSvgNode('path',{d,fill:'none',stroke:palette[color%palette.length],'stroke-width':1.8,'vector-effect':'non-scaling-stroke'});svg.append(path);if(recordLibraryRows.length===1&&Number.isFinite(recordLibraryRows[0].values[metric.id])){const[x,y]=point(recordLibraryRows[0],metric);svg.append(recordSvgNode('circle',{cx:x,cy:y,r:3,fill:palette[color%palette.length]}));}});
    for(const [x,stamp,anchor]of[[60,first,'start'],[950,last,'end']]){const text=recordSvgNode('text',{x,y:198,'text-anchor':anchor});text.textContent=time(stamp);svg.append(text);}
    const cursor=recordSvgNode('line',{x1:60,x2:60,y1:15,y2:175,stroke:'#7264b8','stroke-dasharray':'3 3'});svg.append(cursor);cursors.push(cursor);
    let index=recordLibraryRows.length-1;
    svg.onpointermove=event=>{const area=svg.getBoundingClientRect(),target=first+Math.max(0,Math.min(1,((event.clientX-area.left)/area.width*980-60)/890))*(last-first);index=recordLibraryRows.reduce((best,row,i)=>Math.abs(Date.parse(row.timestamp)-target)<Math.abs(Date.parse(recordLibraryRows[best].timestamp)-target)?i:best,0);inspect(index,metrics);};
    svg.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();index=event.key==='Home'?0:event.key==='End'?recordLibraryRows.length-1:Math.max(0,Math.min(recordLibraryRows.length-1,index+(event.key==='ArrowRight'?1:-1)));inspect(index,metrics);};
    section.append(svg);if(!values.length)section.append(node('p','ยังไม่มีค่าที่ใช้ได้สำหรับกราฟนี้'));host.append(section);
  }
  inspect(recordLibraryRows.length-1);
}
async function openRecordedAnalysis(){
  const run=recordLibrarySelection,device=run?.devices.find(item=>item.key===recordLibraryDevice);if(!device?.xyz)return;
  try{
    $('history-date').value=new Date(Date.parse(run.start)+7*3600000).toISOString().slice(0,10);$('history-end-date').value=new Date(Date.parse(run.end)+7*3600000).toISOString().slice(0,10);
    historyMotorIds.add(device.id);renderHistoryMotors();setHistoryMotor(device.id);
    await loadHistory();$('history-run').value=run.id;restoreHistoryRange();
    $('range-from').value=new Date(Date.parse(run.start)+7*3600000).toISOString().slice(0,19);$('range-to').value=new Date(Date.parse(run.end)+7*3600000+1000).toISOString().slice(0,19);
    invalidateHistoryRange();syncAnalysisHistoryControls();setAnalysisSource('history');setTab('analysis');$('history-view-lines').click();
  }catch(error){toast(`เปิดวิเคราะห์ไม่สำเร็จ: ${error.message}`);}
}
async function openRecordedDeviceHistory(id,power=false){
  setTab('history');await loadRecordLibrary();const run=recordLibraryRuns.find(run=>run.devices.some(device=>device.id===id&&device.power===power));
  if(run){recordLibraryDevice=(power?'PM:':'')+id;await selectRecordedRun(run);}
  else $('runs-status').textContent=`ยังไม่มีข้อมูลที่บันทึกของ ${id}`;
}

async function loadRecordedQuality(run){
  let panel=$('run-quality');if(!panel){panel=node('details',null,'run-quality');panel.id='run-quality';$('run-detail-info').parentElement.parentElement.after(panel);}panel.replaceChildren(node('summary','คุณภาพข้อมูลและไฟล์ CSV'),node('p','กำลังอ่านข้อมูลรอบ…'));panel.open=false;
  try{
    const result=check(await api.recordedRunQuality(run.id));if(recordLibrarySelection?.id!==run.id)return;
    panel.replaceChildren(node('summary',`คุณภาพข้อมูล · ${result.csvFiles} ไฟล์ CSV`));
    const active=recordingState.connected&&recordingState.runId===run.id;
    panel.append(node('p',active?'รอบนี้กำลังทำงาน · จบรอบก่อนเตรียมไฟล์ CSV':result.csvFiles>=run.devices.length?'มีไฟล์ CSV ครบตามจำนวนอุปกรณ์':'ไฟล์ CSV ยังไม่ครบ · กด CSV ของรอบนี้เพื่อสร้างจากข้อมูลที่บันทึก'));
    if(run.id!=='__legacy__'){const events=node('button','เหตุการณ์ของรอบนี้');events.id='run-open-events';events.type='button';events.onclick=()=>openRecordedRunEvents(run);panel.append(events);}
    if(result.message)panel.append(node('p',result.message));
    if(!result.available){panel.append(node('p','รอบนี้ไม่มีรายงานคุณภาพการสื่อสารที่บันทึกไว้ · ไม่สรุปอัตราความสำเร็จจากจำนวนแถวข้อมูล'));return;}
    const table=node('table',null,'data-table'),head=node('thead'),tr=node('tr');for(const title of ['อุปกรณ์','คำขอ','ตอบครบ','บางส่วน','ผิดพลาด','Timeout','บันทึก','จัดเก็บผิดพลาด'])tr.append(node('th',title));head.append(tr);const body=node('tbody');
    for(const device of result.quality.devices||[]){const row=node('tr');row.append(node('td',device.deviceId));for(const key of ['attempts','ok','partial','failed','timeouts','saved','storageErrors'])row.append(node('td',Number.isFinite(device[key])?device[key].toLocaleString():'—','mono'));body.append(row);}table.append(head,body);panel.append(table);
    if(result.quality.lostEvents)panel.append(node('p',`บันทึกวินิจฉัยตกหล่น ${result.quality.lostEvents} เหตุการณ์`));
  }catch(error){if(recordLibrarySelection?.id===run.id)panel.replaceChildren(node('summary','คุณภาพข้อมูล'),node('p',`อ่านรายงานไม่ได้: ${error.message}`));}
}

function openRecordedRunEvents(run){
  const dialog=node('dialog',null,'record-provenance'),header=node('div',null,'dialog-header'),title=node('div');title.append(node('h2','เหตุการณ์ของรอบบันทึก'),node('p',run.name||run.id));const close=node('button','ปิด');close.type='button';close.onclick=()=>dialog.close();header.append(title,close);
  const body=node('div',null,'record-provenance-body'),controls=node('div',null,'event-filters'),device=node('select'),errors=node('input'),errorLabel=node('label','เฉพาะข้อผิดพลาด'),status=node('p'),list=node('div');device.setAttribute('aria-label','อุปกรณ์ในเหตุการณ์ของรอบ');device.add(new Option('ทุกอุปกรณ์',''));for(const item of run.devices)device.add(new Option(item.name===item.id?item.id:`${item.name} · ${item.id}`,item.id));errors.type='checkbox';errors.checked=true;errorLabel.prepend(errors);controls.append(device,errorLabel);body.append(controls,status,list);dialog.append(header,body);dialog.setAttribute('aria-label','เหตุการณ์ของรอบบันทึก');dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();let generation=0;
  const load=async()=>{const token=++generation;list.replaceChildren();status.textContent='กำลังอ่านเหตุการณ์…';try{const result=check(await api.recordedRunEvents({runId:run.id,deviceId:device.value,errorsOnly:errors.checked}));if(!dialog.isConnected||token!==generation)return;status.textContent=!result.available?'รอบนี้ไม่มีไฟล์เหตุการณ์':!result.matched?'ไม่มีเหตุการณ์ตรงตัวกรอง':`แสดงล่าสุด ${result.events.length} จาก ${result.matched} เหตุการณ์${result.skipped?` · ข้ามบรรทัดที่อ่านไม่ได้ ${result.skipped}`:''}`;
    for(const event of [...result.events].reverse()){const detail=node('details',null,'record-event');detail.append(node('summary',`${timestamp(event.endedAt||event.timestamp||event.startedAt)} · ${event.deviceId||'SYSTEM'} · ${event.outcome||event.type}`),node('pre',JSON.stringify(event,null,2)));list.append(detail);}
  }catch(error){if(dialog.isConnected&&token===generation)status.textContent=`อ่านเหตุการณ์ไม่ได้: ${error.message}`;}};device.onchange=errors.onchange=load;void load();
}

async function openRecordedSampleDetails(sample){
  const run=recordLibrarySelection,deviceKey=recordLibraryDevice;if(!run)return;
  const dialog=node('dialog',null,'record-provenance'),header=node('div',null,'dialog-header'),title=node('div');title.append(node('h2','ค่าดิบและสูตรที่บันทึก'),node('p',`${deviceKey} · ${timestamp(sample.timestamp)}`));const close=node('button','ปิด');close.type='button';close.onclick=()=>dialog.close();header.append(title,close);const body=node('div',null,'record-provenance-body');body.append(node('p','กำลังอ่านรายละเอียด…'));dialog.append(header,body);dialog.setAttribute('aria-label','ค่าดิบและสูตรที่บันทึก');dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  const words=value=>Array.isArray(value)?value.map(word=>Number.isInteger(word)?`${word} (0x${(word&65535).toString(16).toUpperCase().padStart(4,'0')})`:String(word)).join(' / '):JSON.stringify(value,null,2);
  try{const result=check(await api.recordedSampleDetails({runId:run.id,deviceKey,timestamp:sample.timestamp,recordingId:sample.recordingId}));if(!dialog.isConnected)return;body.replaceChildren();
    if(!result.rows.length){body.append(node('p','ไม่พบรายละเอียดในไฟล์ของเวลานี้'));return;}
    for(const row of result.rows){
      body.append(node('p',`${row.port||'ไม่ระบุพอร์ต'} · Slave ID ${row.slaveId??'—'}`));
      if(row.kind==='points'){
        body.append(node('h3',row.name||row.pointId),node('p',`Address เริ่ม 0: ${row.registerAddress??'—'} · ${row.registerType==='input'?'FC04':'FC03'} · ${row.dataType||'ไม่ระบุชนิด'} · ${row.byteOrder||'ไม่ระบุลำดับ'}`),node('pre',`Raw: ${words(row.raw||[])}\nสูตร: ค่าแปลผลจาก Register × ${row.scale??'ไม่ระบุ'} + ${row.offset??'ไม่ระบุ'}\nผล: ${Number.isFinite(row.value)?row.value:'—'} ${row.unit||''} · ${row.status||''}${row.message?' · '+row.message:''}`));
      }else if(row.kind==='readings'){
        for(const group of row.channels?['velocity','displacement','acceleration','frequency','temperature']:['custom']){
          try{for(const conversion of MeasurementConversion.describe(row,group,Boolean(row.channels)))body.append(node('pre',MeasurementConversion.text(conversion)));}catch{body.append(node('p','ไฟล์รุ่นเดิมไม่เก็บรายละเอียดสูตรของค่านี้'));}
        }
        if(!row.rawRegisters)body.append(node('p','ไฟล์นี้ไม่เก็บ Register ดิบ · ไม่ใช้การตั้งค่าปัจจุบันแทนสูตรเดิม'));
      }else{
        body.append(node('p',`Float32 · Byte/Word: ${row.byteOrder||'ไม่ระบุ / ยังไม่ยืนยัน'} · ปรับ RTU Address ${row.offsetAdjust??'ไม่ระบุ'} · ไม่มีตัวคูณเพิ่มเติม`));
        for(const [key,value]of Object.entries(row.raw||{}))body.append(node('h3',key),node('pre',Array.isArray(value)?words(value):JSON.stringify(value,null,2)));
        if(!row.raw)body.append(node('p','ไฟล์นี้ไม่เก็บ Register ดิบ'));
      }
    }
  }catch(error){if(dialog.isConnected)body.replaceChildren(node('p',`อ่านรายละเอียดไม่ได้: ${error.message}`));}
}
