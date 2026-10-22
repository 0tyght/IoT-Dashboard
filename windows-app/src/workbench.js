'use strict';
let workbenchTab = '', workbenchNarrow = false, desktopSidebarCollapsed = false;
const floatingAnchors = new WeakMap();
function syncSidebarDrawer(focusInside = false) {
  const shell = document.querySelector('.shell'), sidebar = $('motor-sidebar');
  const open = innerWidth < 1180 && !shell.classList.contains('sidebar-collapsed');
  shell.classList.toggle('sidebar-drawer-open', open);
  $('toggle-sidebar').setAttribute('aria-expanded', String(!shell.classList.contains('sidebar-collapsed')));
  const backdrop = $('sidebar-backdrop'); if (backdrop) backdrop.hidden = !open;
  for (const element of document.querySelectorAll('main, .commandbar, .recording-strip, .statusbar, .appbar-end')) element.inert = open;
  if (open) { sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); sidebar.setAttribute('aria-labelledby', 'motor-registry-title'); }
  else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); sidebar.removeAttribute('aria-labelledby'); }
  if (open && focusInside) $('motor-search').focus();
  if (!open && shell.classList.contains('sidebar-collapsed') && sidebar.contains(document.activeElement)) $('toggle-sidebar').focus();
}
function closeSidebarDrawer(restoreFocus = false) {
  if (innerWidth >= 1180) return;
  document.querySelector('.shell').classList.add('sidebar-collapsed'); syncSidebarDrawer();
  if (restoreFocus) $('toggle-sidebar').focus();
}
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
  const shell = document.querySelector('.shell'), monitor = currentTab === 'monitor', narrow = innerWidth < 1180;
  if (workbenchTab !== currentTab) closeWorkbenchPopovers();
  shell.classList.toggle('monitor-workspace', monitor);
  if (narrow && !workbenchNarrow) { desktopSidebarCollapsed = shell.classList.contains('sidebar-collapsed'); shell.classList.add('sidebar-collapsed'); }
  else if (!narrow && workbenchNarrow) shell.classList.toggle('sidebar-collapsed', desktopSidebarCollapsed);
  if (narrow && workbenchTab !== currentTab) shell.classList.add('sidebar-collapsed');
  workbenchTab = currentTab; workbenchNarrow = narrow;
  syncSidebarDrawer();
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
  $('motor-sidebar').querySelector('h2').id = 'motor-registry-title';
  const closeSidebar = node('button', null, 'icon-button sidebar-close'); closeSidebar.id = 'close-sidebar'; closeSidebar.type = 'button'; closeSidebar.setAttribute('aria-label', 'ปิดทะเบียนมอเตอร์'); closeSidebar.append(controlIcon('close'));
  $('motor-sidebar').querySelector('.side-heading').append(closeSidebar);
  const backdrop = node('button', null, 'sidebar-backdrop'); backdrop.id = 'sidebar-backdrop'; backdrop.type = 'button'; backdrop.hidden = true; backdrop.tabIndex = -1; backdrop.setAttribute('aria-label', 'ปิดทะเบียนมอเตอร์');
  document.querySelector('.workspace').insertBefore(backdrop, document.querySelector('main'));
  backdrop.onclick = () => closeSidebarDrawer(true); closeSidebar.onclick = () => closeSidebarDrawer(true);
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
    if (document.querySelector('.shell').classList.contains('sidebar-drawer-open')) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSidebarDrawer(true); return; }
      if (event.key === 'Tab') {
        const items = [...$('motor-sidebar').querySelectorAll('button, input, select, summary, [tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
        const first = items[0], last = items.at(-1), active = document.activeElement;
        if (items.length && (!items.includes(active) || event.shiftKey && active === first || !event.shiftKey && active === last)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      }
    }
    if (event.key === 'Escape' && closeWorkbenchPopovers(true)) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  document.addEventListener('fullscreenchange', () => closeWorkbenchPopovers());
  $('toggle-sidebar').addEventListener('click', () => { closeWorkbenchPopovers(); syncSidebarDrawer(true); });
  document.querySelector('.motor-list').addEventListener('click', () => {
    if (innerWidth < 1180) { closeSidebarDrawer(); document.querySelector(`[data-tab="${currentTab}"]`)?.focus(); }
  });
  updateWorkbenchLayout();
}
