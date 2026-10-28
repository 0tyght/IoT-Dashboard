'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {_electron:electron}=require('playwright');
(async()=>{
  const project=path.resolve(__dirname,'..'),base=path.join(project,'.test-tmp');fs.mkdirSync(base,{recursive:true});
  const temporary=fs.mkdtempSync(path.join(base,'power-ui-'));
  fs.writeFileSync(path.join(temporary,'motors.json'),JSON.stringify([{path:'COM8',motorId:'MTR-01',sensorModel:'vemsee-sn3001-wz3a-n01',slaveId:1}]));
  let app;
  try{
    app=await electron.launch({...process.env.ELECTRON_EXECUTABLE?{executablePath:process.env.ELECTRON_EXECUTABLE,args:[]}:{args:['.'],cwd:project},env:{...process.env,TEMP:base,TMP:base,VECTRA_TEST_DATA:temporary}});
    const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
    await page.locator('#app-version').filter({hasText:`v${require('../package.json').version}`}).waitFor();
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('power:test-register');ipcMain.handle('power:test-register',(_event,profile,options)=>({ok:true,path:profile.path,...options,raw:[0x42c8,0]}));});
    await page.locator('[data-tab="power"]').click();await page.locator('.power-diagnostic summary').click();
    await page.locator('#power-test-button').click();
    await page.locator('#power-test-result').filter({hasText:'ABCD: 100'}).waitFor();
    assert((await page.locator('#power-test-result').textContent()).includes('ยังไม่ยืนยัน'));
    assert((await page.locator('#power-test-result').textContent()).includes('0x42C8 0x0000'));
    assert((await page.locator('.power-measurements').textContent()).includes('—'),'candidate must not be displayed as confirmed measurement');
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('power:test-register');ipcMain.handle('power:test-register',()=>({ok:false,message:'fixture timeout'}));});
    await page.locator('#power-test-button').click();await page.locator('#power-test-result').filter({hasText:'fixture timeout'}).waitFor();
    console.log('PASS: read-only power test reports raw words, unconfirmed float candidates and errors');
  }finally{if(app)await app.close();assert.equal(path.dirname(temporary),base);assert(path.basename(temporary).startsWith('power-ui-'));fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
