'use strict';
let analysisSource = 'history';
let drawHistoryAnalysis = () => {};
function analysisHistoryActive() { return currentTab === 'analysis' && analysisSource === 'history'; }
function syncAnalysisHistoryControls() {
  for (const [source,target] of [['history-motor','analysis-history-motor'],['history-run','analysis-history-run']]) {
    const origin=$(source),mirror=$(target);if(!origin||!mirror)continue;
    mirror.replaceChildren(...[...origin.options].map(option=>option.cloneNode(true)));mirror.value=origin.value;
    if(target==='analysis-history-motor'&&mirror.options[0])mirror.options[0].textContent='เลือกมอเตอร์';
  }
  if($('analysis-history-open-folder'))$('analysis-history-open-folder').disabled=!hasRunFolder($('history-run')?.value);
  if($('load-range')&&document.querySelector('.history-range')?.dataset.loaded!=='loading')$('load-range').disabled=!$('history-motor')?.value;
}
async function openHistoryAnalysis() {
  syncAnalysisHistoryControls();
  await loadHistory();
  if(!analysisHistoryActive())return;
  const panel=document.querySelector('.history-range');
  if($('history-motor').value&&!['true','loading'].includes(panel.dataset.loaded))$('load-range').click();
  else drawHistoryAnalysis();
}
function setAnalysisSource(source) {
  if(!['history','waveform'].includes(source))return;
  analysisSource=source;closeWorkbenchPopovers();
  $('analysis-view').dataset.source=source;
  $('spectral-source').hidden=source!=='waveform';
  for(const value of ['history','waveform']){
    $(`analysis-${value}`).hidden=value!==source;
    const button=$(`analysis-source-${value}`);button.setAttribute('aria-selected',String(value===source));button.tabIndex=value===source?0:-1;
  }
  if(analysisHistoryActive())void openHistoryAnalysis();
}
function setupAnalysisWorkspace() {
  const host=$('analysis-view'),waveform=node('div',null,'analysis-source-panel');waveform.id='analysis-waveform';
  waveform.append(...host.childNodes);waveform.hidden=true;
  const heading=node('div',null,'analysis-navigation'),title=node('h2','วิเคราะห์ข้อมูล'),sources=node('div',null,'analysis-sources');sources.setAttribute('role','tablist');sources.setAttribute('aria-label','แหล่งข้อมูลที่ใช้วิเคราะห์');
  const history=node('div',null,'analysis-source-panel');history.id='analysis-history';
  for(const [value,text] of [['history','ค่าที่บันทึก · XYZ'],['waveform','คลื่นดิบ · FFT']]){
    const button=node('button',text);button.id=`analysis-source-${value}`;button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-controls',`analysis-${value}`);button.onclick=()=>setAnalysisSource(value);
    button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'history':event.key==='End'?'waveform':analysisSource==='history'?'waveform':'history';setAnalysisSource(next);$(`analysis-source-${next}`).focus();};
    sources.append(button);$(`analysis-${value}`)?.setAttribute('aria-labelledby',button.id);
  }
  heading.append(title,sources,waveform.querySelector('#spectral-source'));host.replaceChildren(heading,history,waveform);
  for(const value of ['history','waveform']){$(`analysis-${value}`).setAttribute('role','tabpanel');$(`analysis-${value}`).setAttribute('aria-labelledby',`analysis-source-${value}`);}
  const range=document.querySelector('.history-range');history.append(range);
  range.querySelector('.panel-heading h2').textContent='ข้อมูลการสั่นย้อนหลัง';
  range.querySelector('.panel-heading p').textContent='จุดกระจายแสดงความสัมพันธ์ X/Y/Z ของค่ารวม · ไม่ใช่คลื่นดิบหรือสเปกตรัม FFT';
  const controls=range.querySelector('.history-range-controls');
  for(const [id,label,original]of[['analysis-history-run','รอบอ่าน','history-run'],['analysis-history-motor','มอเตอร์','history-motor']]){
    const wrap=node('label',label),select=node('select');select.id=id;select.setAttribute('aria-label',label);wrap.append(select);controls.prepend(wrap);
    select.onchange=()=>{$(original).value=select.value;$(original).dispatchEvent(new Event('change'));};
  }
  const actions=node('div',null,'analysis-history-actions'),tableButton=node('button','ดูตาราง / ส่งออก CSV'),folderButton=node('button','โฟลเดอร์รอบนี้');
  tableButton.type=folderButton.type='button';folderButton.id='analysis-history-open-folder';
  tableButton.onclick=()=>setTab('history');folderButton.onclick=()=>{if(!$('open-run-folder').disabled)$('open-run-folder').click();};actions.append(tableButton,folderButton);range.querySelector('.panel-heading').append(actions);
  const open=node('button','เปิดกราฟในหน้าวิเคราะห์');open.id='history-open-analysis';open.type='button';open.onclick=()=>{setAnalysisSource('history');setTab('analysis');};$('history-view').querySelector('.section-toolbar .inline-controls').append(open);
  $('load-range').textContent='โหลดกราฟ';
  const resetDates=()=>{
    if($('history-end-date').value<$('history-date').value)$('history-end-date').value=$('history-date').value;
    resetHistoryRun();
    $('range-from').value=`${$('history-date').value}T00:00:00`;
    $('range-to').value=`${$('history-end-date').value}T23:59:59.999`;
    historyGeneration++;emptyRow($('history-body'),20,'ตัวกรองเปลี่ยนแล้ว · กำลังโหลดข้อมูล');invalidateHistoryRange();syncAnalysisHistoryControls();
    if(currentTab==='history'||analysisHistoryActive())void loadHistory();
  };
  $('history-date').onchange=resetDates;$('history-end-date').onchange=resetDates;
  for(const id of ['range-from','range-to'])$(id).addEventListener('change',()=>{
    const start=$('range-from').value.slice(0,10),end=$('range-to').value.slice(0,10);
    if(start)$('history-date').value=start;if(end)$('history-end-date').value=end;
    historyGeneration++;emptyRow($('history-body'),20,'ช่วงเวลาข้อมูลเปลี่ยนแล้ว');
    if(analysisHistoryActive())void loadHistory();
  });
  syncAnalysisHistoryControls();setAnalysisSource('history');
}
