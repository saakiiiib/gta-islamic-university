import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const url=process.argv[2]??'https://saakiiiib.github.io/gta-islamic-university/';
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={url,checkedAt:new Date().toISOString(),profiles:[],passed:false};
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext(mobile?{viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2,
      userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'}:{viewport:{width:1365,height:768}});
    const page=await context.newPage(),errors=[],failed=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('response',response=>{if(response.status()>=400)failed.push({url:response.url(),status:response.status()});});
    await page.goto(url,{waitUntil:'networkidle',timeout:120000});
    await page.waitForFunction(()=>!document.querySelector('#start-button').disabled,{timeout:120000});
    assert.ok((await page.locator('.edition').textContent()).includes('PHASE 3'));
    await page.locator('#start-button').click();
    await page.waitForFunction(()=>document.body.dataset.gameState==='playing');
    await page.waitForTimeout(20000);
    const state=await page.locator('#game').evaluate(canvas=>({...canvas.dataset}));
    assert.equal(state.inputMode,mobile?'touch':'desktop');assert.ok(+state.nearbyNpcs>=10);assert.ok(+state.movingVans>=2);
    if(mobile)assert.ok(await page.locator('#touch-stick').isVisible());
    else{
      const before=state.position.split(',').map(Number);
      await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');await page.waitForTimeout(300);
      const after=(await page.locator('#game').getAttribute('data-position')).split(',').map(Number);
      assert.ok(Math.hypot(after[0]-before[0],after[2]-before[2])>1);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
    await page.screenshot({path:`validation/phase3/hosted-${mobile?'mobile':'desktop'}.png`});
    report.profiles.push({mobile,state,errors,failed});await context.close();
  }
  report.passed=true;
}finally{
  await browser.close();await writeFile('validation/phase3/hosted-browser.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
