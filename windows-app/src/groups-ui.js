'use strict';
let measurementGroups=[], selectedMeasurementGroup='', editGroupId='';
const selectedGroupId=()=>selectedMeasurementGroup;
const activeWorkspace=()=>measurementGroups.find(group=>group.id===selectedGroupId());
function workspaceProfiles() {
  const ids = new Set(activeWorkspace()?.motorIds.map(id=>id.toUpperCase()) || []);
  return profiles.filter(profile=>ids.has(profile.motorId.toUpperCase()));
}
function workspaceReadiness() {
  const group=activeWorkspace();
  if (!group) return {message:'ยังไม่ได้เลือกพื้นที่งาน', devices:[]};
  const sensors=workspaceProfiles();
  if (sensors.length!==group.motorIds.length) return {message:'มีอุปกรณ์ที่หาไม่พบในทะเบียน · ตรวจสมาชิกพื้นที่งาน', devices:[]};
  const devices=[...sensors.filter(profile=>profile.enabled!==false),...group.meters.filter(item=>item.enabled!==false)];
  if (!devices.length) return {message:'เพิ่มหรือเปิดอ่านอุปกรณ์ในพื้นที่งานก่อน', devices};
  if (devices.some(item=>String(item.path).toUpperCase().startsWith('UNBOUND:'))) return {message:'เชื่อมอุปกรณ์ที่ยังไม่มีบัสก่อนเริ่มอ่าน', devices};
  return {message:'', devices};
}
function showWorkspacePicker() { document.getElementById('groups-quick').click(); }
function createWorkspace() { showWorkspacePicker(); document.getElementById('groups-new').click(); }
function updateGroupsControls(locked) { for(const id of ['groups-quick','flow-workspace-action']){const trigger=document.getElementById(id);if(trigger)trigger.disabled=locked;} document.querySelectorAll('#sidebar-groups button').forEach(button=>{button.disabled=locked;}); if(locked)document.getElementById('group-context-menu')?.hidePopover(); }
function renderGroupOptions() {
  const select=document.getElementById('groups-select');if(!select)return;
  const group=activeWorkspace();
  select.replaceChildren(new Option('ยังไม่ได้เลือกพื้นที่งาน',''),...measurementGroups.map(item=>new Option(`${item.name} · ${item.motorIds.length+item.meters.length} อุปกรณ์`,item.id)));
  selectedMeasurementGroup=group?.id||''; select.value=selectedMeasurementGroup;
  document.getElementById('groups-edit').disabled=!group;
  document.getElementById('groups-delete').disabled=!group;
  const members=document.getElementById('groups-members');
  members.textContent=group?`${group.motorIds.length+group.meters.length} อุปกรณ์ในพื้นที่งาน`:'เลือกพื้นที่งานที่จะใช้ หรือสร้างพื้นที่งานใหม่';
  if (typeof refreshPowerDiagnostic === 'function') refreshPowerDiagnostic();
  renderGroupSidebar();
  const quick=document.getElementById('groups-quick');if(quick){quick.textContent=group?group.name:'เลือกพื้นที่งาน';quick.title=group?`พื้นที่งาน ${group.name}`:'เลือกพื้นที่งาน';quick.setAttribute('aria-label',quick.title);}
}
let returnToFlowAfterMeter=false;
let openFlowMeterEditor = () => {};
let openFlowNewMeter = (model = 'pm2230') => {};
function setupGroupsUI() {
  api.onPower(reading=>{if(mode==='live'&&(!reading.runId||!recordingState.runId||reading.runId===recordingState.runId))renderPowerReading(reading);});
  const quick=node('button','เลือกพื้นที่งาน');quick.id='groups-quick';quick.type='button';document.getElementById('session-actions').before(quick);
  const dialog=node('dialog');dialog.id='groups-dialog';dialog.setAttribute('aria-labelledby','groups-title');
  dialog.innerHTML=`<div class="dialog-header"><div><h2 id="groups-title">พื้นที่งาน</h2><p>พื้นที่งานคือชุดอุปกรณ์ที่จะอ่านและบันทึกในรอบเดียวกัน</p></div><button type="button" id="groups-close" aria-label="ปิดพื้นที่งาน">ปิด</button></div><div class="groups-body"><label>พื้นที่งานที่เลือก<select id="groups-select"></select></label><p id="groups-members" class="footnote"></p><div class="groups-actions"><button type="button" id="groups-new">สร้างพื้นที่งาน</button><button type="button" id="groups-edit">ตั้งค่าพื้นที่งาน</button><button type="button" id="groups-delete">ลบพื้นที่งาน…</button></div><div id="groups-editor" hidden><label>ชื่อพื้นที่งาน<input id="groups-name" maxlength="80" placeholder="เช่น ชุดทดสอบมอเตอร์ 1"></label><section id="workspace-members"><h3>อุปกรณ์ในพื้นที่งาน</h3><p class="footnote">เลือกอุปกรณ์ที่ต้องการใช้ · แก้ Register ที่โหนดอุปกรณ์</p><div id="groups-motors" class="groups-motors"></div></section><div id="groups-error" class="message error" role="alert" hidden></div><div class="groups-actions"><button type="button" id="groups-save" class="primary">บันทึกพื้นที่งาน</button><button type="button" id="groups-cancel">ยกเลิก</button></div></div></div>`;
  document.body.append(dialog);const $g=id=>document.getElementById(id);
  const groupList=node('div',null,'sidebar-groups');groupList.id='sidebar-groups';document.querySelector('.sidebar .side-heading').after(groupList);
  const sensorLabel=node('p','อุปกรณ์ในพื้นที่งาน','sidebar-device-label');document.querySelector('.sidebar .search').before(sensorLabel);renderGroupSidebar();
  quick.onclick=()=>{returnToFlowAfterMeter=false;document.getElementById('session-actions').open=false;dialog.classList.remove('meter-focus','workspace-create');$g('groups-title').textContent='พื้นที่งาน';dialog.querySelector('.dialog-header p').textContent='พื้นที่งานคือชุดอุปกรณ์ที่จะอ่านและบันทึกในรอบเดียวกัน';$g('groups-save').textContent='บันทึกพื้นที่งาน';renderGroupOptions();$g('groups-editor').hidden=true;dialog.showModal();};
  $g('groups-close').onclick=()=>dialog.close();
  $g('groups-select').onchange=async()=>{if(await chooseMeasurementGroup($g('groups-select').value)){dialog.close();setTab('fleet');}};
  let membershipMeters=[];
  const modelOption=node('label',null,'workspace-model-option'),modelCheck=node('input');modelCheck.type='checkbox';modelCheck.id='groups-model-enabled';modelOption.append(modelCheck,document.createTextNode('เปิดมุมมองโมเดลชุดเครื่อง 3D อ้างอิง'));$g('groups-name').closest('label').after(modelOption);
  const openEditor=group=>{
    dialog.classList.toggle('workspace-create',!group);
    $g('groups-title').textContent=group?'ตั้งค่าพื้นที่งาน':'สร้างพื้นที่งาน';
    dialog.querySelector('.dialog-header p').textContent=group?'เลือกอุปกรณ์สำหรับรอบอ่านนี้':'ตั้งชื่อชุดอุปกรณ์ที่ต้องการใช้ในรอบเดียวกัน';
    editGroupId=group?.id||'';$g('groups-model-enabled').checked=group?.modelEnabled===true;$g('groups-name').value=group?.name||'';$g('groups-editor').hidden=false;$g('groups-error').hidden=true;
    const list=$g('groups-motors');list.replaceChildren();
    profiles.forEach(profile=>{const label=node('label'),input=node('input');input.type='checkbox';input.dataset.memberKind='sensor';input.value=profile.motorId;input.checked=group?.motorIds.some(id=>id.toUpperCase()===profile.motorId.toUpperCase())||false;label.append(input,node('span',`${profile.name||profile.motorId} · ${portLabel(profile.path)} · ID ${profile.slaveId}`));list.append(label);});
    membershipMeters=[...(group?.meters||[])];
    for(const other of measurementGroups)for(const meter of other.meters)if(!membershipMeters.some(item=>item.id.toUpperCase()===meter.id.toUpperCase()))membershipMeters.push({...meter,motorId:''});
    $g('workspace-members').hidden=!group&&!profiles.length&&!membershipMeters.length;
    if(!profiles.length&&!membershipMeters.length)list.append(node('p','ยังไม่มีอุปกรณ์ เพิ่มได้จากหน้าแผนผังหลังบันทึก','footnote'));
    for(const meter of membershipMeters){const label=node('label'),input=node('input');input.type='checkbox';input.dataset.memberKind='meter';input.value=meter.id;input.checked=Boolean(group?.meters.some(item=>item.id===meter.id));label.append(input,node('span',`${meter.name||meter.id} · ${portLabel(meter.path)} · ID ${meter.slaveId}`));list.append(label);}
    for(const entry of savedMeterLibrary)if(!membershipMeters.some(item=>item.id.toUpperCase()===entry.meter.id.toUpperCase())){const meter={...entry.meter,motorId:''};membershipMeters.push(meter);const label=node('label'),input=node('input');input.type='checkbox';input.dataset.memberKind='meter';input.value=meter.id;label.append(input,node('span',`${meter.name||meter.id} · ${portLabel(meter.path)} · ID ${meter.slaveId}`));list.append(label);}
    $g('groups-name').focus();
  };
  $g('groups-new').onclick=()=>openEditor(null);
  $g('groups-edit').onclick=()=>{const group=measurementGroups.find(item=>item.id===selectedMeasurementGroup);if(group)openEditor(group);else toast('เลือกพื้นที่งานที่ต้องการแก้ไข');};
  const deleteGroup = group => {
    if (!group || busy || mode !== 'offline') return;
    if (dialog.open) dialog.close();
    const detail = 'การตั้งค่าอุปกรณ์ในพื้นที่งานนี้จะถูกนำออก · ข้อมูลที่บันทึกและแม่แบบยังอยู่';
    confirmAction(`ลบพื้นที่งาน ${group.name}?`, detail, async () => {
      measurementGroups = check(await api.saveGroups(measurementGroups.filter(item => item.id !== group.id))).groups;
      if (selectedMeasurementGroup === group.id) {
        selectedMeasurementGroup = '';
        try { check(await api.selectGroup('')); }
        catch (error) { toast(`ลบพื้นที่งานแล้ว แต่บันทึกตัวเลือกไม่ได้: ${error.message}`); }
      }
      if (!activeWorkspace()) selected='';
      clearPowerReadings(); renderGroupOptions(); renderProfiles(); renderSelected(); updateControls();
    });
  };
  $g('groups-delete').onclick = () => {
    const group = measurementGroups.find(item => item.id === selectedMeasurementGroup);
    if (group) deleteGroup(group); else toast('เลือกพื้นที่งานที่ต้องการลบ');
  };
  setupGroupContextMenu((group, action) => {
    if (innerWidth < 1180) closeSidebarDrawer();
    if (action === 'delete') return deleteGroup(group);
    quick.onclick();
    openEditor(group);
  });
  $g('groups-cancel').onclick=()=>{if(dialog.classList.contains('meter-focus')||dialog.classList.contains('workspace-create'))dialog.close();else {$g('groups-editor').hidden=true;$g('groups-title').textContent='พื้นที่งาน';dialog.querySelector('.dialog-header p').textContent='พื้นที่งานคือชุดอุปกรณ์ที่จะอ่านและบันทึกในรอบเดียวกัน';}};
  $g('groups-save').onclick=async()=>{
    $g('groups-error').hidden=true;
    try{
      const name=$g('groups-name').value.trim();if(!name)throw new Error('ระบุชื่อพื้นที่งาน');
      const motorIds=[...$g('groups-motors').querySelectorAll('input[data-member-kind="sensor"]:checked')].map(input=>input.value);
      const selectedMeterIds=new Set([...$g('groups-motors').querySelectorAll('input[data-member-kind="meter"]:checked')].map(input=>input.value));
      const meters=membershipMeters.filter(meter=>selectedMeterIds.has(meter.id)).map(meter=>!meter.motorId||motorIds.includes(meter.motorId)?meter:{...meter,motorId:''});
      const id=editGroupId||`G${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
      const edited={id,name,motorIds,meters,...($g('groups-model-enabled').checked?{modelEnabled:true}:{})};
      const proposed=editGroupId?measurementGroups.map(group=>group.id===id?edited:group):[...measurementGroups,edited];
      measurementGroups=check(await api.saveGroups(proposed)).groups;selectedMeasurementGroup=id;let selectionWarning='';try{check(await api.selectGroup(id));}catch(error){selectionWarning=`บันทึกพื้นที่งานแล้ว แต่จำตัวเลือกไม่ได้: ${error.message}`;}selected=profiles.find(profile=>motorIds.includes(profile.motorId))?.motorId||'';renderGroupOptions();renderProfiles();renderSelected();$g('groups-editor').hidden=true;updateControls();const showFlow=returnToFlowAfterMeter||!editGroupId;returnToFlowAfterMeter=false;if(showFlow||dialog.classList.contains('meter-focus'))dialog.close();else {$g('groups-title').textContent='พื้นที่งาน';dialog.querySelector('.dialog-header p').textContent='พื้นที่งานคือชุดอุปกรณ์ที่จะอ่านและบันทึกในรอบเดียวกัน';}if(showFlow)setTab('fleet');toast(selectionWarning||'บันทึกแล้ว');
    }catch(error){$g('groups-error').textContent=error.message;$g('groups-error').hidden=false;$g('groups-error').scrollIntoView({block:'nearest',behavior:'instant'});}
  };
  renderGroupOptions();
}

async function chooseMeasurementGroup(next){
  if (busy || mode!=='offline') return;
  setBusy(true);
  let changed=false;
  try {
    check(await api.selectGroup(next));
    changed=true;
    selectedMeasurementGroup=next;
    selected=workspaceProfiles()[0]?.motorId||'';
    clearPowerReadings();
    message();
  } catch(error) { toast(`เลือกพื้นที่งานไม่ได้: ${error.message}`); }
  finally { setBusy(false); }
  renderGroupOptions();renderProfiles();renderSelected();updateControls();
  if (changed && selected) void restoreSavedMotorHistory(selected);
  return changed;
}
function renderGroupSidebar(){
 const list=document.getElementById('sidebar-groups');if(!list)return;
 document.getElementById('group-context-menu')?.hidePopover();list.replaceChildren();
 for(const group of measurementGroups){const button=node('button',null,'sidebar-group');button.type='button';button.setAttribute('aria-pressed',String(group.id===selectedMeasurementGroup));button.append(node('span',group.name),node('small',String(group.motorIds.length+group.meters.length)));button.onclick=()=>{void chooseMeasurementGroup(group.id).then(changed=>{if(changed)setTab('fleet');});};
   const row=node('div',null,'sidebar-group-row'), options=node('button','⋯','sidebar-group-options');
   options.type='button'; options.setAttribute('aria-label',`จัดการพื้นที่งาน ${group.name}`);
   options.setAttribute('aria-controls','group-context-menu'); options.setAttribute('aria-expanded','false');
   options.dataset.groupOptions=group.id;
   button.addEventListener('contextmenu', event=>openGroupContextMenu(event, group.id, options));
   options.addEventListener('contextmenu', event=>openGroupContextMenu(event, group.id, options));
   options.onclick=event=>openGroupContextMenu(event, group.id, options);
   row.append(button,options);list.append(row);}
 const add=node('button','＋ สร้างพื้นที่งาน','sidebar-group-add');add.type='button';add.onclick=()=>{if(innerWidth<1180)closeSidebarDrawer();createWorkspace();};list.append(add);const count=document.getElementById('motor-count');if(count)count.textContent=measurementGroups.length;
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
