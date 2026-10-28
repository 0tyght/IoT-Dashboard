'use strict';

function setupSpectralUI({host:providedHost,prefix='spectral',mode='waveform'} = {}) {
  const $ = id => document.getElementById(id.startsWith('spectral-') ? prefix + id.slice(8) : id);
  const host = providedHost || $('analysis-view'), isTrend = mode === 'trend';
  host.innerHTML = `
    <div class="spectral-heading"><div><h2>วิเคราะห์ความถี่</h2><p>Waveform · FFT · Surface 3D</p></div><span id="spectral-source" class="spectral-source">ยังไม่มีข้อมูลคลื่น</span></div>
    <p class="spectral-capability">SN-3001-WZ3A-N01 ส่งค่ารวมและค่า Hz ตาม Register ที่มีอยู่ ยังไม่พบช่องส่งคลื่นดิบ จึงยังทำ FFT สดจากเซ็นเซอร์นี้ไม่ได้</p>
    <div class="spectral-toolbar">
      <button id="spectral-import" class="primary">เปิด Waveform CSV</button>
      <label>Sample rate · Hz<input id="spectral-fs" type="number" min="0.001" step="any" placeholder="อัตโนมัติจากเวลา" title="เว้นว่างเมื่อมี time_s / time_ms · ต้องระบุเมื่อใช้ index / sample"></label>
      <label>หน่วยของคลื่น<select id="spectral-unit"><option value="a.u.">a.u. · ไม่ระบุ</option><option>m/s²</option><option>g</option><option>mm/s</option><option>µm</option><option>V</option></select></label>
      <button id="spectral-demo">สัญญาณทดสอบ</button><button id="spectral-clear" disabled>ล้างข้อมูล</button>
      <span id="spectral-file" class="spectral-file"></span>
    </div>
    <p id="spectral-status" class="spectral-status" role="status" aria-live="polite">เปิด CSV ของคลื่นดิบเพื่อเริ่มวิเคราะห์</p>
    <div id="spectral-empty" class="spectral-empty"><h3>ต้องใช้ชุดตัวอย่างคลื่นตามเวลา</h3><p>ใช้หัวคอลัมน์ <code>time_s,x,y,z</code> หรือ <code>index,value</code> พร้อม Sample rate ข้อมูลต้องห่างกันเท่ากัน และมีอย่างน้อย 64 samples</p><p>CSV ประวัติค่า overall ของโปรแกรมนี้ไม่ใช่คลื่นดิบ จึงนำมาวิเคราะห์ FFT การสั่นไม่ได้ ปุ่มสัญญาณทดสอบใช้ตรวจการแสดงผลโดยไม่บันทึกลงประวัติจริง</p><button id="spectral-open-history" type="button">ดูค่าที่บันทึก · XYZ</button></div>
    <div id="spectral-results" hidden>
      <div class="spectral-config">
        <label>แกน<select id="spectral-axis" aria-label="แกนของคลื่น"></select></label>
        <label>FFT size · samples<select id="spectral-size">${[64,128,256,512,1024,2048,4096,8192].map(n=>`<option ${n===1024?'selected':''}>${n}</option>`).join('')}</select></label>
        <label>Window<select id="spectral-window"><option value="hann">Hann</option><option value="rectangular">Rectangular</option></select></label>
        <label>Overlap<select id="spectral-overlap"><option value="0">0%</option><option value="0.5" selected>50%</option><option value="0.75">75%</option><option value="0.875">87.5%</option></select></label>
        <label>แกนตั้ง<select id="spectral-scale"><option value="amplitude">Amplitude · peak</option><option value="psd">PSD · density</option></select></label>
        <div id="spectral-metadata" class="spectral-metadata"></div>
      </div>
      <div class="spectral-topplots">
        <section class="spectral-plot"><h3 id="spectral-wave-title">คลื่นตามเวลา</h3><canvas id="spectral-wave" role="img" aria-label="คลื่นดิบตามเวลา"></canvas><p id="spectral-wave-note"></p></section>
        <section class="spectral-plot"><h3 id="spectral-fft-title">FFT · one-sided</h3><canvas id="spectral-fft" role="img" aria-label="สเปกตรัมความถี่"></canvas><p id="spectral-peak"></p></section>
      </div>
      <section id="spectral-panel" class="panel spectral-waterfall">
        <div class="panel-heading"><div><h3 id="spectral-surface-title">Surface 3D · FFT ตามเวลา</h3></div><div class="inline-controls"><label class="spectral-band">แสดงถึง<input id="spectral-max-hz" type="number" min="0.001" step="any" placeholder="Nyquist" aria-label="ความถี่สูงสุดที่แสดง">Hz</label><select id="spectral-view" aria-label="รูปแบบสเปกตรัม"><option value="surface">พื้นผิว 3D</option><option value="waterfall">Waterfall 3D</option><option value="spectrogram">Spectrogram 2D</option></select><button id="spectral-reset">รีเซ็ตมุม</button><button id="spectral-fullscreen">ขยายกราฟ</button></div></div>
        <canvas id="spectral-surface" tabindex="0" aria-label="พื้นผิวความถี่ตามเวลา ลากแนวนอนเพื่อหมุน แนวตั้งเพื่อปรับมุมก้ม ใช้ลูกศรเปลี่ยนช่วงเวลา หรือปุ่มบวกและลบเพื่อซูม"></canvas>
        <p id="spectral-readout" class="spectral-readout">ชี้กราฟเพื่ออ่านความถี่ เวลา และขนาด</p>
        <label class="spectral-frame"><span>ช่วง FFT</span><input id="spectral-frame" type="range" min="0" max="0" value="0" aria-label="เลือกช่วงเวลา FFT"><output id="spectral-frame-time"></output></label>
      </section>
      <p id="spectral-method" class="spectral-footnote" title="ลบค่าเฉลี่ยก่อนคูณ Window · A_peak=2|FFT|/Σw · PSD=2|FFT|²/(Fs·Σw²) · ไม่คูณ 2 ที่ DC และ Nyquist · PSD ด้านบนเฉลี่ย periodogram ทุกช่วง"></p>
    </div>`.replace(/id="spectral-/g, `id="${prefix}-`);
  $('spectral-surface').classList.add('spectral-surface');$('spectral-results').classList.add('spectral-results');
  let trendRows=null,trendContext=null;
  if(isTrend){
    host.classList.add('trend-fft-host');host.querySelector('.spectral-heading').hidden=true;host.querySelector('.spectral-toolbar').hidden=true;
    host.querySelector('.spectral-capability').textContent='FFT ของค่ารวมตามเวลารับ · ใช้ดูรอบการเปลี่ยนโหลด ไม่ใช่สเปกตรัมการสั่น 10–5000 Hz · ยังไม่ทราบรอบประมวลผลภายในเซ็นเซอร์';
    const toolbar=node('div',null,'spectral-toolbar trend-fft-toolbar');
    toolbar.innerHTML=`<label>ค่าที่วิเคราะห์<select id="${prefix}-metric"><option value="velocity">ความเร็วสั่น · mm/s</option><option value="displacement">ระยะกระจัด · µm</option><option value="acceleration">ความเร่ง · m/s²</option><option value="frequency">ค่า Hz ที่รายงาน</option><option value="temperature">อุณหภูมิ · °C</option></select></label><label>แกน<select id="${prefix}-channel"><option>X</option><option>Y</option><option>Z</option></select></label><label>เวลารับข้อมูล<select id="${prefix}-timing"><option value="linear">ปรับ jitter เชิงเส้น ≤20%</option><option value="strict">ใช้ค่าตรง · jitter ≤0.1%</option></select></label><label>ช่วงต่อเนื่อง<select id="${prefix}-segment"><option value="-1">ช่วงที่ยาวที่สุด</option></select></label>`;
    host.querySelector('.spectral-capability').after(toolbar);
    $('spectral-empty').replaceChildren(node('h3','FFT ของค่ารวมตามเวลา'),node('p','เลือกมอเตอร์ รอบอ่าน และช่วงเวลา แล้วกดโหลดกราฟ ต้องมีข้อมูลต่อเนื่องอย่างน้อย 64 ค่า ไม่เติมช่วงที่ขาดและไม่ใช้จุดที่ลดจำนวนแล้ว'));
    $('spectral-axis').parentElement.hidden=true;
    $('spectral-size').value='256';$('spectral-max-hz').min='0.000000001';
    $('spectral-scale').options[0].textContent='ค่ารวม · peak';$('spectral-scale').options[1].textContent='PSD ค่ารวม';$('spectral-peak').title='ขนาดการเปลี่ยนค่ารวมหลังหักค่าเฉลี่ย ไม่ใช่ Peak ของคลื่นสั่นจริง';
    const provenance=node('p','FFT ค่ารวม · เวลารับในคอม · ไม่ใช่ FFT คลื่นสั่นสะเทือน','trend-fft-provenance');$('spectral-panel').querySelector('.panel-heading').after(provenance);
    const showTime=node('button','สเปกตรัมตามเวลา 3D');showTime.type='button';showTime.id=`${prefix}-show-time`;showTime.setAttribute('aria-expanded','false');showTime.setAttribute('aria-controls',`${prefix}-panel`);toolbar.append(showTime);$('spectral-panel').hidden=true;host.dataset.timeView='false';
    showTime.onclick=()=>{const active=$('spectral-panel').hidden;$('spectral-panel').hidden=!active;host.querySelector('.spectral-topplots').hidden=active;host.dataset.timeView=String(active);showTime.setAttribute('aria-expanded',String(active));showTime.textContent=active?'กลับกราฟ FFT 2D':'สเปกตรัมตามเวลา 3D';scheduleDraw();};
    for(const id of ['metric','channel','timing','segment'])document.getElementById(`${prefix}-${id}`).onchange=()=>{if(id==='metric'||id==='channel')document.getElementById(`${prefix}-segment`).replaceChildren(new Option('ช่วงที่ยาวที่สุด','-1'));void reloadTrend();};
  }

  let worker, serial = 0, pending = new Map(), generation = 0, computation = 0;
  let input = null, spectrum = null, fileName = '', frameIndex = 0, rotation = -.6, elevation = .6, zoom = 1, drawing = false, picked = [], drag = null;
  const hitCanvas = document.createElement('canvas');
  let hitContext = null, hitPoints = [];
  const meshCanvas = document.createElement('canvas');
  let meshCache = null, meshRaster = null;
  const colors = { X:'#007b8d', Y:'#3474bb', Z:'#6750c5' };
  if(!isTrend)$('spectral-open-history').onclick = () => setAnalysisSource('history');
  const format = value => !Number.isFinite(value) ? '—' : value !== 0 && (Math.abs(value)<.0001 || Math.abs(value)>=1e7) ? value.toExponential(3) : Number(value.toPrecision(5)).toLocaleString('en-US', { maximumFractionDigits:6 });
  const unit = () => $('spectral-scale').value === 'psd' ? `(${input.unit})²/Hz` : input.unit;
  const values = frame => $('spectral-scale').value === 'psd' ? frame.psd : frame.amplitudes;
  const setStatus = (text, error = false) => { $('spectral-status').textContent = text; $('spectral-status').classList.toggle('error', error); };
  function resetWorker() {
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
    for (const request of pending.values()) request.reject(new Error('ยกเลิกการวิเคราะห์เดิม'));
    pending.clear(); worker = null;
  }
  function request(type, data = {}) {
    if (!worker) {
      worker = new Worker('spectral-worker.js');
      const currentWorker = worker;
      currentWorker.onmessage = ({data: response}) => {
        if (worker !== currentWorker) return;
        const task = pending.get(response.id); if (!task) return; pending.delete(response.id);
        response.ok ? task.resolve(response.result) : task.reject(new Error(response.message));
      };
      currentWorker.onerror = () => { if (worker !== currentWorker) return; for (const task of pending.values()) task.reject(new Error('เปิดเครื่องมือ FFT ไม่สำเร็จ ล้างข้อมูลแล้วลองใหม่')); pending.clear(); currentWorker.terminate(); worker = null; };
    }
    return new Promise((resolve, reject) => { const id = ++serial; pending.set(id, {resolve,reject}); worker.postMessage({id,type,...data}); });
  }
  function blank() {
    spectrum = null; input = null; picked = []; frameIndex = 0; meshCache = null; meshRaster = null;
    $('spectral-results').hidden = true; $('spectral-empty').hidden = false;
    $('spectral-clear').disabled = true; $('spectral-file').textContent = '';
    $('spectral-source').textContent = 'ยังไม่มีข้อมูลคลื่น';
    $('spectral-fs').disabled = false; $('spectral-unit').disabled = false;
    if(isTrend)for(const key of ['peakHz','sampleRate','samples','start','timing'])delete host.dataset[key];
  }
  async function load(type, text, name) {
    const mine = ++generation; ++computation; resetWorker(); blank();
    setStatus('กำลังตรวจชุดตัวอย่างคลื่น…');
    try {
      const rateText = $('spectral-fs').value.trim();
      const details = await request(type, isTrend ? {rows:trendRows,options:{...trendContext,metric:document.getElementById(`${prefix}-metric`).value,axis:document.getElementById(`${prefix}-channel`).value,timing:document.getElementById(`${prefix}-timing`).value,segment:Number(document.getElementById(`${prefix}-segment`).value)}} : { text, options: { ...(rateText ? {sampleRateHz:Number(rateText)} : {}), unit:$('spectral-unit').value } });
      if (mine !== generation) return;
      input = details; fileName = name; $('spectral-file').textContent = name;
      $('spectral-fs').value = String(details.sampleRateHz); $('spectral-unit').value = details.unit;
      $('spectral-fs').disabled = true; $('spectral-unit').disabled = true;
      $('spectral-clear').disabled = false; $('spectral-empty').hidden = true; $('spectral-results').hidden = false;
      $('spectral-source').textContent = isTrend ? `FFT ค่ารวม${details.simulation?' · ข้อมูลจำลอง':''}` : details.source === 'test-signal' ? 'TEST SIGNAL · ข้อมูลทดสอบ' : 'WAVEFORM CSV · ไฟล์คลื่น';
      if(isTrend){const segment=document.getElementById(`${prefix}-segment`);segment.replaceChildren(...details.segments.map(item=>new Option(`${item.index+1} · ${item.count.toLocaleString()} ค่า · ${timestamp(item.start)}`,item.index)));segment.value=String(details.selectedSegment);host.dataset.source='overall-trend';host.dataset.sampleRate=String(details.sampleRateHz);host.dataset.samples=String(details.sampleCount);host.dataset.timing=details.timingMode;host.dataset.start=details.startTimestamp;}
      $('spectral-axis').replaceChildren(...details.axes.map(axis => { const option = node('option',axis); option.value = axis; return option; }));
      for (const option of $('spectral-size').options) option.disabled = Number(option.value) > details.sampleCount;
      if (Number($('spectral-size').value) > details.sampleCount) $('spectral-size').value = [...$('spectral-size').options].filter(option=>!option.disabled).at(-1)?.value || '64';
      await compute();
    } catch (error) { if (mine === generation) { blank(); setStatus(error.message,true); } }
  }
  async function reloadTrend(){
    if(!trendRows)return;
    const metric=document.getElementById(`${prefix}-metric`).value,channel=document.getElementById(`${prefix}-channel`);channel.disabled=metric==='custom'||metric==='temperature';if(channel.disabled)channel.value='X';
    await load('trend',null,trendContext?.motorId||'ค่ารวม');
  }
  async function compute() {
    if (!input) return;
    const mine = ++computation, loadId = generation;
    spectrum = null; picked = []; meshCache = null; meshRaster = null; $('spectral-metadata').replaceChildren(); $('spectral-peak').textContent = ''; $('spectral-method').textContent = ''; $('spectral-frame-time').textContent = ''; $('spectral-readout').textContent = 'รอผลการคำนวณ'; scheduleDraw();
    setStatus('กำลังคำนวณ FFT / STFT…');
    try {
      const result = await request('analyze', { axis:$('spectral-axis').value, options:{fftSize:Number($('spectral-size').value), window:$('spectral-window').value, overlap:Number($('spectral-overlap').value)} });
      if (mine !== computation || loadId !== generation) return;
      spectrum = result; frameIndex = Math.min(frameIndex,result.frames.length-1);
      $('spectral-max-hz').max = String(result.nyquistHz);
      if (Number($('spectral-max-hz').value) > result.nyquistHz) $('spectral-max-hz').value = '';
      $('spectral-frame').max = String(result.frames.length-1); $('spectral-frame').value = String(frameIndex);
      $('spectral-metadata').replaceChildren(...[
        `${isTrend?'Fs รับ':'Fs'} ${format(input.sampleRateHz)} Hz`, `${isTrend?'สูงสุดตามรอบรับ':'Nyquist'} ${format(result.nyquistHz)} Hz`, `Δf ${format(result.binWidthHz)} Hz`, `${format(input.sampleCount)} samples`, `${result.frames.length} ช่วง`
      ].map(text => node('b',text)));
      const test = input.source === 'test-signal';
      setStatus(test ? 'ข้อมูลทดสอบเท่านั้น · X: 50 / 120 Hz คงที่ · Y: 80 Hz · Z: sweep 30–190 Hz พร้อมขนาดที่เปลี่ยนตามเวลา' : `วิเคราะห์ ${fileName} · เวลาเป็นวินาทีจาก sample แรก · เปลี่ยน Fs/หน่วย: ล้างข้อมูลแล้วเปิดไฟล์ใหม่`);
      if(isTrend)setStatus(`${input.motorId} · ${input.metricLabel} ${input.axis} · ${timestamp(input.startTimestamp)} · ${input.originalSampleCount.toLocaleString()}/${input.totalRecords.toLocaleString()} ค่าต่อเนื่อง${input.omittedRecords?` · นอกช่วง ${input.omittedRecords.toLocaleString()} ค่า`:''} · ${input.timingMode==='linear'?'จัดเวลาเชิงเส้น':'ค่าตรง'} · jitter ${format(input.maxJitterPercent)}%${input.simulation?' · ข้อมูลจำลอง':''}`);
      $('spectral-wave-title').textContent=isTrend?'ค่ารวมตามเวลารับ':'คลื่นตามเวลา';
      $('spectral-wave-note').textContent = `${format(input.timeSpanSeconds)} s · ${input.unit} · ${isTrend?(input.timingMode==='linear'?'FFT ใช้ค่าจัดเวลาเชิงเส้น ไม่ได้แก้ไฟล์ต้นฉบับ':'FFT ใช้ค่าต้นฉบับทุกจุดในช่วงนี้'):'ภาพรวมย่อคงจุดต่ำสุด/สูงสุด การคำนวณใช้ทุก sample'}`;
      $('spectral-method').textContent = `ลบค่าเฉลี่ย · ${$('spectral-window').selectedOptions[0].textContent} · N=${result.fftSize} · Hop=${result.hopSize} · Δf=Fs/N · ไม่เติมศูนย์ · ท้ายที่ไม่ครบ ${result.omittedSamples} samples · PSD ด้านบนเฉลี่ยทุกช่วง; Waterfall/สีเป็นค่าของแต่ละช่วง`;
      if(isTrend)$('spectral-method').textContent=`FFT ค่ารวม ไม่ใช่สเปกตรัมการสั่น · ${$('spectral-method').textContent} · Fs จากเวลารับในคอม ไม่ใช่ความเร็วภายในเซ็นเซอร์`;
      if(isTrend)$('spectral-method').title=$('spectral-method').textContent+' · A_peak=2|FFT|/Σw · PSD=2|FFT|²/(Fs·Σw²) · ไม่คูณ 2 ที่ DC/Nyquist';
      $('spectral-readout').textContent = result.frames.length === 1 ? 'มี 1 ช่วง FFT · คลื่นต้องยาวขึ้นเพื่อดูการเปลี่ยนแปลงตามเวลา' : 'ชี้เพื่ออ่านค่า · คลิกเลือกช่วง FFT · ลากเพื่อหมุน · ล้อเมาส์เพื่อซูม';
      scheduleDraw();
    } catch(error) { if(mine === computation && loadId === generation) { setStatus(error.message,true); scheduleDraw(); } }
  }
  function canvas(id) {
    const element = $(id), box = element.getBoundingClientRect(), width = box.width, height = box.height;
    const ratio = Math.min(2,window.devicePixelRatio || 1);
    if (!width || !height) return null;
    if (element.width !== Math.round(width*ratio) || element.height !== Math.round(height*ratio)) { element.width=Math.round(width*ratio);element.height=Math.round(height*ratio); }
    const ctx = element.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);ctx.font='11px "Segoe UI", Tahoma, sans-serif';
    return {ctx,width,height};
  }
  function axes(ctx,width,height,low,high,end,xUnit,yUnit) {
    const area={left:62,right:width-16,top:19,bottom:height-28};
    const x = v=>area.left+(area.right-area.left)*v/(end||1), y=v=>area.bottom-(v-low)/(high-low||1)*(area.bottom-area.top);
    ctx.lineWidth=1;ctx.textAlign='right';ctx.fillStyle='#626a7d';
    for (let i=0;i<=2;i++) {const v=low+(high-low)*i/2,py=y(v);ctx.strokeStyle='#e9ecf3';ctx.beginPath();ctx.moveTo(area.left,py);ctx.lineTo(area.right,py);ctx.stroke();ctx.fillText(format(v),area.left-7,py+4);}
    ctx.textAlign='center';for(let i=0;i<=2;i++)ctx.fillText(format(end*i/2),x(end*i/2),height-11);
    ctx.textAlign='left';ctx.fillText(yUnit,5,11);ctx.textAlign='right';ctx.fillText(xUnit,width-3,height-1);
    return {x,y,area};
  }
  // Display aggregation keeps the actual frequency of the largest bin in each bucket.
  function peakBins(list,limit=350) {
    const out=[],step=Math.max(1,Math.ceil(list.length/limit));
    for(let start=0;start<list.length;start+=step){let index=start;for(let j=start+1;j<Math.min(list.length,start+step);j++)if(list[j]>list[index])index=j;out.push(index);}
    return out;
  }
  function drawPlots() {
    const wave=canvas('spectral-wave'),fft=canvas('spectral-fft');
    if(!spectrum||!input)return;
    const color=colors[$('spectral-axis').value];
    if(wave){const {ctx,width,height}=wave, preview=spectrum.preview;let lo=0,hi=0;for(const p of preview){lo=Math.min(lo,p.value);hi=Math.max(hi,p.value);}if(lo===hi){lo-=1;hi+=1;}
      const {x,y,area}=axes(ctx,width,height,lo,hi,input.timeSpanSeconds,'s',input.unit),frame=spectrum.frames[frameIndex];
      ctx.fillStyle='#6252e915';ctx.fillRect(x(frame.startTimeSeconds),area.top,x(frame.endTimeSeconds)-x(frame.startTimeSeconds),area.bottom-area.top);
      ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();preview.forEach((p,i)=>i?ctx.lineTo(x(p.time),y(p.value)):ctx.moveTo(x(p.time),y(p.value)));ctx.stroke();}
    const isPSD=$('spectral-scale').value==='psd',list=isPSD?spectrum.meanPSD:values(spectrum.frames[frameIndex]);
    let peak=0,max=0;list.forEach((v,i)=>{if(v>max){max=v;peak=i;}});
    $('spectral-fft-title').textContent=isTrend?(isPSD?'PSD ค่ารวม · เฉลี่ยทุกช่วง':'FFT ค่ารวม · ช่วงที่เลือก'):isPSD?'PSD · ค่าเฉลี่ยทุกช่วง':'FFT · ช่วงเวลาที่เลือก';
    $('spectral-peak').textContent=`Peak bin ${format(spectrum.frequencies[peak])} Hz · ${format(max)} ${unit()}`;
    host.dataset.peakHz=String(spectrum.frequencies[peak]);
    if(isTrend)$('spectral-peak').textContent=max===0?'ไม่มีการเปลี่ยนแปลงในช่วงนี้':`${$('spectral-peak').textContent}${spectrum.frequencies[peak]>0?` · รอบค่ารวม ${format(1/spectrum.frequencies[peak])} s`:''}`;
    const frame=spectrum.frames[frameIndex];$('spectral-frame-time').textContent=`${frameIndex+1}/${spectrum.frames.length} · ${format(frame.timeSeconds)} s`;
    if(fft){const{ctx,width,height}=fft,{x,y}=axes(ctx,width,height,0,max*1.12||1,spectrum.nyquistHz,'Hz',unit());ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.beginPath();peakBins(list).forEach((i,j)=>j?ctx.lineTo(x(spectrum.frequencies[i]),y(list[i])):ctx.moveTo(x(spectrum.frequencies[i]),y(list[i])));ctx.stroke();}
  }
  const heat = ratio => { const r=Math.max(0,Math.min(1,ratio)); return `hsl(${240-r*240} 78% ${40+r*8}%)`; };
  // The axes have independent physical units, so fit the projected box to the
  // available plot area instead of preserving a cube's screen aspect ratio.
  function projection(width,height) {
    const c=Math.cos(rotation),s=Math.sin(rotation);
    const tilt=Math.sin(elevation),rise=Math.cos(elevation);
    const raw=(x,y,z)=>{const dx=(x-.5)*2,dy=y*2-1,rx=dx*c-dy*s,ry=dx*s+dy*c;return{x:rx,y:ry*tilt-z*1.8*rise,depth:ry*rise+z*1.8*tilt};};
    const corners=[0,1].flatMap(x=>[0,1].flatMap(y=>[-.5,.5].map(z=>raw(x,y,z))));
    const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y),loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);
    const plotWidth=$('spectral-view').value==='surface'?Math.min(width-180,Math.max(220,(height-65)*2.8)):width-180;
    const scaleX=Math.max(30,plotWidth)/(hiX-loX)*zoom,scaleY=Math.max(30,height-75)/(hiY-loY)*zoom;
    return(x,y,z)=>{const p=raw(x,y,z);return{x:width/2+(p.x-(loX+hiX)/2)*scaleX,y:(height-15)/2+(p.y-(loY+hiY)/2)*scaleY,depth:p.depth};};
  }
  function frequencyLimit() {
    const requested=Number($('spectral-max-hz').value);
    return requested>0?Math.min(requested,spectrum.nyquistHz):spectrum.nyquistHz;
  }
  function colorScale(ctx,width,height,max) {
    const x=width-48,top=32,bottom=height-36;
    const gradient=ctx.createLinearGradient(0,bottom,0,top);
    [[0,'#0000ff'],[.2,'#00ffff'],[.4,'#00ff00'],[.6,'#ffff00'],[.8,'#ff0000'],[1,'#ff00ff']].forEach(([at,color])=>gradient.addColorStop(at,color));
    ctx.fillStyle=gradient;ctx.fillRect(x,top,12,bottom-top);ctx.strokeStyle='#b5bac7';ctx.strokeRect(x,top,12,bottom-top);
    ctx.fillStyle='#50596e';ctx.textAlign='right';ctx.fillText(unit(),width-7,16);ctx.fillText(format(max),width-4,top-4);ctx.fillText('0',width-11,bottom+16);
  }
  function drawMesh(ctx,width,height) {
    const metric=$('spectral-scale').value==='psd'?'psd':'amplitude',maxFrequencyHz=frequencyLimit();
    if(!meshCache||meshCache.spectrum!==spectrum||meshCache.metric!==metric||meshCache.frameIndex!==frameIndex||meshCache.maxFrequencyHz!==maxFrequencyHz){
      meshCache={spectrum,metric,frameIndex,maxFrequencyHz,mesh:SpectralMesh.prepare(spectrum,{metric,selectedFrame:frameIndex,maxFrequencyHz})};
    }
    const mesh=meshCache.mesh,project=projection(width,height);
    const line=(points,color='#cbd0dd')=>{ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();points.forEach((p,i)=>{const q=project(...p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.stroke();};
    // Back walls and floor share the same numeric coordinates as the mesh.
    for(const points of [[[0,0,-.5],[1,0,-.5],[1,1,-.5],[0,1,-.5]],[[0,0,-.5],[1,0,-.5],[1,0,.5],[0,0,.5]],[[0,0,-.5],[0,1,-.5],[0,1,.5],[0,0,.5]]]){
      ctx.beginPath();points.forEach((p,i)=>{const q=project(...p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fillStyle='#f2f3f7';ctx.fill();
    }
    for(let i=0;i<=5;i++){const t=i/5;line([[t,0,-.5],[t,1,-.5]]);line([[0,t,-.5],[1,t,-.5]]);line([[t,0,-.5],[t,0,.5]]);line([[0,t,-.5],[0,t,.5]]);line([[0,0,t-.5],[1,0,t-.5]]);line([[0,0,t-.5],[0,1,t-.5]]);}
    const ratio=Math.min(1,Math.sqrt(1000000/(width*height))),rw=Math.ceil(width*ratio),rh=Math.ceil(height*ratio),ratioX=rw/width,ratioY=rh/height;
    meshRaster=SpectralMesh.rasterize(mesh,{width:rw,height:rh,project:(x,y,z)=>{const q=project(x,y,z);return{...q,x:q.x*ratioX,y:q.y*ratioY};}});
    meshRaster.ratioX=ratioX;meshRaster.ratioY=ratioY;meshRaster.width=rw;meshRaster.height=rh;
    meshCanvas.width=rw;meshCanvas.height=rh;const buffer=meshCanvas.getContext('2d');buffer.putImageData(new ImageData(meshRaster.pixels,rw,rh),0,0);ctx.drawImage(meshCanvas,0,0,width,height);
    ctx.fillStyle='#50596e';ctx.textAlign='center';
    for(let i=0;i<=4;i++){const p=project(i/4,1,-.5);ctx.fillText(format(mesh.frequencyMaxHz*i/4),p.x,p.y+14);}
    for(let i=0;i<=2;i++){if(mesh.rows.length>1||i===1){const p=project(0,i/2,-.5);ctx.textAlign='right';ctx.fillText(`${format(mesh.timeStart+(mesh.timeEnd-mesh.timeStart)*i/2)} s`,p.x-8,p.y+3);}}
    const hz=project(.65,1,-.5);ctx.textAlign='center';ctx.fillText('Frequency · Hz',hz.x,Math.min(height-4,hz.y+29));
    const provenance=isTrend?`FFT ค่ารวม${input.simulation?' · ข้อมูลจำลอง':''}`:input.source==='test-signal'?'TEST SIGNAL · ข้อมูลทดสอบ':'WAVEFORM CSV';
    ctx.textAlign='left';ctx.fillText(`${provenance} · ผิว FFT · ${mesh.displayedFrames}/${mesh.totalFrames} ช่วง · ${mesh.displayedBins}/${mesh.totalBins} bins · สีและความสูง = ${unit()}`,10,13);
    if(mesh.rows.length===1){const row=mesh.rows[0];ctx.strokeStyle='#6252e9';ctx.lineWidth=2;ctx.beginPath();row.vertices.forEach((v,i)=>{const p=project(v.x,v.y,v.z);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);picked.push({...v,...p});});ctx.stroke();ctx.fillStyle='#50596e';ctx.fillText('มีช่วง FFT เดียว · ยังสร้างผืนตามเวลาไม่ได้',10,height-8);}
    if(mesh.displayedBins<2){ctx.fillStyle='#50596e';ctx.fillText('ช่วง Hz นี้มีเพียง 1 bin · เพิ่มความถี่สูงสุดที่แสดง',10,height-8);}
    colorScale(ctx,width,height,mesh.maxValue);
  }
  function drawSurface() {
    const target=canvas('spectral-surface'); picked=[];hitPoints=[];if(!target||!spectrum)return;
    const{ctx,width,height}=target, frames=spectrum.frames;
    let max=0;for(const frame of frames)for(const v of values(frame))max=Math.max(max,v);max||=1;
    const first=frames[0].timeSeconds,last=frames.at(-1).timeSeconds,span=last-first||1;
    const mode=$('spectral-view').value;
    $('spectral-surface-title').textContent=mode==='surface'?'Surface 3D · FFT ตามเวลา':mode==='waterfall'?'Waterfall · FFT ตามเวลา':'Spectrogram · FFT ตามเวลา';
    if(isTrend)$('spectral-surface-title').textContent+=' · ค่ารวม';
    $('spectral-reset').disabled=mode==='spectrogram';
    $('spectral-max-hz').disabled=mode!=='surface';
    if(mode==='surface'){drawMesh(ctx,width,height);return;}
    if(mode==='spectrogram') {
      const left=66,right=width-70,top=20,bottom=height-34,cols=Math.min(320,spectrum.frequencies.length),step=Math.ceil(spectrum.frequencies.length/cols);
      const cellH=(bottom-top)/frames.length;
      frames.forEach((frame,fi)=>{const list=values(frame);for(let i=0;i<list.length;i+=step){let bin=i;for(let j=i+1;j<Math.min(list.length,i+step);j++)if(list[j]>list[bin])bin=j;
        const x=left+i/list.length*(right-left),y=bottom-(fi+1)*cellH,w=Math.min(step,list.length-i)/list.length*(right-left);ctx.fillStyle=heat(list[bin]/max);ctx.fillRect(x,y,w+.5,cellH+.5);
        picked.push({x:x+w/2,y:y+cellH/2,depth:0,fi,bin,value:list[bin]});}});
      ctx.strokeStyle='#6252e9';ctx.lineWidth=1;const fy=bottom-(frameIndex+.5)*cellH;ctx.strokeRect(left,fy-cellH/2,right-left,Math.max(cellH,1));
      ctx.fillStyle='#5e6679';ctx.textAlign='right';ctx.fillText(`${format(first)} s`,left-7,bottom);ctx.fillText(`${format(last)} s`,left-7,top+8);ctx.textAlign='center';
      for(let i=0;i<=4;i++)ctx.fillText(format(spectrum.nyquistHz*i/4),left+(right-left)*i/4,height-14);ctx.textAlign='right';ctx.fillText('Hz',right,height-1);
      for(let i=0;i<80;i++){ctx.fillStyle=heat(i/79);ctx.fillRect(width-45,bottom-(bottom-top)*(i+1)/80,12,(bottom-top)/80+.5);}
      ctx.fillStyle='#5e6679';ctx.textAlign='right';ctx.fillText(format(max),width-2,top+5);ctx.fillText('0',width-2,bottom);ctx.fillText(unit(),width-3,11);
      if(isTrend){ctx.textAlign='left';ctx.fillText('FFT ค่ารวมตามเวลารับ · ไม่ใช่สเปกตรัมการสั่น',10,12);}
    }else{
      const project=projection(width,height);
      hitCanvas.width=Math.ceil(width);hitCanvas.height=Math.ceil(height);hitContext=hitCanvas.getContext('2d',{willReadFrequently:true});hitContext.clearRect(0,0,width,height);hitContext.lineWidth=6;
      function line(points,color='#dce0ea'){ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();points.forEach((p,i)=>{const v=project(...p);i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y);});ctx.stroke();}
      for(let i=0;i<=4;i++){const t=i/4;line([[t,0,-.5],[t,1,-.5],[t,1,.5]]);line([[0,t,-.5],[1,t,-.5]]);line([[0,1,t-.5],[1,1,t-.5]]);}
      const shown=new Set([frameIndex]);
      for(let i=0;i<Math.min(96,frames.length);i++)shown.add(Math.round(i*(frames.length-1)/Math.max(1,Math.min(96,frames.length)-1)));
      const rows=[...shown].map(fi=>({frame:frames[fi],fi,y:frames.length===1?.5:(frames[fi].timeSeconds-first)/span})).sort((a,b)=>project(.5,a.y,0).depth-project(.5,b.y,0).depth);
      for(const{frame,fi,y}of rows){const list=values(frame),bins=peakBins(list,220),points=bins.map(bin=>({...project(spectrum.frequencies[bin]/spectrum.nyquistHz,y,list[bin]/max-.5),fi,bin,value:list[bin]}));
        const start=project(0,y,-.5),end=project(1,y,-.5),curtain=new Path2D();curtain.moveTo(start.x,start.y);points.forEach(p=>curtain.lineTo(p.x,p.y));curtain.lineTo(end.x,end.y);curtain.closePath();ctx.fillStyle='#fff';ctx.fill(curtain);hitContext.fillStyle='#000';hitContext.fill(curtain);
        ctx.lineWidth=fi===frameIndex?2:1;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];ctx.strokeStyle=fi===frameIndex?'#4933c8':heat(Math.max(a.value,b.value)/max);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
          // A color-ID buffer follows the same paint order and curtains as the visible
          // plot, so an occluded rear trace cannot win a nearest-point search.
          const id=hitPoints.push({...b,from:a});hitContext.strokeStyle=`rgb(${id&255},${(id>>8)&255},${(id>>16)&255})`;hitContext.beginPath();hitContext.moveTo(a.x,a.y);hitContext.lineTo(b.x,b.y);hitContext.stroke();}
      }
      ctx.fillStyle='#596278';ctx.textAlign='center';for(let i=0;i<=4;i++){const p=project(i/4,1,-.5);ctx.fillText(format(spectrum.nyquistHz*i/4),p.x,p.y+13);}
      for(let i=0;i<=2;i++){if(frames.length>1||i===1){const p=project(0,i/2,-.5);ctx.fillText(`${format(first+(last-first)*i/2)} s`,p.x-20,p.y+3);}const z=project(1,1,i/2-.5);ctx.textAlign='left';ctx.fillText(format(max*i/2),z.x+6,z.y+3);ctx.textAlign='center';}
      const hz=project(.6,1,-.5),u=project(1,1,.5);ctx.fillText('Frequency · Hz',hz.x,Math.min(height-4,hz.y+27));ctx.textAlign='right';ctx.fillText(unit(),Math.min(width-4,u.x+25),Math.max(12,u.y-12));
      ctx.textAlign='left';ctx.fillText(`วาด ${rows.length}/${frames.length} ช่วง · สี 0–${format(max)} ${unit()} · เส้นม่วง = ช่วงที่เลือก`,10,13);
      if(isTrend){ctx.fillStyle='#fff';ctx.fillRect(0,0,width-65,18);ctx.fillStyle='#50596e';ctx.fillText('FFT ค่ารวมตามเวลารับ · ไม่ใช่สเปกตรัมการสั่น',10,13);}
    }
  }
  function scheduleDraw(){if(drawing)return;drawing=true;requestAnimationFrame(()=>{drawing=false;drawPlots();drawSurface();});}
  function readAt(event,choose=false){if(!spectrum)return;const rect=$('spectral-surface').getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;let p;
    if($('spectral-view').value==='surface'&&meshRaster){const px=Math.floor(x*meshRaster.ratioX),py=Math.floor(y*meshRaster.ratioY);let nearest=Infinity;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const hx=px+dx,hy=py+dy;if(hx<0||hy<0||hx>=meshRaster.width||hy>=meshRaster.height)continue;const id=meshRaster.picks[hy*meshRaster.width+hx],distance=dx*dx+dy*dy;if(id&&distance<nearest){nearest=distance;p=meshRaster.vertices[id-1];}}
      if(!p&&meshCache?.mesh.rows.length===1)p=HistorySurfaceData.nearestProjected(picked,x,y,24);}
    else if($('spectral-view').value==='waterfall'&&hitContext&&x>=0&&y>=0&&x<hitCanvas.width&&y<hitCanvas.height){const pixel=hitContext.getImageData(Math.floor(x),Math.floor(y),1,1).data;if(pixel[3]===255)p=hitPoints[(pixel[0]+(pixel[1]<<8)+(pixel[2]<<16))-1];
      if(p){const dx=p.x-p.from.x,dy=p.y-p.from.y,t=Math.max(0,Math.min(1,((x-p.from.x)*dx+(y-p.from.y)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(x-p.from.x-t*dx,y-p.from.y-t*dy)>4)p=null;}}
    else p=HistorySurfaceData.nearestProjected(picked,x,y,24);if(!p)return;
    $('spectral-readout').textContent=`${format(spectrum.frequencies[p.bin])} Hz · ${format(spectrum.frames[p.fi].timeSeconds)} s · ${format(p.value)} ${unit()} · แกน ${$('spectral-axis').value}${$('spectral-view').value==='surface'?' · จุด FFT จริงใกล้ตำแหน่งที่ชี้':''}`;
    if(isTrend)$('spectral-readout').textContent+=` · ${timestamp(Date.parse(input.startTimestamp)+spectrum.frames[p.fi].timeSeconds*1000)} · ค่ารวม`;
    if(choose){frameIndex=p.fi;$('spectral-frame').value=String(frameIndex);scheduleDraw();}}
  $('spectral-import').addEventListener('click',()=>void action(async()=>{const result=check(await api.importWaveform());if(!result.canceled)await load('load',result.text,result.fileName);}));
  $('spectral-demo').addEventListener('click',()=>void load('demo',null,'สัญญาณทดสอบ · ไม่ใช่ข้อมูลเซ็นเซอร์'));
  $('spectral-clear').addEventListener('click',()=>{++generation;++computation;resetWorker();blank();$('spectral-fs').value='';$('spectral-unit').value='a.u.';setStatus('เปิด CSV ของคลื่นดิบเพื่อเริ่มวิเคราะห์');});
  for(const id of ['spectral-axis','spectral-size','spectral-window','spectral-overlap'])$(id).addEventListener('change',()=>void compute());
  $('spectral-scale').addEventListener('change',scheduleDraw);$('spectral-view').addEventListener('change',scheduleDraw);
  $('spectral-max-hz').addEventListener('change',()=>{if(!$('spectral-max-hz').checkValidity()){$('spectral-max-hz').reportValidity();$('spectral-max-hz').value='';}scheduleDraw();});
  $('spectral-frame').addEventListener('input',()=>{frameIndex=Number($('spectral-frame').value);scheduleDraw();});
  $('spectral-fft').addEventListener('pointermove',event=>{
    if(!spectrum)return;
    const plot=$('spectral-fft'),rect=plot.getBoundingClientRect(),x=event.clientX-rect.left;
    if(x<62||x>rect.width-16)return;
    const bin=Math.max(0,Math.min(spectrum.frequencies.length-1,Math.round((x-62)/(rect.width-78)*(spectrum.frequencies.length-1))));
    const list=$('spectral-scale').value==='psd'?spectrum.meanPSD:values(spectrum.frames[frameIndex]);
    plot.title=`${format(spectrum.frequencies[bin])} Hz · ${format(list[bin])} ${unit()} · ${$('spectral-scale').value==='psd'?'เฉลี่ยทุกช่วง':`${format(spectrum.frames[frameIndex].timeSeconds)} s`}`;
  });
  $('spectral-reset').addEventListener('click',()=>{rotation=-.6;elevation=.6;zoom=1;scheduleDraw();});
  $('spectral-fullscreen').addEventListener('click',()=>void action(()=>togglePanelFullscreen($('spectral-panel'))));
  const surface=$('spectral-surface');
  surface.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,startX:event.clientX,startY:event.clientY,rotation,elevation,moved:false};surface.setPointerCapture(event.pointerId);surface.focus();});
  surface.addEventListener('pointermove',event=>{if(drag){if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)drag.moved=true;if($('spectral-view').value!=='spectrogram'){rotation=drag.rotation+(event.clientX-drag.x)*.008;elevation=Math.max(.2,Math.min(1.3,drag.elevation+(event.clientY-drag.startY)*.006));scheduleDraw();}}else readAt(event);});
  surface.addEventListener('pointerup',event=>{if(!drag?.moved)readAt(event,true);drag=null;if(surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId);});
  surface.addEventListener('pointercancel',()=>{drag=null;});
  surface.addEventListener('wheel',event=>{if($('spectral-view').value==='spectrogram')return;event.preventDefault();zoom=Math.max(.6,Math.min(1.7,zoom*(event.deltaY>0?.94:1.06)));scheduleDraw();},{passive:false});
  surface.addEventListener('keydown',event=>{if(!spectrum)return;let handled=true;
    if(event.key==='ArrowRight'||event.key==='ArrowUp')frameIndex=Math.min(spectrum.frames.length-1,frameIndex+1);
    else if(event.key==='ArrowLeft'||event.key==='ArrowDown')frameIndex=Math.max(0,frameIndex-1);
    else if(event.key==='+')zoom=Math.min(1.7,zoom+.1);else if(event.key==='-')zoom=Math.max(.6,zoom-.1);
    else if(event.key==='Home'){rotation=-.6;elevation=.6;zoom=1;frameIndex=0;}else handled=false;
    if(handled){event.preventDefault();$('spectral-frame').value=String(frameIndex);scheduleDraw();}});
  new ResizeObserver(scheduleDraw).observe(surface);
  document.addEventListener('fullscreenchange',()=>{$('spectral-fullscreen').textContent=document.fullscreenElement===$('spectral-panel')?'ย่อกราฟ':'ขยายกราฟ';scheduleDraw();});
  return{draw:scheduleDraw,clear(message='เลือกช่วงเวลาแล้วโหลดกราฟ') {++generation;++computation;trendRows=null;trendContext=null;resetWorker();blank();for(const key of ['peakHz','sampleRate','samples','start','timing'])delete host.dataset[key];setStatus(message);},async loadTrend(rows,context){trendRows=rows;trendContext=context;const metric=document.getElementById(`${prefix}-metric`),custom=context.sensorModel==='custom';if(custom)metric.replaceChildren(new Option(`Custom · ${context.unit}`,'custom'));else if(metric.options.length===1)metric.innerHTML='<option value="velocity">ความเร็วสั่น · mm/s</option><option value="displacement">ระยะกระจัด · µm</option><option value="acceleration">ความเร่ง · m/s²</option><option value="frequency">ค่า Hz ที่รายงาน</option><option value="temperature">อุณหภูมิ · °C</option>';const segment=document.getElementById(`${prefix}-segment`);segment.replaceChildren(new Option('ช่วงที่ยาวที่สุด','-1'));await reloadTrend();}};
}
