const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const data=require('../motor-data.js');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.TEST_URL||'http://127.0.0.1:8080';await page.goto(base);await page.waitForSelector('.motor-pin');
 assert.equal(await page.locator('.motor-pin').count(),12);
 // A live refresh must not destroy the node the user is about to click.
 const pin=await page.locator('.motor-pin').first().elementHandle();await page.waitForTimeout(2200);assert.equal(await pin.evaluate(el=>el.isConnected),true);
 await page.locator('.motor-pin[data-index="6"]').click();assert.equal(await page.locator('#inspector-title').innerText(),'MTR-07');assert.equal(await page.locator('#chart .chart-point').count(),12);await page.locator('#close-inspector').click();
 await page.locator('[data-view="motors"]').click();await page.locator('#add-motor').click();
 const f=page.locator('#motor-form');
 await f.locator('[name="id"]').fill('QA-MOTOR');await f.locator('[name="label"]').fill('ปั๊มทดสอบ <tag>');await f.locator('[name="name"]').fill('Cooling pump');await f.locator('[name="zone"]').fill('QA');await f.locator('[name="cls"]').selectOption('2');await f.locator('[name="base"]').fill('5.50');await f.locator('[name="x"]').fill('47.5');await f.locator('[name="y"]').fill('48');
 for(const [key,value] of Object.entries({manufacturer:'CMG',model:'HGA112M-4',motorType:'THREE PHASE ASYNCHRONOUS MOTOR',standard:'IEC 60034',duty:'S1',insulation:'F',ip:'55',efficiencyClass:'EFF1',bearingDE:'6306-C3',bearingNDE:'6306-C3',serial:'QA-123',weight:'54',ambient:'40'}))await f.locator(`[name="plate-${key}"]`).fill(value);
 for(let i=0;i<3;i++){if(i)await page.locator('#add-rating').click();const row=page.locator('#rating-rows tr').nth(i);for(const [k,v] of Object.entries({voltage:['380–415','660–720','440–480'][i],connection:i===1?'STAR':'DELTA',hz:i===2?'60':'50',kw:i===2?'4.6':'4',rpm:i===2?'1740':'1450',amps:i===1?'4.7':'8.1',pf:'0.80',efficiency:'88.3'}))await row.locator(`[data-rating="${k}"]`).fill(v);}
 await f.getByRole('button',{name:'บันทึกมอเตอร์',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#motor-editor').open);assert.equal(await page.locator('.motor-card').count(),13);assert.equal(await page.locator('.motor-pin').count(),13);
 await page.reload();await page.locator('[data-view="motors"]').click();await page.locator('#motor-search').fill('QA-MOTOR');assert.equal(await page.locator('.motor-card').count(),1);assert.match(await page.locator('.motor-card').innerText(),/ปั๊มทดสอบ <tag>/);
 await page.locator('[data-action="plate"]').click();assert.equal(await page.locator('#nameplate-content tbody tr').count(),3);assert.match(await page.locator('#nameplate-content').innerText(),/HGA112M-4/);await page.screenshot({path:'.artifacts/nameplate.png'});await page.locator('[data-close="nameplate-dialog"]').click();
 await page.locator('[data-action="edit"]').click();await f.locator('[name="id"]').fill('MTR-01');await f.getByRole('button',{name:'บันทึกมอเตอร์',exact:true}).click();assert.equal(await page.locator('#form-error').isVisible(),true);assert.equal(await page.locator('#motor-editor').isVisible(),true);
 await f.locator('[name="id"]').fill('QA-EDIT');await f.locator('[name="label"]').fill('ปั๊มน้ำชุดใหม่');await f.locator('[name="cls"]').selectOption('1');await f.getByRole('button',{name:'บันทึกมอเตอร์',exact:true}).click();await page.locator('#motor-search').fill('QA-EDIT');assert.equal(await page.locator('.motor-card').count(),1);
 await page.locator('[data-action="locate"]').click();assert.equal(await page.locator('#inspector-title').innerText(),'ปั๊มน้ำชุดใหม่');assert.match(await page.locator('#inspector-class').innerText(),/Class II/);await page.locator('#close-inspector').click();await page.locator('[data-view="motors"]').click();
 await page.locator('[data-action="delete"]').click();await page.locator('#confirm-action').click();assert.equal(await page.locator('.motor-pin').count(),12);await page.locator('#undo-delete').click();assert.equal(await page.locator('.motor-pin').count(),13);
 // Empty imports are valid and must not crash gauges, details, or the inspector.
 await page.locator('#import-file').setInputFiles({name:'empty.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,motors:[]}))});await page.locator('#confirm-action').click();assert.equal(await page.locator('.motor-pin').count(),0);assert.equal(await page.locator('#motor-total').innerText(),'0');await page.reload();assert.equal(await page.locator('.motor-pin').count(),0);await page.locator('[data-view="motors"]').click();await page.locator('#add-motor').click();await f.locator('[name="label"]').fill('Restart motor');await f.getByRole('button',{name:'บันทึกมอเตอร์',exact:true}).click();assert.equal(await page.locator('.motor-pin').count(),1);
 const saved=await page.evaluate(()=>localStorage.getItem('vectra.motors.v1'));assert.equal(data.parseBackup(saved).length,1);
 // Invalid backups must be rejected before replacing valid data.
 await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"motors":[{}]}')});assert.match(await page.locator('#toast-text').innerText(),/นำเข้าไม่ได้/);assert.equal(await page.evaluate(()=>localStorage.getItem('vectra.motors.v1')),saved);
 // Fresh context for responsive review, without touching the user's stored records.
 const responsive=await browser.newContext();const r=await responsive.newPage();await r.goto(base);const results=[];
 for(const [width,height] of [[320,740],[768,1024],[820,1180],[1024,768],[1180,820],[1366,768],[1920,1080],[2560,1440],[3840,2160]]){await r.setViewportSize({width,height});for(const view of ['overview','motors']){await r.locator(`[data-view="${view}"]`).click();const overflow=await r.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`Page overflow at ${width}, ${view}`);}results.push([width,height]);}
 await r.setViewportSize({width:820,height:1180});await r.screenshot({path:'.artifacts/registry-ipad.png',fullPage:true});await r.locator('#add-motor').click();await r.screenshot({path:'.artifacts/editor-ipad.png'});await r.locator('[data-close="motor-editor"]').first().click();
 await r.setViewportSize({width:1366,height:900});await r.screenshot({path:'.artifacts/registry-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:'Stable live targets, side inspector, add, 3 electrical ratings, escaped label, reload persistence, duplicate ID, edit, locate, delete/undo, empty registry, restore from empty, invalid import, responsive overview and registry',viewports:results},null,2));await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
