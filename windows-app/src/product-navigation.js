'use strict';
const productSections = {
  workspace:{label:'พื้นที่งาน', icon:'topology-star-3', tabs:['fleet','overview','monitor','registers','model']},
  records:{label:'รอบบันทึก', icon:'history', tabs:['history','analysis']},
  library:{label:'คลัง', icon:'devices', tabs:['motors','templates']},
  settings:{label:'ตั้งค่า', icon:'list-details', tabs:['settings','events']}
};
const productPages = {fleet:'แผนผัง', overview:'ภาพรวมอุปกรณ์', monitor:'ค่าการวัด', registers:'ค่าดิบและสูตร', model:'มุมมอง 3D', history:'รอบบันทึก', analysis:'วิเคราะห์', motors:'อุปกรณ์ทั้งหมด', templates:'แม่แบบ Register', settings:'ตั้งค่าโปรแกรม', events:'เหตุการณ์'};
let productSection = 'workspace';
let syncEditorBus=()=>{};
const sectionPages = {};
function productSectionFor(tab) { return Object.keys(productSections).find(key=>productSections[key].tabs.includes(tab)) || 'workspace'; }
function setupProductNavigation() {
  const nav=document.querySelector('.app-nav'), leaves=node('nav',null,'context-tabs');leaves.id='context-tabs';leaves.setAttribute('role','tablist');
  const heading=document.querySelector('.document-heading');
  const context=node('nav',null,'navigation-context');context.id='navigation-context';context.setAttribute('aria-label','เส้นทางหน้าปัจจุบัน');heading.before(context);heading.after(leaves);
  const header=node('div',null,'reading-header');heading.before(header);header.append(heading,leaves);
  for(const [tab,label] of Object.entries(productPages)){
    let button=document.querySelector(`[data-tab="${tab}"]`);
    if(!button){button=node('button',label);button.dataset.tab=tab;button.id=`tab-${tab}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',`${tab}-view`);button.onclick=()=>setTab(tab);}
    else button.replaceChildren(document.createTextNode(label),...(tab==='events'?[$('event-count')]:[]));
    button.setAttribute('aria-label',label);button.title=label;
    button.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const buttons=[...button.closest('[role=tablist]').querySelectorAll('button')].filter(item=>!item.hidden),index=buttons.indexOf(button);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      event.preventDefault();buttons[next].click();buttons[next].focus();
    };
    leaves.append(button);
  }
  const deviceButton=node('button','รายละเอียดอุปกรณ์');deviceButton.id='tab-device';deviceButton.type='button';deviceButton.setAttribute('role','tab');deviceButton.setAttribute('aria-controls','device-panel');deviceButton.onclick=()=>setTab('monitor');
  $('tab-monitor').before(deviceButton);
  const deviceTabs=node('div',null,'device-tabs');deviceTabs.setAttribute('role','tablist');deviceTabs.setAttribute('aria-label','รายละเอียดอุปกรณ์ที่เลือก');deviceTabs.append($('tab-monitor'),$('tab-registers'));$('graph-tools').prepend(deviceTabs);
  const devicePanel=node('section',null,'device-panel');devicePanel.id='device-panel';devicePanel.setAttribute('role','tabpanel');devicePanel.setAttribute('aria-labelledby','tab-device');$('graph-tools').before(devicePanel);devicePanel.append($('graph-tools'),$('monitor-view'),$('registers-view'));
  deviceButton.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...leaves.children].filter(item=>!item.hidden);const index=buttons.indexOf(deviceButton),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;event.preventDefault();buttons[next].click();buttons[next].focus();};
  nav.replaceChildren();nav.setAttribute('role','navigation');nav.setAttribute('aria-label','เมนูหลัก');
  const brand=node('div',null,'rail-brand');brand.append(node('span','V','brand-mark'));brand.setAttribute('aria-hidden','true');nav.append(brand);
  for(const [key,definition] of Object.entries(productSections)){
    const button=node('button');button.type='button';button.dataset.section=key;button.setAttribute('aria-label',definition.label);
    const icon=node('i',null,'nav-symbol');icon.style.setProperty('--nav-icon',`url("icons/${definition.icon}.svg")`);icon.setAttribute('aria-hidden','true');
    button.append(icon,node('b',definition.label,'nav-label'));button.onclick=()=>setTab(sectionPages[key]||definition.tabs[0]);nav.append(button);
    if(key==='settings'){const badge=node('span',null,'root-events-badge');badge.id='root-events-badge';badge.hidden=true;button.append(badge);}
  }
  const session=node('span',null,'session-workspace');session.id='session-workspace';document.querySelector('.command-group').prepend(session);
  const main=document.querySelector('main');
  for(const key of ['templates','settings']){const view=node('section',null,'view');view.id=`${key}-view`;view.hidden=true;view.setAttribute('role','tabpanel');view.setAttribute('aria-labelledby',`tab-${key}`);main.append(view);}
  setupDeviceOverview();
  setupProgramSettings();setupRecordLibrary();
  $('power-open-history').onclick=()=>selectedPowerMeter()?void openRecordedDeviceHistory(selectedPowerMeter().id,true):setTab('history');
  const lastRun=node('button','เปิดรอบที่บันทึก');lastRun.id='view-last-run';lastRun.type='button';lastRun.hidden=true;lastRun.onclick=async()=>{const id=recordingState.runId;setTab('history');await loadRecordLibrary();const run=recordLibraryRuns.find(item=>item.id===id);if(run)await selectRecordedRun(run);};$('recording-strip').append(lastRun);
  const libraryButton=node('button','จัดการแม่แบบ Register');libraryButton.type='button';libraryButton.onclick=()=>openTemplateLibrary();
  $('templates-view').append(node('h2','แม่แบบ Register'),node('p','ผังจุดวัด สูตร และหน่วยที่นำไปใช้กับอุปกรณ์ใหม่ได้','section-description'),libraryButton,node('div',null,'template-catalog'));$('templates-view').lastChild.id='template-catalog';
  $('manage-register-templates').hidden=true;
  $('open-run-diagnostics').hidden=true;
  $('open-data').hidden=true;
  setupEditorSections();setupEventFilters();
  const search=node('input');search.id='registry-search';search.type='search';search.placeholder='ค้นหาอุปกรณ์ รุ่น หรือพื้นที่งาน';search.setAttribute('aria-label','ค้นหาอุปกรณ์ในคลัง');search.oninput=renderDeviceRegistry;$('motors-view').querySelector('.data-table').parentElement.before(search);
  const duration=node('label','การสิ้นสุดการบันทึก'),select=node('select');select.id='record-limit-mode';select.setAttribute('aria-label','การสิ้นสุดการบันทึก');select.add(new Option('จนกดหยุด','manual'));select.add(new Option('ตามระยะเวลา','duration'));duration.append(select);$('record-duration-label').before(duration);
  const refresh=()=>{const active=$('record-start-mode').value!=='monitor-only';duration.hidden=!active;$('record-duration-label').hidden=!active||select.value==='manual';$('record-duration-note').hidden=true;if(select.value==='manual')$('recording-form').elements.durationMinutes.value='0';else if(Number($('recording-form').elements.durationMinutes.value)<=0)$('recording-form').elements.durationMinutes.value='60';};
  select.onchange=refresh;$('record-start-mode').addEventListener('change',refresh);
  const openRecording=$('record-settings').onclick;$('record-settings').onclick=()=>{openRecording();select.value=Number(recordingState.settings.durationMinutes)>0?'duration':'manual';refresh();};
  syncProductNavigation();
}
function syncProductNavigation(){
  if(!$('context-tabs'))return;
  productSection=productSectionFor(currentTab);sectionPages[productSection]=currentTab;
  const shell=document.querySelector('.shell');shell.dataset.section=productSection;shell.dataset.running=String(mode!=='offline'||busy&&connectingDevices);
  for(const button of document.querySelectorAll('.app-nav [data-section]')){const active=button.dataset.section===productSection;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  for(const button of $('context-tabs').children)button.hidden=button.id==='tab-device'?productSection!=='workspace':!productSections[productSection].tabs.includes(button.dataset.tab)||(button.dataset.tab==='model'&&!activeWorkspace()?.modelEnabled);
  const devicePage=['monitor','registers'].includes(currentTab);$('device-panel').hidden=!devicePage;
  $('tab-device').classList.toggle('active',devicePage);$('tab-device').setAttribute('aria-selected',String(devicePage));$('tab-device').tabIndex=devicePage?0:-1;
  document.querySelector('.shell').dataset.devicePage=currentTab;
  $('context-tabs').setAttribute('aria-label',`เมนูย่อย ${productSections[productSection].label}`);
  const workspace=activeWorkspace(),meter=selectedPowerMeter(),device=meter||currentProfile();
  const context=$('navigation-context');context.replaceChildren(node('span',productSections[productSection].label));
  if(productSection==='workspace'){
    context.append(node('span','/','path-separator'),node('strong',workspace?.name||'ยังไม่ได้เลือกพื้นที่งาน'));
    if(['monitor','registers'].includes(currentTab)&&device)context.append(node('span','/','path-separator'),node('span',device.name||device.id||device.motorId));
  }else if(productSection==='records'){
    const savedRun=currentTab==='history'?recordLibrarySelection:analysisSource==='history'?(recordLibraryRuns.find(run=>run.id===$('history-run').value)||historyRuns.find(run=>run.runId===$('history-run').value)):null;
    if(savedRun)context.append(node('span','/','path-separator'),node('strong',savedRun.name||savedRun.runName||runDateLabel(savedRun.start||savedRun.firstTimestamp)));
    else if(currentTab==='analysis')context.append(node('span','/','path-separator'),node('span',analysisSource==='waveform'?'ไฟล์คลื่นดิบ':'ช่วงข้อมูลที่เลือก'));
  }
  context.append(node('span','/','path-separator'),node('span',productPages[currentTab]));
  $('session-workspace').textContent=workspace?`${workspace.name} · ${workspace.motorIds.length+workspace.meters.length} อุปกรณ์`:'ยังไม่ได้เลือกพื้นที่งาน';
  $('toggle-sidebar').hidden=productSection!=='workspace';
  const deviceContext=productSection==='workspace'&&['monitor','registers'].includes(currentTab);
  $('edit-motor').hidden=!deviceContext||!device;
  $('new-motor').hidden=productSection!=='workspace'||!workspace||currentTab==='fleet';
  $('record-settings').hidden=productSection!=='workspace';$('groups-quick').hidden=productSection!=='workspace';
  if(productSection!=='workspace')$('status-bus').textContent=mode==='live'?`พื้นที่งานสด · ${workspace?.name||''}`:'ข้อมูลที่บันทึกในเครื่อง';
  if(currentTab==='templates')renderTemplateCatalog();
  if(recordLibrarySelection)updateRunActions();
  if($('view-last-run')){$('view-last-run').hidden=mode!=='offline'||!recordingState.count;$('view-last-run').disabled=busy||recordActionBusy;}
  const ready=Boolean(currentProfile()&&stateFor(currentProfile().motorId).frames.length);
  if(devicePage)$('graph-tools').hidden=false;
  shell.dataset.deviceEmpty=String(!ready||Boolean(meter));
  const more=$('session-actions');more.hidden=![...more.querySelectorAll('.session-options > button')].some(button=>!button.hidden);
  if(currentTab==='monitor'&&!ready&&!meter){
    const readiness=workspaceReadiness();
    const label=!workspace?'เลือกพื้นที่งาน':!device?'เพิ่มอุปกรณ์':mode!=='offline'?'ดูสถานะการเชื่อมต่อ':readiness.message?'ตั้งค่าอุปกรณ์':$('connect-all').textContent;
    controlLabel($('welcome-setup'),label,mode!=='offline'||readiness.message?'settings':'play');
    $('welcome-setup').onclick=()=>!workspace?showWorkspacePicker():!device?openFlowAddDevice():mode!=='offline'?setTab('fleet'):readiness.message?openEditor(currentProfile()):start();
    if(mode!=='offline'){$('empty-state-title').textContent='กำลังรอข้อมูลจากอุปกรณ์';$('welcome').querySelector('p').textContent=currentProfile()?stateFor(currentProfile().motorId).message||'โปรแกรมกำลังอ่านข้อมูล · ตรวจสถานะได้ที่แผนผัง':'เลือกอุปกรณ์จากพื้นที่งาน';}
  }
}
function setupDeviceOverview(){
  const view=node('section',null,'view');view.id='overview-view';view.hidden=true;view.setAttribute('role','tabpanel');view.setAttribute('aria-labelledby','tab-overview');
  const title=node('div',null,'overview-heading');title.append(node('h2','ภาพรวมอุปกรณ์'),document.querySelector('.fleet-totals'),$('fleet-filter'));
  const meters=node('section');meters.id='overview-meters';view.append(title,$('fleet-legacy'),meters);document.querySelector('main').append(view);
  const tools=node('div',null,'overview-chart-tools'),label=node('label','ช่วงกราฟ'),range=node('select'),countLabel=node('label','จำนวนค่าที่แสดง'),count=node('input');range.id='overview-window';range.setAttribute('aria-label','ช่วงกราฟภาพรวม');range.replaceChildren(...[...$('fleet-window').options].map(option=>option.cloneNode(true)));count.id='overview-count';count.type='number';count.min='2';count.max='20000';count.value=$('graph-count').value;countLabel.append(count);label.append(range);tools.append(label,countLabel);title.after(tools);
  const sync=()=>{range.value=$('fleet-window').value;count.value=$('graph-count').value;countLabel.hidden=range.value!=='custom';};range.onchange=()=>{$('fleet-window').value=range.value;updateGraphWindow();sync();};count.onchange=()=>{$('graph-count').value=count.value;updateGraphWindow();sync();};$('fleet-window').addEventListener('change',sync);$('graph-count').addEventListener('change',sync);sync();
  document.querySelector('.fleet-totals>span').firstChild.textContent='อุปกรณ์ ';
  const switcher=document.querySelector('.flow-switch');switcher.hidden=true;$('list-mode').onclick=()=>setTab('overview');$('flow-mode').onclick=()=>setTab('fleet');
}
function renderOverviewMeters(){
  const host=$('overview-meters');if(!host||currentTab!=='overview')return;host.replaceChildren();
  const devices=workspaceReadiness().devices,signals=devices.map(item=>deviceSignal(item.id?'meter':'sensor',item));$('fleet-total').textContent=devices.length;$('fleet-online').textContent=signals.filter(item=>item.state==='online').length;$('fleet-fault').textContent=signals.filter(item=>item.state==='fault').length;$('fleet-disabled').textContent=devices.filter(item=>item.enabled===false).length;if(activeWorkspace()?.meters.length)$('fleet-empty').hidden=true;
  const query=$('motor-search').value.trim().toLowerCase(),filter=$('fleet-filter').value;
  for(const meter of activeWorkspace()?.meters||[]){const state=powerStates.get(meter.id),signal=deviceSignal('meter',meter),button=node('button',null,'overview-meter');button.hidden=!`${meter.id} ${meter.name} ${deviceModelLabel(meter)}`.toLowerCase().includes(query)||(filter!=='all'&&(filter==='disabled'?meter.enabled!==false:signal.state!==filter));button.type='button';const title=node('strong',meter.name||meter.id);button.append(title,node('small',`${meter.id} · ${deviceModelLabel(meter)} · ${portLabel(meter.path)} / ID ${meter.slaveId}`));const status=node('span',signal.label,'overview-meter-status');status.prepend(node('i',null,`dot ${signal.state}`));button.append(status);const values=node('div',null,'overview-meter-values');for(const [key,label,unit]of [['voltageLLAvg','แรงดันเฉลี่ย L–L','V'],['currentAvg','กระแสเฉลี่ย','A'],['activePowerTotal','กำลังไฟฟ้ารวม','kW']]){const value=node('span');value.append(node('small',label),node('b',`${formatRecordedValue(state?.values?.[key])} ${unit}`));values.append(value);}button.append(values);button.onclick=()=>selectMeter(meter.id);host.append(button);}
  $('fleet-no-matches').hidden=!devices.length||Boolean(viewVisibleOverviewDevice());
}
function viewVisibleOverviewDevice(){return $('overview-view').querySelector('.fleet-card:not([hidden]),.overview-meter:not([hidden])');}
function renderTemplateCatalog(){
  const list=$('template-catalog');if(!list)return;list.replaceChildren();
  const table=node('table',null,'data-table'),head=node('thead'),row=node('tr');for(const name of ['ชื่อแม่แบบ','ประเภท','การใช้งาน'])row.append(node('th',name));head.append(row);const body=node('tbody');
  for(const item of templateCatalog()){const tr=node('tr');tr.append(node('td',item.name),node('td',DeviceTemplates.builtins.some(entry=>entry.id===item.id)?'มาตรฐาน':'แม่แบบ'),node('td','ผัง Register และสูตร · ไม่รวม Slave ID หรือพอร์ต'));body.append(tr);}table.append(head,body);list.append(table);
}
function setupProgramSettings(){
  const view=$('settings-view');view.append(node('h2','ตั้งค่าโปรแกรม'));
  const add=(title,description,buttons)=>{const section=node('section',null,'settings-section');section.append(node('h3',title),node('p',description,'section-description'));const actions=node('div',null,'settings-actions');for(const [id,text,handler] of buttons){const button=node('button',text);button.id=id;button.type='button';button.onclick=handler;actions.append(button);}section.append(actions);view.append(section);return section;};
  const storage=add('การจัดเก็บข้อมูล','หนึ่งรอบการทำงานต่อหนึ่งโฟลเดอร์ · CSV หนึ่งไฟล์ต่ออุปกรณ์',[['settings-open-output','เปิดโฟลเดอร์ผลลัพธ์',()=>action(()=>api.openDataPath().then(check))],['settings-open-runs','ดูรอบบันทึกในโปรแกรม',()=>setTab('history')]]);const location=node('p',null,'storage-location');location.id='settings-data-path';storage.append(location);
  add('สำรองและกู้คืน','รวมอุปกรณ์ทุกชนิด พื้นที่งาน บัส แม่แบบ และโหมดบันทึก · แยกจากไฟล์ค่าการวัด',[['backup-all-settings','สำรองการตั้งค่าทั้งหมด',()=>action(async()=>{const result=check(await api.exportSettings());if(!result.canceled)toast('สำรองการตั้งค่าทั้งหมดแล้ว');})],['restore-all-settings','กู้คืนการตั้งค่า…',()=>action(async()=>{if(mode!=='offline')return toast('หยุดอ่านก่อนกู้คืนการตั้งค่า');const result=check(await api.importSettings());if(!result.canceled){hydrateProductSettings(check(await api.initialize()));toast('กู้คืนการตั้งค่าแล้ว');}})]]);
  const legacy=node('details',null,'legacy-settings'),summary=node('summary','ไฟล์รายชื่อจากรุ่นเดิม');legacy.append(summary,node('p','นำเข้า/ส่งออกเฉพาะรายชื่อเซ็นเซอร์รุ่นเดิม ไม่รวมมิเตอร์ พื้นที่งาน บัส และแม่แบบ','section-description'),$('import-profiles'),$('export-profiles'));view.append(legacy);
  add('การวินิจฉัย','ตรวจคำขอ Modbus การตอบกลับ และข้อผิดพลาดของรอบปัจจุบัน',[['settings-read-quality','คุณภาพการอ่าน',()=>$('open-run-diagnostics').click()],['settings-event-log','บันทึกเหตุการณ์',()=>setTab('events')]]);
  add('คู่มือและโปรแกรม','การตอบกลับสำเร็จแสดงสถานะการสื่อสาร ส่วนความถูกต้องของค่าต้องตรวจผังและหน่วย',[['settings-help','เปิดคู่มือ',()=>$('help-button').click()]]);
}
function hydrateProductSettings(initial){
  profiles=initial.profiles;savedMeterLibrary=initial.meterLibrary||[];registerTemplates=initial.templates||[];measurementGroups=initial.groups||[];selectedMeasurementGroup=initial.selectedGroup||'';savedFlowBuses=initial.buses||[];selected=workspaceProfiles()[0]?.motorId||'';
  dataError=false;cache.clear();clearPowerReadings();deviceTraffic.clear();message();if(initial.recording)renderRecording(initial.recording);renderGroupOptions();renderProfiles();renderSelected();updateControls();
}
function setupEventFilters(){
  const controls=node('div',null,'event-filters'),level=node('select'),search=node('input');level.id='event-level';level.setAttribute('aria-label','ระดับเหตุการณ์');for(const [value,text]of[['all','ทุกเหตุการณ์'],['error','ผิดพลาด']])level.add(new Option(text,value));search.id='event-search';search.placeholder='ค้นหาอุปกรณ์หรือข้อความ';search.setAttribute('aria-label','ค้นหาเหตุการณ์');level.onchange=search.oninput=renderLogs;controls.append(level,search);$('events-view').querySelector('.table-scroll').before(controls);
  for(const [id,label]of [['event-device','กรองเหตุการณ์ตามอุปกรณ์'],['event-run','กรองเหตุการณ์ตามรอบ']]){const select=node('select');select.id=id;select.setAttribute('aria-label',label);select.onchange=renderLogs;controls.insertBefore(select,search);}
  controls.before(node('p','200 เหตุการณ์ล่าสุดของการเปิดโปรแกรมครั้งนี้ · เหตุการณ์ที่บันทึกไว้เปิดจากหน้ารอบบันทึก','section-description'));
}
function openEventDevice(id){
  const meter=activeWorkspace()?.meters.find(item=>item.id===id||`PM:${item.id}`===id),profile=profiles.find(item=>item.motorId===id);
  if(mode!=='offline'){if(meter)selectMeter(meter.id);else if(workspaceProfiles().some(item=>item.motorId===id))selectMotor(id);else{setTab('fleet');toast('หยุดอ่านก่อนแก้ไขการตั้งค่า');}return;}
  if(meter)return void openDeviceMeter(meter);
  if(profile)return void openEditor(profile);
  setTab('motors');$('registry-search').value=id.replace(/^PM:/,'');renderDeviceRegistry();
}
function setupEditorSections(){
  const pane=document.querySelector('#connection-dialog .dialog-content'),nav=node('nav',null,'editor-sections');nav.setAttribute('aria-label','ส่วนการตั้งค่าอุปกรณ์');
  const fields=[...form.querySelectorAll('fieldset')];
  const reuse=node('button','เลือกอุปกรณ์ที่มีในคลัง');reuse.type='button';reuse.className='editor-reuse';reuse.onclick=()=>closeEditor(()=>setTab('motors'));form.elements.sensorModel.closest('label').after(reuse);
  const expand=node('button','ขยายพื้นที่ Register');expand.type='button';expand.className='expand-registers';expand.onclick=()=>{const wide=$('connection-dialog').classList.toggle('register-wide');expand.textContent=wide?'คืนขนาดฟอร์ม':'ขยายพื้นที่ Register';};$('custom-points-editor').querySelector('legend').append(expand);
  for(const [label,target]of[['ข้อมูลอุปกรณ์',form.elements.motorId],['การเชื่อมต่อ',form.elements.path],['จุดวัด / Register',$('custom-points-settings')||fields.find(field=>field.querySelector('#points-enabled'))||$('preset-note')]]){
    if(!target)continue;const button=node('button',label);button.type='button';button.onclick=()=>{const actual=label==='จุดวัด / Register'?DeviceTemplates.isPower(deviceModel())?$('power-device-settings'):deviceModel()===MODEL?$('preset-note'):fields.find(field=>field.querySelector('#points-enabled')):target;actual?.scrollIntoView({block:'start',behavior:'smooth'});};nav.append(button);
  }
  pane?.prepend(nav);
  const busHint=node('div',null,'editor-bus-hint');busHint.id='editor-bus-hint';form.elements.path.closest('fieldset').append(busHint);
  const sync=()=>{
    const path=form.elements.path.value,bus=flowSavedBuses().find(item=>item.path.toUpperCase()===path.toUpperCase())||workspaceReadiness().devices.find(item=>item.path.toUpperCase()===path.toUpperCase());
    busHint.replaceChildren();
    for(const key of ['baudRate','parity','stopBits']){form.elements[key].closest('label').hidden=Boolean(bus);if(bus)form.elements[key].value=String(bus[key]);}
    if(bus){busHint.append(node('span',`${path} · ${bus.baudRate} baud · 8${bus.parity[0].toUpperCase()}${bus.stopBits}`));const edit=node('button','ตั้งค่าที่บัส…');edit.type='button';edit.onclick=()=>closeEditor(()=>openFlowBus({key:path.toUpperCase(),path,config:bus,items:workspaceReadiness().devices.filter(item=>item.path.toUpperCase()===path.toUpperCase()).map(item=>({item,type:item.id?'meter':'sensor'}))}));busHint.append(edit);}
  };
  syncEditorBus=sync;form.elements.path.addEventListener('change',sync);$('connection-dialog').addEventListener('toggle',event=>{if(event.newState==='open')sync();});
  form.elements.motorId.placeholder='DEV-01';form.elements.name.placeholder='ชื่ออุปกรณ์หรือจุดติดตั้ง';
  const ports=document.querySelector('#connection-dialog .dialog-content > aside');if(ports){const toggle=node('button','พอร์ตที่ตรวจพบ');toggle.type='button';toggle.className='detected-ports-toggle';toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{const expanded=ports.classList.toggle('ports-expanded');toggle.setAttribute('aria-expanded',String(expanded));};ports.prepend(toggle);}
}
