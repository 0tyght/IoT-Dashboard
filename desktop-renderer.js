/* Desktop-only serial commissioning. Browser/GitHub Pages keeps simulation mode unchanged. */
(() => {
  const api = window.vectraDesktop;
  if (!api) return;

  document.body.classList.add('desktop-mode');
  $('storage-banner').textContent = 'รายการมอเตอร์เก็บในโปรแกรมเครื่องนี้ · ค่าจริงบันทึกเป็นไฟล์รายวันเมื่อเชื่อมต่อเซ็นเซอร์';
  const dialog = $('sensor-setup');
  const form = $('sensor-form');
  const portList = $('port-list');
  const stateEl = $('sensor-state');
  const resultEl = $('test-result');
  const enterButton = $('enter-dashboard');
  const disconnectButton = $('disconnect-sensor');
  const settingsButton = $('sensor-settings');
  const runtimeSource = $('runtime-source');
  const motorSelect = $('sensor-motor');
  let testedSignature = '';
  let connected = false;
  let canClose = false;
  let lastStatus = '';

  const field = name => form.elements.namedItem(name);
  const signature = config => JSON.stringify(config);

  function setStep(step) {
    const order = ['port', 'protocol', 'verified'];
    document.querySelectorAll('.setup-progress li').forEach(item => {
      const index = order.indexOf(item.dataset.step);
      item.classList.toggle('done', index < order.indexOf(step));
      item.classList.toggle('active', item.dataset.step === step);
    });
  }

  function setState(kind, text) {
    stateEl.className = `sensor-state ${kind}`;
    stateEl.innerHTML = '<i></i>';
    stateEl.append(document.createTextNode(text));
  }

  function showResult(kind, title, detail) {
    resultEl.className = `test-result ${kind || ''}`.trim();
    resultEl.replaceChildren();
    const main = document.createElement(kind === 'success' ? 'strong' : 'span');
    const small = document.createElement('small');
    main.textContent = title;
    small.textContent = detail;
    resultEl.append(main, small);
  }

  function fillMotors(selectedId = '') {
    motorSelect.replaceChildren();
    motors.forEach(motor => {
      const option = document.createElement('option');
      option.value = motor.id;
      option.textContent = `${motor.id} — ${motor.label}`;
      option.selected = motor.id === selectedId;
      motorSelect.append(option);
    });
    if (!motors.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'ยังไม่มีมอเตอร์ — เพิ่มในโหมดจำลองก่อน';
      motorSelect.append(option);
    }
  }

  function applyConfig(config) {
    if (!config) return;
    for (const [name, value] of Object.entries(config)) {
      const control = field(name);
      if (control && name !== 'path') control.value = String(value);
    }
    fillMotors(config.motorId);
  }

  function selectedPath() {
    return form.querySelector('input[name="path"]:checked')?.value || '';
  }

  function getConfig() {
    const data = new FormData(form);
    return {
      path: selectedPath(),
      motorId: String(data.get('motorId') || ''),
      baudRate: Number(data.get('baudRate')),
      parity: String(data.get('parity')),
      stopBits: Number(data.get('stopBits')),
      slaveId: Number(data.get('slaveId')),
      registerType: String(data.get('registerType')),
      registerAddress: Number(data.get('registerAddress')),
      dataType: String(data.get('dataType')),
      byteOrder: String(data.get('byteOrder')),
      scale: Number(data.get('scale')),
      pollInterval: Number(data.get('pollInterval')),
      unit: String(data.get('unit') || 'mm/s RMS'),
      timeout: 1500,
      autoConnect: true
    };
  }

  function resetVerification() {
    testedSignature = '';
    enterButton.disabled = true;
    setStep(selectedPath() ? 'protocol' : 'port');
    setState('idle', 'ยังไม่ได้ทดสอบ');
    showResult('', 'ยังไม่มีผลทดสอบ', 'ตรวจสาย A/B, ไฟเลี้ยง และค่าจากคู่มือเซ็นเซอร์ก่อนทดสอบ');
  }

  function renderPorts(ports, preferred = '') {
    portList.replaceChildren();
    if (!ports.length) {
      const empty = document.createElement('div');
      empty.className = 'port-empty';
      empty.textContent = 'ไม่พบ COM Port — ตรวจสาย USB และ Driver ของอะแดปเตอร์';
      portList.append(empty);
      resetVerification();
      return;
    }
    const usbScore = port => port.vendorId ? 2 : port.serialNumber ? 1 : 0;
    const ordered = [...ports].sort((a, b) => usbScore(b) - usbScore(a) || a.path.localeCompare(b.path, undefined, { numeric: true }));
    const automatic = preferred || ordered.find(port => port.vendorId)?.path || ordered[0].path;
    ordered.forEach(port => {
      const label = document.createElement('label');
      label.className = 'port-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'path';
      input.value = port.path;
      input.required = true;
      input.checked = port.path === automatic;
      const icon = document.createElement('span');
      icon.className = 'port-option-icon';
      icon.textContent = 'USB';
      const copy = document.createElement('span');
      const strong = document.createElement('strong');
      const small = document.createElement('small');
      strong.textContent = port.path;
      small.textContent = port.manufacturer || 'Serial / RS485 device';
      copy.append(strong, small);
      const identity = document.createElement('em');
      identity.textContent = port.vendorId && port.productId ? `${port.vendorId}:${port.productId}` : 'COM';
      label.append(input, icon, copy, identity);
      label.classList.toggle('selected', input.checked);
      input.addEventListener('change', () => {
        portList.querySelectorAll('.port-option').forEach(item => item.classList.toggle('selected', item.contains(input) && input.checked));
        resetVerification();
      });
      portList.append(label);
    });
    setStep('protocol');
  }

  async function scanPorts(preferred = selectedPath()) {
    $('scan-ports').disabled = true;
    portList.setAttribute('aria-busy', 'true');
    try {
      const ports = await api.listPorts();
      renderPorts(ports, preferred);
      return ports;
    } catch (error) {
      renderPorts([], '');
      showResult('error', 'สแกนอุปกรณ์ไม่ได้', error.message || String(error));
      return [];
    } finally {
      $('scan-ports').disabled = false;
      portList.removeAttribute('aria-busy');
    }
  }

  async function testSensor({ quiet = false } = {}) {
    if (!form.reportValidity() || !selectedPath()) {
      setStep('port');
      showResult('error', 'ยังไม่ได้เลือก COM Port', 'เลือกอะแดปเตอร์ที่ต่อกับสาย RS485 ก่อน');
      return null;
    }
    const config = getConfig();
    $('test-sensor').disabled = true;
    enterButton.disabled = true;
    setState('testing', 'กำลังอ่าน Register…');
    if (!quiet) showResult('', 'กำลังติดต่อเซ็นเซอร์', `${config.path} · Slave ${config.slaveId} · Register ${config.registerAddress}`);
    const result = await api.testConnection(config);
    $('test-sensor').disabled = false;
    if (!result.ok) {
      testedSignature = '';
      setStep('protocol');
      setState('error', 'เซ็นเซอร์ไม่ตอบกลับ');
      showResult('error', 'ทดสอบไม่ผ่าน', `${result.message || 'ไม่สามารถอ่านค่าได้'} · ตรวจไฟเลี้ยง สาย A/B, Slave ID, Baud และ Register`);
      return null;
    }
    testedSignature = signature(config);
    setStep('verified');
    setState('success', 'พบเซ็นเซอร์แล้ว');
    showResult('success', `${Number(result.value).toFixed(3)} ${config.unit}`, `Raw register: ${result.registers.join(', ')} · การตอบกลับถูกต้อง`);
    enterButton.disabled = false;
    return config;
  }

  function updateRuntime(state, detail = '') {
    settingsButton.classList.toggle('connected', state === 'connected');
    settingsButton.classList.toggle('error', state === 'error');
    document.body.classList.toggle('sensor-live', state === 'connected');
    document.body.classList.toggle('sensor-fault', state === 'error');
    if (state === 'connected') {
      runtimeSource.innerHTML = '<i></i> RS485 LIVE';
      runtimeSource.title = detail;
      $('detail-source').innerHTML = '<i></i> RS485 / Modbus';
      $('received-label').firstChild.textContent = 'Last received';
    } else if (state === 'error') {
      runtimeSource.innerHTML = '<i></i> SENSOR FAULT';
      runtimeSource.title = detail;
    } else {
      runtimeSource.innerHTML = '<i></i> SIMULATION';
      runtimeSource.title = '';
      $('detail-source').innerHTML = '<i></i> Simulated';
      $('received-label').firstChild.textContent = 'Last simulated';
    }
  }

  async function connectSensor(config) {
    setState('testing', 'กำลังเริ่มเก็บข้อมูล…');
    enterButton.disabled = true;
    const result = await api.connect(config);
    if (!result.ok) {
      setState('error', 'เชื่อมต่อไม่สำเร็จ');
      showResult('error', 'เปิดพอร์ตไม่ได้', result.message || 'โปรแกรมอื่นอาจกำลังใช้ COM Port นี้');
      enterButton.disabled = false;
      return false;
    }
    connected = true;
    canClose = true;
    paused = true;
    disconnectButton.hidden = false;
    updateRuntime('connected', `${config.path} · Slave ${config.slaveId}`);
    settingsButton.title = `${config.path} · Slave ${config.slaveId} · ${config.motorId}`;
    dialog.close();
    announce(`เชื่อมต่อ ${config.path} และเริ่มบันทึกข้อมูลแล้ว`);
    return true;
  }

  form.addEventListener('input', event => {
    if (event.target.name !== 'path' && testedSignature && signature(getConfig()) !== testedSignature) resetVerification();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const config = getConfig();
    if (signature(config) !== testedSignature) {
      showResult('error', 'ค่าถูกเปลี่ยนหลังการทดสอบ', 'กดทดสอบเซ็นเซอร์อีกครั้งก่อนเชื่อมต่อ');
      resetVerification();
      return;
    }
    await connectSensor(config);
  });
  dialog.addEventListener('cancel', event => {
    if (!canClose) event.preventDefault();
  });
  $('scan-ports').addEventListener('click', () => scanPorts());
  $('test-sensor').addEventListener('click', () => testSensor());
  $('demo-mode').addEventListener('click', async () => {
    if (connected) await api.disconnect();
    connected = false;
    canClose = true;
    paused = false;
    motors.forEach(motor => { motor.liveSource = ''; });
    disconnectButton.hidden = true;
    updateRuntime('simulation');
    dialog.close();
    tick();
    announce('เปิดโหมดจำลองแล้ว — ยังไม่ได้ใช้ค่าจากเซ็นเซอร์');
  });
  disconnectButton.addEventListener('click', async () => {
    await api.disconnect();
    connected = false;
    paused = true;
    disconnectButton.hidden = true;
    updateRuntime('error', 'ตัดการเชื่อมต่อแล้ว');
    setState('error', 'ตัดการเชื่อมต่อแล้ว');
    enterButton.disabled = true;
    testedSignature = '';
  });
  settingsButton.hidden = false;
  settingsButton.addEventListener('click', async () => {
    fillMotors(field('motorId')?.value || '');
    canClose = connected;
    if (!dialog.open) dialog.showModal();
    await scanPorts(selectedPath());
    disconnectButton.hidden = !connected;
  });

  api.onReading(reading => {
    const index = motors.findIndex(motor => motor.id === reading.motorId);
    if (index < 0 || !Number.isFinite(Number(reading.value))) return;
    const motor = motors[index];
    motor.value = Number(reading.value);
    motor.history.push(motor.value);
    motor.history = motor.history.slice(-30);
    motor.received = Date.parse(reading.timestamp) || Date.now();
    motor.liveSource = reading.source;
    paused = true;
    selected = index;
    render();
    updateRuntime('connected', `${reading.port} · Slave ${reading.slaveId}`);
  });

  api.onStatus(status => {
    if (status.state === 'connected') {
      lastStatus = 'connected';
      updateRuntime('connected', `${status.path} · ${status.motorId}`);
      return;
    }
    if (['read-error', 'storage-error'].includes(status.state)) {
      updateRuntime('error', status.message || status.state);
      if (lastStatus !== `${status.state}:${status.message}`) {
        announce(status.state === 'storage-error' ? `บันทึกข้อมูลไม่ได้: ${status.message}` : `อ่านเซ็นเซอร์ไม่ได้: ${status.message}`);
        lastStatus = `${status.state}:${status.message}`;
      }
    }
  });

  (async () => {
    const saved = await api.loadConfig();
    fillMotors(saved?.motorId || '');
    applyConfig(saved);
    const dataPath = await api.getDataPath();
    $('data-location').textContent = `บันทึกอัตโนมัติ: ${dataPath}`;
    const ports = await scanPorts(saved?.path || '');
    dialog.showModal();
    if (saved?.autoConnect && ports.some(port => port.path === saved.path)) {
      const config = await testSensor({ quiet: true });
      if (config) await connectSensor(config);
    }
  })().catch(error => {
    if (!dialog.open) dialog.showModal();
    setState('error', 'เริ่มระบบไม่สำเร็จ');
    showResult('error', 'เกิดข้อผิดพลาด', error.message || String(error));
  });
})();
