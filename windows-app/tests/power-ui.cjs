'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {_electron:electron}=require('playwright');
const {DataStore}=require('../electron/data-store.cjs');const {randomUUID}=require('node:crypto');
(async()=>{
  const project=path.resolve(__dirname,'..'),base=path.join(project,'.test-tmp');fs.mkdirSync(base,{recursive:true});
  const temporary=fs.mkdtempSync(path.join(base,'power-ui-'));
  fs.writeFileSync(path.join(temporary,'motors.json'),JSON.stringify([{path:'COM8',motorId:'MTR-01',sensorModel:'vemsee-sn3001-wz3a-n01',slaveId:1}]));
  const store=new DataStore(temporary);store.saveGroups([{id:'G1',name:'ชุดบันทึก',motorIds:['MTR-01'],meters:[{id:'PM1',model:'pm2230',path:'COM8',slaveId:3}]}]);store.saveSelectedGroup('G1');
  const stamp=new Date().toISOString(),runId=randomUUID();await new DataStore(temporary).appendPower({timestamp:stamp,runId,recordingId:randomUUID(),groupId:'G1',groupName:'ชุดบันทึก',meterId:'PM1',path:'COM8',slaveId:3,byteOrder:'unconfirmed',quality:'unconfirmed',raw:{voltageAB:[0x42c8,0]},values:{voltageAB:null}});
  let app;
  try{
    app=await electron.launch({...process.env.ELECTRON_EXECUTABLE?{executablePath:process.env.ELECTRON_EXECUTABLE,args:[]}:{args:['.'],cwd:project},env:{...process.env,TEMP:base,TMP:base,VECTRA_TEST_DATA:temporary}});
    const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
    await page.locator('#app-version').filter({hasText:`v${require('../package.json').version}`}).waitFor();
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('power:test-meter');ipcMain.handle('power:test-meter',(_event,groupId,meterId,options)=>({ok:true,path:'COM8',slaveId:3,...options,raw:[0x42c8,0]}));});
    const picker=page.locator('#reading-device');
    if(await picker.isVisible()) await picker.selectOption('meter:PM1');
    else await page.locator('#motor-sidebar [data-meter-id="PM1"]').click();
    assert(await page.locator('#monitor-view').isVisible());
    await page.locator('.power-diagnostic summary').click();

    await page.locator('#power-test-button').click();
    await page.locator('#power-test-result').filter({hasText:'ABCD: 100'}).waitFor();
    assert((await page.locator('#power-test-result').textContent()).includes('ยังไม่ยืนยัน'));
    assert((await page.locator('#power-test-result').textContent()).includes('0x42C8 0x0000'));
    assert(await page.locator('.power-live').isHidden(),'candidate must not be displayed as confirmed measurement');
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('power:test-meter');ipcMain.handle('power:test-meter',()=>({ok:false,message:'fixture timeout'}));});
    await page.locator('#power-test-button').click();await page.locator('#power-test-result').filter({hasText:'fixture timeout'}).waitFor();
    await page.locator('#power-open-history').click();await page.locator('#run-data-status').filter({hasText:'PM1'}).waitFor();assert((await page.locator('#run-detail-info').textContent()).includes('ชุดบันทึก'));await page.locator('#run-data-table button').first().click();await page.locator('.record-provenance').waitFor();await page.getByText('17096 (0x42C8)',{exact:false}).waitFor();await page.locator('.record-provenance .dialog-header button').click();
    assert(await page.locator('#history-view').isVisible());
    console.log('PASS: read-only power test reports raw words, unconfirmed float candidates and errors');
  }finally{if(app)await app.close();assert.equal(path.dirname(temporary),base);assert(path.basename(temporary).startsWith('power-ui-'));fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
