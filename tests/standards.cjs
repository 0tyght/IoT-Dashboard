const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});try{const page=await browser.newPage();await page.goto(process.env.TEST_URL||'http://127.0.0.1:8080');await page.locator('#pause').click();
// Zone D must outrank a higher raw reading in Zone C of a different class.
const cases=[{cls:0,value:5},{cls:3,value:17}];
assert.deepEqual(await page.evaluate(items=>{const zone=m=>limits[m.cls].filter(v=>m.value>=v).length;return items.sort((a,b)=>zone(b)-zone(a)||b.value/limits[b.cls][2]-a.value/limits[a.cls][2]).map(m=>m.value);},cases),[5,17]);
await page.evaluate(()=>{motors[0].value=60;select(0)});assert.match(await page.locator('#chart-selection').innerText(),/เกินช่วงกราฟ/);assert.match(await page.locator('#inspector-status').innerText(),/เกินช่วงกราฟ/);assert.match(await page.locator('#chart .chart-point').first().textContent(),/↓/);
const order=await page.locator('#alerts .alert-row').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.index)));const expected=await page.evaluate(()=>motors.map((m,i)=>({...m,i})).filter(m=>state(m)>=2).sort((a,b)=>state(b)-state(a)||b.value/limits[b.cls][2]-a.value/limits[a.cls][2]).map(m=>m.i));assert.deepEqual(order,expected);
for(let cls=0;cls<4;cls++)for(let zone=0;zone<3;zone++){assert.equal(await page.evaluate(({cls,zone})=>state({cls,value:limits[cls][zone]}),{cls,zone}),zone+1);}
await page.evaluate(()=>localStorage.setItem('vectra.motors.v1','{broken'));await page.reload();assert.equal(await page.locator('.motor-pin').count(),0);assert.equal(await page.locator('#motor-total').innerText(),'0');assert.equal(await page.evaluate(()=>localStorage.getItem('vectra.motors.v1')),'{broken');assert.match(await page.locator('#storage-banner').innerText(),/อ่านข้อมูล/);
console.log('PASS: zone priority, 12 threshold boundaries, overflow notice, corrupt registry preserved without demo fallback');}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

