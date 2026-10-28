'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {_electron:electron}=require('playwright');
const {DataStore}=require('../electron/data-store.cjs');
(async()=>{
  const project=path.resolve(__dirname,'..'),base=path.join(project,'.test-tmp');fs.mkdirSync(base,{recursive:true});
  const root=fs.mkdtempSync(path.join(base,'workflow-ui-')),store=new DataStore(root);
  store.saveGroups([{id:'G1',name:'ชุดมิเตอร์หนึ่ง',motorIds:[],meters:[{id:'PM4',name:'มิเตอร์ 4',path:'COM8',slaveId:4}]},{id:'G2',name:'ชุดมิเตอร์สอง',motorIds:[],meters:[{id:'PM5',name:'มิเตอร์ 5',path:'COM9',slaveId:5}]}]);store.saveSelectedGroup('G1');
  let app;try{
    app=await electron.launch({...process.env.ELECTRON_EXECUTABLE?{executablePath:process.env.ELECTRON_EXECUTABLE,args:[]}:{args:['.'],cwd:project},env:{...process.env,TEMP:base,TMP:base,VECTRA_TEST_DATA:root}});
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForLoadState('domcontentloaded');await page.locator('#app-version').filter({hasText:`v${require('../package.json').version}`}).waitFor();
    assert(await page.locator('#power-view').isVisible(),'meter-only selected group opens its power readings');
    assert.equal(await page.locator('#power-selected-point').textContent(),'มิเตอร์ 4');
    assert((await page.locator('#power-test-device option:checked').textContent()).includes('ID 4'));
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('power:test-meter');ipcMain.handle('power:test-meter',(_event,groupId,meterId,options)=>{globalThis.testMeterArgs={groupId,meterId,options};return {ok:true,path:'COM8',slaveId:4,address:options.address,raw:[0x42c8,0]};});});
    await page.locator('.power-diagnostic summary').click();await page.locator('#power-test-button').click();await page.locator('#power-test-result').filter({hasText:'Slave 4'}).waitFor();
    assert.deepEqual(await app.evaluate(()=>globalThis.testMeterArgs),{groupId:'G1',meterId:'PM4',options:{address:3019,registerType:'holding'}});
    await page.locator('[data-tab="fleet"]').click();assert.equal(await page.locator('#flow-group-select').inputValue(),'G1');await page.locator('#flow-group-select').selectOption('G2');await page.waitForFunction(()=>document.querySelector('#flow-group-select').value==='G2'&&document.querySelector('[data-node-id="PM5"]'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'selected-group.json'),'utf8')).id,'G2');
    await app.close();app=await electron.launch({...process.env.ELECTRON_EXECUTABLE?{executablePath:process.env.ELECTRON_EXECUTABLE,args:[]}:{args:['.'],cwd:project},env:{...process.env,TEMP:base,TMP:base,VECTRA_TEST_DATA:root}});
    const restarted=await app.firstWindow();restarted.on('pageerror',error=>errors.push(error.message));await restarted.locator('#app-version').filter({hasText:`v${require('../package.json').version}`}).waitFor();await restarted.locator('#power-selected-point').filter({hasText:'มิเตอร์ 5'}).waitFor();assert(await restarted.locator('#power-view').isVisible());
    assert.deepEqual(errors,[]);console.log('PASS: selected measurement set persists, meter-only startup, direct meter diagnostics and visible set selection');
  }finally{if(app)await app.close();assert.equal(path.dirname(root),base);fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
