'use strict';
// Spectra of recorded overall values, using PC receive times. Not vibration waveforms.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TrendAnalysis=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const maxSamples=65536;
  const metrics={velocity:{label:'ความเร็วสั่น',unit:'mm/s'},displacement:{label:'ระยะกระจัด',unit:'µm'},acceleration:{label:'ความเร่ง',unit:'m/s²'},temperature:{label:'อุณหภูมิ',unit:'°C'},frequency:{label:'ค่า Hz ที่รายงาน',unit:'Hz'},custom:{label:'Custom',unit:null}};
  const median=list=>{const values=[...list].sort((a,b)=>a-b),mid=Math.floor(values.length/2);return values.length%2?values[mid]:(values[mid-1]+values[mid])/2;};
  function prepare(rows,options={}){
    if(!Array.isArray(rows)||rows.length>maxSamples)throw new Error(`FFT ค่ารวมรองรับไม่เกิน ${maxSamples.toLocaleString()} รายการต่อชุด เลือกช่วงเวลาสั้นลง`);
    const metric=options.sensorModel==='custom'?'custom':options.metric||'velocity',definition=metrics[metric],axis=metric==='custom'||metric==='temperature'?'X':options.axis||'X';
    if(!definition||!['X','Y','Z'].includes(axis))throw new Error('เลือกชนิดค่าและแกนให้ถูกต้อง');
    const timing=options.timing||'linear';if(!['linear','linear30','strict'].includes(timing))throw new Error('รูปแบบตรวจเวลาของ FFT ค่ารวมไม่ถูกต้อง');
    const stamps=rows.map(row=>Date.parse(row.timestamp)),deltas=[];
    for(let i=1;i<stamps.length;i++){const dt=stamps[i]-stamps[i-1];if(Number.isFinite(dt)&&dt>0)deltas.push(dt);}
    if(!deltas.length)throw new Error('ต้องมีข้อมูลพร้อมเวลารับที่เรียงเพิ่มขึ้นอย่างน้อย 64 ค่า');
    const interval=median(deltas);if(!(interval>0))throw new Error('ไม่สามารถหารอบรับข้อมูลจริงได้');
    const key=metric==='temperature'?'temperature':metric==='custom'?'value':metric+axis;
    const segments=[];let current=[],excluded=0,breaks=0;
    const finish=()=>{if(current.length)segments.push(current);current=[];};
    rows.forEach((row,i)=>{
      const value=metric==='custom'?row.value:row.channels?.[key]??row[key],stamp=stamps[i];
      if(!Number.isFinite(stamp)||!Number.isFinite(value)||(metric==='frequency'&&row.frequencyStatus!=='ok')){finish();excluded++;return;}
      if(current.length){const step=stamp-current.at(-1).stamp;if(step<interval*.5||step>interval*1.5){finish();breaks++;}}
      current.push({stamp,value});
    });finish();
    const summaries=segments.map((points,index)=>({index,count:points.length,start:new Date(points[0].stamp).toISOString(),end:new Date(points.at(-1).stamp).toISOString()})).filter(segment=>segment.count>=64);
    let selected=options.segment;
    if(selected===undefined||selected===null||selected===-1)selected=segments.reduce((best,points,index)=>points.length>(segments[best]?.length||0)?index:best,-1);
    if(!Number.isInteger(selected)||!segments[selected])throw new Error('ไม่มีช่วงข้อมูลต่อเนื่องที่มีค่าพร้อมใช้สำหรับแกนนี้');
    const points=segments[selected];
    if(points.length<64)throw new Error(`ช่วงต่อเนื่องที่เลือกมี ${points.length} ค่า ต้องมีอย่างน้อย 64 ค่า · เพิ่มช่วงเวลาหรือบันทึกต่อเนื่องให้นานขึ้น`);
    const localSteps=points.slice(1).map((point,i)=>point.stamp-points[i].stamp),dt=(points.at(-1).stamp-points[0].stamp)/(points.length-1);
    const maxJitter=localSteps.reduce((max,step)=>Math.max(max,Math.abs(step-dt)/dt),0);
    if(timing==='strict'&&maxJitter>.001+1e-12)throw new Error(`เวลารับไม่สม่ำเสมอ (jitter ${(maxJitter*100).toFixed(2)}%) · เลือกปรับ jitter แบบเชิงเส้น หรือเลือกช่วงอื่น`);
    if(timing!=='strict'&&maxJitter>(timing==='linear30'?.3:.2)+1e-12)throw new Error(`jitter ${(maxJitter*100).toFixed(2)}% เกิน ${timing==='linear30'?'30':'20'}% · ${timing==='linear'?'เลือกโหมดประมาณ ≤30% เพื่อดูแนวโน้ม หรือเลือกช่วงอื่น':'เลือกช่วงอื่นหรือแก้รอบรับข้อมูล'}`);
    const start=points[0].stamp,span=points.at(-1).stamp-start,samples=[];
    if(timing==='strict')points.forEach(point=>samples.push(point.value));
    else{
      const count=Math.floor(span/dt+1e-9)+1;let cursor=0;
      for(let i=0;i<count;i++){const stamp=start+i*dt;while(cursor+1<points.length-1&&points[cursor+1].stamp<stamp)cursor++;const a=points[cursor],b=points[Math.min(cursor+1,points.length-1)],fraction=b.stamp===a.stamp?0:(stamp-a.stamp)/(b.stamp-a.stamp);samples.push(a.value+(b.value-a.value)*Math.max(0,Math.min(1,fraction)));}
    }
    if(samples.length<64)throw new Error('หลังจัดเวลามีข้อมูลไม่ถึง 64 ค่า เลือกช่วงเวลานานขึ้น');
    const sampleRateHz=1000/dt,unit=definition.unit||String(options.unit||'a.u.');
    return{channels:{[axis]:samples},sampleRateHz,sampleCount:samples.length,timeSpanSeconds:(samples.length-1)/sampleRateHz,durationSeconds:samples.length/sampleRateHz,unit,source:'overall-trend',metric,axis,metricLabel:definition.label,timingSource:timing!=='strict'?'linear-resampled-pc-receive':'uniform-pc-receive',timingMode:timing,maxJitterPercent:maxJitter*100,receiveIntervalMs:dt,startTimestamp:new Date(start).toISOString(),endTimestamp:new Date(start+(samples.length-1)*dt).toISOString(),originalSampleCount:points.length,totalRecords:rows.length,excludedRecords:excluded,breakCount:breaks,segments:summaries,selectedSegment:selected,omittedRecords:rows.length-points.length,simulation:Boolean(options.simulation),motorId:options.motorId||'',runId:options.runId||''};
  }
  return Object.freeze({prepare,metrics,maxSamples});
});
