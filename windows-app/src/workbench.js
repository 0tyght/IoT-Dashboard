'use strict';
let workbenchTab = '', workbenchNarrow = false;
const floatingAnchors = new WeakMap();
function positionFloatingPanel(panel, anchor) {
  const bounds = anchor.getBoundingClientRect(), width = Math.min(440, innerWidth - 32), height = Math.min(440, innerHeight - 40);
  panel.style.width = `${width}px`; panel.style.maxHeight = `${height}px`;
  panel.style.left = `${Math.max(16, Math.min(innerWidth - width - 16, bounds.right + 10))}px`;
  panel.style.top = `${Math.max(16, Math.min(innerHeight - height - 20, bounds.top))}px`;
  floatingAnchors.set(panel, anchor);
}
function openFloatingPanel(panel, anchor) {
  if (!panel.isConnected) return;
  positionFloatingPanel(panel, anchor);
  if (!panel.matches(':popover-open')) panel.showPopover();
}
function closeFloatingPanel(panel) { if (panel.matches(':popover-open')) panel.hidePopover(); }
function closeWorkbenchPopovers(restoreFocus = false) {
  const open = [...document.querySelectorAll('.plot-inspector[open], #machine-data[open]')];
  for (const details of open) {
    details.open = false; details.dataset.pinned = 'false';
    const panel = details.querySelector('[popover]'); if (panel) closeFloatingPanel(panel);
  }
  if (restoreFocus) open.at(-1)?.querySelector('summary')?.focus();
  return open.length > 0;
}
function updateWorkbenchLayout() {
  const shell = document.querySelector('.shell'), monitor = currentTab === 'monitor', narrow = monitor && innerWidth < 1180;
  if (workbenchTab !== currentTab) closeWorkbenchPopovers();
  shell.classList.toggle('monitor-workspace', monitor);
  if (narrow && (workbenchTab !== 'monitor' || !workbenchNarrow)) shell.classList.add('sidebar-collapsed');
  else if (!narrow && workbenchNarrow) shell.classList.remove('sidebar-collapsed');
  workbenchTab = currentTab; workbenchNarrow = narrow;
  $('toggle-sidebar').setAttribute('aria-expanded', String(!shell.classList.contains('sidebar-collapsed')));
  document.querySelectorAll('#graph-shortcuts button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.window === $('fleet-window').value)));
  $('toggle-context').hidden = !monitor;
}
function updateWorkbenchValues(reading, threeAxis) {
  const box = $('compact-frequency'); box.closest('section').hidden = !threeAxis;
  if (threeAxis && !box.children.length) for (const axis of ['X', 'Y', 'Z']) {
    const item = node('div', null, `axis-${axis.toLowerCase()}`); item.append(node('span', axis), node('strong', 'รอข้อมูล')); box.append(item);
  }
  [...box.children].forEach((item, index) => {
    const axis = ['X', 'Y', 'Z'][index], value = item.querySelector('strong'); value.textContent = frequencyDisplay(reading, axis);
    value.classList.toggle('frequency-unavailable', !Number.isFinite(reading?.channels?.[`frequency${axis}`]));
    item.title = `${MeasurementConversion.text(MeasurementConversion.describe(reading, 'frequency')[index])}\n${frequencySummary(reading)}`;
  });
  $('frequency-note').title = frequencySummary(reading);
  for (const id of ['connection-name', 'connection-detail', 'last-response', 'record-state', 'selected-title', 'selected-subtitle']) $(id).title = $(id).textContent;
}
function setupWorkbench() {
  const shortcuts = node('div', null, 'graph-shortcuts'); shortcuts.id = 'graph-shortcuts'; shortcuts.setAttribute('aria-label', 'ช่วงเวลาที่ใช้บ่อย');
  for (const [value, label] of [['60s', '1 นาที'], ['300s', '5 นาที'], ['1800s', '30 นาที']]) {
    const button = node('button', label); button.dataset.window = value; button.setAttribute('aria-pressed', 'false');
    button.onclick = () => { $('fleet-window').value = value; $('fleet-window').dispatchEvent(new Event('change')); updateWorkbenchLayout(); };
    shortcuts.append(button);
  }
  const toggle = node('button'); toggle.id = 'toggle-context'; toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-controls', 'motor-context'); controlLabel(toggle, 'ข้อมูลเครื่อง', 'panel');
  toggle.onclick = () => { closeWorkbenchPopovers(); const collapsed = document.querySelector('.shell').classList.toggle('context-collapsed'); toggle.setAttribute('aria-expanded', String(!collapsed)); };
  document.querySelector('.motor-context').id = 'motor-context';
  $('graph-tools').append(shortcuts, toggle);
  controlLabel($('expand-charts'), 'ขยายกราฟ', 'expand'); controlLabel($('expand-model'), 'ขยาย', 'expand');
  $('fleet-window').addEventListener('change', updateWorkbenchLayout);
  window.addEventListener('resize', () => {
    updateWorkbenchLayout();
    for (const panel of document.querySelectorAll('[popover]:popover-open')) { const anchor = floatingAnchors.get(panel); if (anchor) positionFloatingPanel(panel, anchor); }
  });
  const data = $('machine-data'), dataPanel = data.querySelector('.channels-panel'), summary = data.querySelector('summary');
  dataPanel.setAttribute('popover', 'manual');
  data.addEventListener('toggle', () => data.open ? openFloatingPanel(dataPanel, summary) : closeFloatingPanel(dataPanel));
  document.addEventListener('pointerdown', event => {
    if (data.open && !data.contains(event.target)) { data.open = false; closeFloatingPanel(dataPanel); }
    for (const details of document.querySelectorAll('.plot-inspector[open]')) if (!details.contains(event.target)) {
      details.open = false; details.dataset.pinned = 'false'; closeFloatingPanel(details.querySelector('[popover]'));
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && closeWorkbenchPopovers(true)) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  document.addEventListener('fullscreenchange', () => closeWorkbenchPopovers());
  $('toggle-sidebar').addEventListener('click', () => closeWorkbenchPopovers());
  document.querySelector('.motor-list').addEventListener('click', () => {
    if (currentTab === 'monitor' && innerWidth < 1180) { document.querySelector('.shell').classList.add('sidebar-collapsed'); $('toggle-sidebar').setAttribute('aria-expanded', 'false'); }
  });
  updateWorkbenchLayout();
}
