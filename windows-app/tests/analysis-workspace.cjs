'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {_electron:electron}=require('playwright');
const {normalizeConfig}=require('../electron/sensor-codec.cjs');
const {dayKey}=require('../electron/data-store.cjs');
(async()=>{
  const project=path.resolve(__dirname,'..'),root=path.join(project,'.test-tmp'),artifacts=path.join(project,'.artifacts');fs.mkdirSync(root,{recursive:true});fs.mkdirSync(artifacts,{recursive:true});
  const temporary=fs.mkdtempSync(path.join(root,'unified-analysis-')),start=Date.now()-15*60000;
  const config=normalizeConfig({motorId:'MTR-01',name:'Cooling water pump 01',path:'COM987',slaveId:1,sensorModel:'vemsee-sn3001-wz3a-n01',frequencyByteOrder:'ABCD',pollInterval:1000});
  const decodeConfig=Object.fromEntries(['sensorModel','registerType','registerAddress','dataType','byteOrder','scale','unit'].map(key=>[key,config[key]]));
  const runId='12345678-1234-4234-8234-123456789012',runStartedAt=new Date(start).toISOString();
  const rows=Array.from({length:602},(_,i)=>{
    const phase=i*.19,cluster=i<300?0:1;
    const xyz=[2+cluster*1.6+Math.sin(phase)*.5,2.5+cluster*.7+Math.cos(phase*.73)*.6,1.4+cluster*.6+Math.sin(phase*.43)*.45];
    const channels={temperature:32,frequencyX:50,frequencyY:50,frequencyZ:50};
    for(const[k,scale]of[['velocity',1],['displacement',12],['acceleration',.4]])['X','Y','Z'].forEach((a,j)=>channels[k+a]=xyz[j]*scale);
    if(i>=600)channels.velocityZ=null;
    return{schemaVersion:4,motorId:config.motorId,timestamp:new Date(start+i*1000).toISOString(),value:Math.max(...xyz),unit:'mm/s',sensorModel:config.sensorModel,port:config.path,slaveId:1,decodeConfig,source:'RS485 / Modbus RTU',runId,runStartedAt,recordingId:'87654321-4321-4321-8321-210987654321',recordingStartedAt:runStartedAt,pollIntervalMs:1000,frequencyStatus:'ok',channels};
  });
  fs.writeFileSync(path.join(temporary,'motors.json'),JSON.stringify([config]));fs.mkdirSync(path.join(temporary,'data'));const date=dayKey(new Date(start));fs.writeFileSync(path.join(temporary,'data',`readings-${date}.ndjson`),rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  let app;
  try{
    app=await electron.launch({...process.env.ELECTRON_EXECUTABLE?{executablePath:process.env.ELECTRON_EXECUTABLE,args:[]}:{args:['.'],cwd:project},env:{...process.env,TEMP:root,TMP:root,VECTRA_TEST_DATA:temporary}});
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForLoadState('domcontentloaded');await page.locator('#app-version').filter({hasText:`v${require('../package.json').version}`}).waitFor();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1366,768));
    await page.waitForFunction(()=>innerWidth===1366&&innerHeight===768);
    await page.locator('[data-tab="analysis"]').click();await page.waitForFunction(()=>document.querySelector('.history-range').dataset.loaded==='true'&&document.querySelector('#history-scatter-canvas').dataset.recordCount==='600');
    assert(await page.locator('#analysis-history').isVisible());assert(await page.locator('#analysis-waveform').isHidden());
    assert.equal(await page.locator('#history-view .history-range').count(),0,'historical graphs have one home in Analysis');
    assert((await page.locator('#range-summary').textContent()).includes('XYZ ไม่ครบ 2 รายการ'));
    assert((await page.locator('#history-scatter-caption').textContent()).includes('ไม่ใช่ตำแหน่งมอเตอร์หรือ FFT'));
    const canvas=page.locator('#history-scatter-canvas');await canvas.focus();await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('#history-scatter-canvas').dataset.selectedTimestamp);
    const selected=await canvas.getAttribute('data-selected-timestamp');assert.equal(selected,rows[599].timestamp);assert((await page.locator('#history-scatter-readout').textContent()).includes('X '));
    await page.locator('#analysis-history-run').selectOption(runId);await page.waitForFunction(()=>document.querySelector('.history-range').dataset.loaded==='true');assert.equal(await page.locator('#history-run').inputValue(),runId);
    await page.locator('#history-scatter-expand').click();await page.waitForFunction(()=>document.fullscreenElement?.id==='history-scatter-view'&&document.querySelector('#history-scatter-expand').getAttribute('aria-pressed')==='true');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.fullscreenElement&&document.querySelector('#history-scatter-expand').getAttribute('aria-pressed')==='false');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:path.join(artifacts,'analysis-scatter.png'),animations:'disabled'});
    await page.locator('#history-view-lines').click();await page.waitForFunction(()=>document.querySelector('.history-range').dataset.loaded==='true');assert.equal(await page.locator('#history-plots .measurement-plot:visible').count(),3);
    await page.locator('#analysis-source-waveform').click();assert(await page.locator('#spectral-empty').isVisible());assert(await page.locator('#analysis-history').isHidden());assert(await page.locator('#spectral-results').isHidden(),'scalar history cannot become FFT data');
    await page.locator('#analysis-source-history').click();await page.locator('#history-view-scatter').click();await page.waitForFunction(()=>document.querySelector('.history-range').dataset.loaded==='true');
    for(const[width,height]of[[960,680],[768,1024]]){await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[width,height]);await page.waitForFunction(size=>innerWidth===size[0]&&innerHeight===size[1],[width,height]);await canvas.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await canvas.evaluate(el=>el.clientWidth>400));if(width===768)await page.screenshot({path:path.join(artifacts,'analysis-scatter-768.png'),animations:'disabled'});}
    await page.locator('[data-tab="history"]').click();await page.locator('#history-summary').filter({hasText:'602 รายการ'}).waitFor();assert.equal(await page.locator('#history-view canvas').count(),0);
    await page.screenshot({path:path.join(artifacts,'history-records-only.png'),animations:'disabled'});
    const old=dayKey(new Date(start-2*86400000));
    await page.locator('#history-date').fill(old);await page.locator('#history-date').dispatchEvent('change');await page.locator('#history-end-date').fill(old);await page.locator('#history-end-date').dispatchEvent('change');
    await page.locator('#history-summary').filter({hasText:'0 รายการ'}).waitFor();assert(await page.locator('#history-body .empty-cell').isVisible());
    // A read failure must clear rows from the previously selected filter.
    await page.locator('#history-date').fill(date);await page.locator('#history-date').dispatchEvent('change');await page.locator('#history-end-date').fill(date);await page.locator('#history-end-date').dispatchEvent('change');await page.locator('#history-summary').filter({hasText:'602 รายการ'}).waitFor();
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('data:history');ipcMain.handle('data:history',()=>({ok:false,message:'fixture read error'}));});
    await page.locator('#load-history').click();await page.locator('#history-summary').filter({hasText:'fixture read error'}).waitFor();assert(await page.locator('#history-body .empty-cell').isVisible());assert(!(await page.locator('#history-body').textContent()).includes('MTR-01'));
    assert.deepEqual(errors,[]);console.log('PASS: unified historical analysis/FFT sources, XYZ scatter completeness, shared run filters, time plots, fullscreen, responsive layout, stale-date clearing and read-error recovery');
  }finally{if(app)await app.close();fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
