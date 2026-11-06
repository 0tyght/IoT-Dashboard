'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {_electron:electron}=require('playwright');
const {DataStore}=require('../electron/data-store.cjs');const {openPage}=require('./navigation.cjs');
(async()=>{
  const project=path.resolve(__dirname,'..'),base=path.join(project,'.test-tmp'),artifacts=path.join(project,'.artifacts','product-workflow');fs.mkdirSync(base,{recursive:true});fs.mkdirSync(artifacts,{recursive:true});
  const root=fs.mkdtempSync(path.join(base,'product-workflow-')),store=new DataStore(root),runId='6a3b6c20-2bac-4b02-824f-d764d994c01b',stamp=Date.now()-120000;
  store.saveProfiles([{motorId:'D1',name:'การสั่นฝั่งขับ',sensorModel:'vemsee-sn3001-wz3a-n01',path:'COM987',slaveId:1},{motorId:'C1',name:'อุณหภูมิห้อง',sensorModel:'custom',path:'COM987',slaveId:2}]);
  store.saveGroups([{id:'G1',name:'พื้นที่งานทดสอบการสั่นและอุปกรณ์ไฟฟ้า',modelEnabled:true,motorIds:['D1','C1'],meters:[{id:'PM1',name:'ไฟเข้ามอเตอร์',model:'pm2230',path:'COM987',slaveId:3}]}]);store.saveSelectedGroup('G1');
  const common={runId,runName:'ทดสอบโหลด 50%',groupId:'G1',groupName:'พื้นที่งานทดสอบการสั่นและอุปกรณ์ไฟฟ้า',recordingId:'R1',recorded:true,source:'MODBUS'};
  fs.mkdirSync(store.dataPath(),{recursive:true});const date=new Date(stamp+7*3600000).toISOString().slice(0,10),rows={readings:[],power:[],points:[]};
  for(let i=0;i<100;i++){
    const timestamp=new Date(stamp+i*1000).toISOString();
    rows.readings.push({...common,timestamp,motorId:'D1',value:i/10,unit:'mm/s',port:'COM987',slaveId:1,sensorModel:'vemsee-sn3001-wz3a-n01',channels:{velocityX:i/10,velocityY:1+i/10,velocityZ:2+i/10,temperature:25,displacementX:i,displacementY:i+1,displacementZ:i+2,accelerationX:i/5,accelerationY:i/4,accelerationZ:i/3,frequencyX:50,frequencyY:50.1,frequencyZ:49.9}});
    rows.power.push({...common,timestamp,meterId:'PM1',model:'pm2230',values:{voltageLLAvg:220,currentAvg:0,activePowerTotal:i/100},port:'COM987',slaveId:3});
    rows.points.push({...common,timestamp,sampleTimestamp:timestamp,sampleId:`S${i}`,deviceId:'C1',pointId:'P1',name:'อุณหภูมิ',unit:'°C',status:'ok',value:25+i/100,port:'COM987',slaveId:2});
  }
  for(const [kind,values]of Object.entries(rows))fs.writeFileSync(path.join(store.dataPath(),`${kind}-${date}.ndjson`),values.map(row=>JSON.stringify(row)).join('\n')+'\n');
  const diagnostics=path.join(store.runDataPath(runId),'diagnostics');fs.mkdirSync(diagnostics,{recursive:true});fs.writeFileSync(path.join(diagnostics,'events.ndjson'),JSON.stringify({runId,type:'attempt',deviceId:'PM1',outcome:'timeout',endedAt:new Date(stamp).toISOString(),frames:[{address:3018,count:2,outcome:'timeout'}]})+'\n');
  let app;
  try{
    app=await electron.launch({...process.env.ELECTRON_EXECUTABLE?{executablePath:process.env.ELECTRON_EXECUTABLE,args:[]}:{args:['.'],cwd:project},env:{...process.env,VECTRA_TEST_DATA:root,TEMP:base,TMP:base}});const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>document.querySelector('#app-version').textContent.length>1,{},{timeout:15000}).catch(async error=>{console.error('Boot errors',errors);throw error;});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1366,768));
    assert.equal(await page.locator('.app-nav [data-section]').count(),4);assert.equal(await page.locator('.app-nav [data-tab]').count(),0);
    await page.locator('button[data-section=records]').click();await page.locator('#run-catalog button').filter({hasText:'เปิดรอบ'}).waitFor();
    assert(await page.locator('#motor-sidebar').isHidden());assert(await page.locator('#edit-motor').isHidden());assert(await page.locator('#connect-all').isHidden());
    await page.locator('#run-catalog button').click();await page.locator('#run-data-status').filter({hasText:'100'}).waitFor();
    assert.equal(await page.locator('#run-device option').count(),3);assert.equal(await page.locator('#run-data-table tbody tr').count(),100);
    await page.screenshot({path:path.join(artifacts,'recorded-run.png')});
    await page.locator('#run-quality summary').click();await page.locator('#run-open-events').click();await page.locator('.record-event summary').filter({hasText:'PM1'}).waitFor();await page.getByRole('combobox',{name:'อุปกรณ์ในเหตุการณ์ของรอบ'}).selectOption('C1');await page.locator('.record-provenance-body p').filter({hasText:'ไม่มีเหตุการณ์ตรงตัวกรอง'}).waitFor();await page.locator('.record-provenance .dialog-header button').click();await page.locator('#run-quality summary').click();
    await page.locator('#run-device').selectOption('PM:PM1');await page.locator('#run-data-status').filter({hasText:'PM1'}).waitFor();await page.locator('#run-view-charts').click();assert(await page.locator('#run-data-charts svg').count()>1);assert.equal(await page.locator('#run-analyze').isHidden(),true);
    await page.locator('#run-device').selectOption('C1');await page.locator('#run-data-status').filter({hasText:'C1'}).waitFor();assert(await page.locator('#run-data-charts svg').count()===1);
    await page.locator('button[data-section=workspace]').click();await page.locator('[data-tab=fleet]').click();await page.locator('[data-node-id=D1]').click();await page.locator('#connection-dialog[open]').waitFor();assert(await page.locator('#save-motor').isVisible());await page.locator('#close-connection').click();
    await page.locator('button[data-section=library]').click();await page.locator('[data-tab=templates]').click();assert(await page.locator('#template-catalog').textContent().then(value=>value.includes('PM2230')));
    await page.locator('button[data-section=library]').click();await page.locator('[data-tab=motors]').click();
    const meterRow=page.locator('#motors-body tr').filter({hasText:'PM1'});await meterRow.getByRole('button',{name:'นำออกจากพื้นที่งาน…'}).click();await page.locator('#confirm-dialog[open]').waitFor();await page.locator('#accept-confirm').click();await page.locator('#connection-dialog').waitFor({state:'hidden'});
    assert.equal(store.loadGroups()[0].meters.length,0);assert.equal(store.loadMeterLibrary()[0].meter.id,'PM1');
    await page.locator('#motors-body tr').filter({hasText:'PM1'}).getByRole('button',{name:'แก้ไข',exact:true}).click();await page.locator('#sensor-form [name=name]').fill('มิเตอร์ในคลัง');await page.locator('#save-motor').click();await page.locator('#connection-dialog').waitFor({state:'hidden'});assert.equal(store.loadMeterLibrary()[0].meter.name,'มิเตอร์ในคลัง');
    await page.locator('#motors-body tr').filter({hasText:'PM1'}).getByRole('button',{name:'เพิ่มในพื้นที่งาน',exact:true}).click();await page.waitForFunction(()=>activeWorkspace().meters.length===1);assert.equal(store.loadGroups()[0].meters[0].name,'มิเตอร์ในคลัง');
    await page.locator('button[data-section=settings]').click();assert(await page.locator('#backup-all-settings').isVisible());
    const backupPath=path.join(root,'settings-backup.json');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filePath]});dialog.showMessageBox=async()=>({response:1});},backupPath);
    await page.locator('#backup-all-settings').click();await page.locator('#toast').filter({hasText:'สำรองการตั้งค่าทั้งหมดแล้ว'}).waitFor();const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(backup.format,'vectra-settings');assert.equal(backup.groups[0].meters.length,1);assert.equal(backup.meterProfiles.length,1);
    await page.locator('#restore-all-settings').click();await page.locator('#toast').filter({hasText:'กู้คืนการตั้งค่าแล้ว'}).waitFor();assert.equal(store.loadGroups()[0].meters[0].name,'มิเตอร์ในคลัง');
    await page.locator('button[data-section=settings]').click();await page.screenshot({path:path.join(artifacts,'program-settings.png')});
    for(const [width,height]of [[960,680],[768,1024],[1366,768],[1920,1080]]){
      await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[width,height]);await page.waitForFunction(size=>innerWidth===size[0]&&innerHeight===size[1],[width,height]);
      for(const [section,tab]of [['workspace','fleet'],['workspace','overview'],['workspace','monitor'],['workspace','registers'],['workspace','model'],['records','history'],['records','analysis'],['library','motors'],['library','templates'],['settings','settings'],['settings','events']]){
        await openPage(page,tab);assert(await page.locator(`#${tab}-view`).isVisible());
        const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth-innerWidth,main:document.querySelector('main').scrollWidth-document.querySelector('main').clientWidth}));assert(overflow.page<=1&&overflow.main<=1,`${tab} fits ${width}: ${JSON.stringify(overflow)}`);if(width===960)await page.screenshot({path:path.join(artifacts,`${tab}-960x680.png`)});
      }
      await page.locator('button[data-section=records]').click();await page.locator('[data-tab=history]').click();await page.screenshot({path:path.join(artifacts,`runs-${width}x${height}.png`)});
    }
    assert.deepEqual(errors,[]);console.log('PASS: contextual navigation, three device types in one recorded run, historical charts, templates and all eleven views at four sizes');
  }finally{if(app)await app.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
