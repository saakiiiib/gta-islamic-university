import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const url = process.argv[2] ?? 'http://127.0.0.1:5176/';
const output = resolve('validation/phase3'); await mkdir(output,{recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const results = [];
try {
  for (const mobile of [false,true]) {
    const context = await browser.newContext(mobile ? {viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2,
      userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'} : {viewport:{width:1365,height:768}});
    const page = await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/src/main.js*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:await response.text()+`\n
globalThis.__controlsQA={
  get initialized(){return !!camera&&!!simulation&&!!hud;},
  snapshot(){return {state,position:player.position.toArray(),vertical:player.velocity.y,health:player.health,yaw:chase.yaw,speed:player.speed,
    driving:simulation.session.driving,vanSpeed:simulation.session.van?.speed??0,playerVisible:player.group.visible,drivers:simulation.occupants.drivers.length,
    pointers:touch?.pointers.size??0,mode:touch?.mode,moveX:touch?.moveX??0,moveZ:touch?.moveZ??0,dpr:renderer.getPixelRatio(),touch:device.touch,
    assets:world.assetState,audioClips:reactions.clips.size,audioState:reactions.context?.state,autonomous:simulation.session.van?.autonomous??false};},
  approach(){const v=simulation.vans[0],x=v.position.x-1.5*Math.cos(v.yaw)-.4*Math.sin(v.yaw),z=v.position.z+1.5*Math.sin(v.yaw)-.4*Math.cos(v.yaw);
    player.teleport({x,y:simulation.queries.groundHeight(x,z),z},v.yaw);input.clear();chase.reset({x,z,yaw:v.yaw});}
};\n`});
    });
    await page.goto(url,{waitUntil:'networkidle',timeout:120000});
    await page.waitForFunction(()=>globalThis.__controlsQA?.initialized,{timeout:120000});
    await page.locator('#start-button').click();
    await page.waitForFunction(()=>document.body.dataset.gameState==='playing');
    await page.waitForTimeout(500);
    const before=await page.evaluate(()=>__controlsQA.snapshot()), checks={};
    assert.equal(before.touch,mobile);
    const cdp=mobile?await context.newCDPSession(page):null;
    const point=async selector=>{const b=await page.locator(selector).boundingBox();assert.ok(b,selector);return {x:b.x+b.width/2,y:b.y+b.height/2};};
    const send=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:5,radiusY:5,force:1}))});
    const hold=async(selector,ms)=>{const p=await point(selector);await send('touchStart',[{...p,id:3}]);await page.waitForTimeout(ms);await send('touchEnd',[]);};
    if(mobile){
      const stick=await point('#touch-stick'),look={x:600,y:170};
      await send('touchStart',[{...stick,id:1},{...look,id:2}]);
      for(let i=1;i<=8;i++){await send('touchMove',[{x:stick.x,y:stick.y-42,id:1},{x:look.x+i*12,y:look.y,id:2}]);await page.waitForTimeout(70);}
      const active=await page.evaluate(()=>__controlsQA.snapshot());assert.equal(active.pointers,2);checks.simultaneousPointers=active.pointers;
      await send('touchEnd',[]);
      assert.ok(Math.hypot(active.position[0]-before.position[0],active.position[2]-before.position[2])>.5);
      assert.ok(Math.abs(active.yaw-before.yaw)>.1);checks.moveAndLook=true;
      await page.locator('[data-touch-action="jump"]').tap();await page.waitForTimeout(140);
      assert.ok((await page.evaluate(()=>__controlsQA.snapshot())).position[1]>.2);checks.jump=true;
      await page.waitForTimeout(750);
      await page.locator('[data-touch-action="sprint"]').tap();
      await send('touchStart',[{x:stick.x,y:stick.y-50,id:1}]);await page.waitForTimeout(1000);
      assert.ok((await page.evaluate(()=>__controlsQA.snapshot())).speed>4.5);checks.sprint=true;
      await send('touchEnd',[]);
      await page.locator('[data-touch-action="pause"]').tap();
    } else {
      await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
      const walking=await page.evaluate(()=>__controlsQA.snapshot());
      assert.ok(Math.hypot(walking.position[0]-before.position[0],walking.position[2]-before.position[2])>1);checks.walk=true;
      await page.keyboard.press('Space');await page.waitForTimeout(140);assert.ok((await page.evaluate(()=>__controlsQA.snapshot())).position[1]>.2);checks.jump=true;
      await page.keyboard.press('Escape');
    }
    await page.waitForFunction(()=>document.body.dataset.gameState==='paused');
    const paused=await page.evaluate(()=>__controlsQA.snapshot());assert.equal(paused.pointers,0);checks.pauseClears=true;
    await page.locator('#resume-button').click();await page.waitForFunction(()=>document.body.dataset.gameState==='playing');
    await page.evaluate(()=>__controlsQA.approach());await page.waitForTimeout(250);
    if(mobile)await page.locator('[data-touch-action="interact"]').tap();else await page.keyboard.press('e');
    await page.waitForTimeout(200);
    let riding=await page.evaluate(()=>__controlsQA.snapshot());assert.equal(riding.driving,true);assert.ok(riding.playerVisible&&riding.drivers===8);checks.occupants=true;
    if(mobile)await hold('[data-touch-action="accelerate"]',1700);else{await page.keyboard.down('w');await page.waitForTimeout(1700);await page.keyboard.up('w');}
    riding=await page.evaluate(()=>__controlsQA.snapshot());assert.ok(Math.abs(riding.vanSpeed)>.5,`drive speed ${riding.vanSpeed}`);checks.driveSpeed=riding.vanSpeed;
    if(mobile)await page.locator('[data-touch-action="interact"]').tap();else await page.keyboard.press('e');
    await page.waitForTimeout(180);
    const exit=await page.evaluate(()=>__controlsQA.snapshot());assert.equal(exit.driving,false);assert.ok(exit.playerVisible&&exit.drivers===8&&exit.autonomous);checks.movingExit=true;
    await page.waitForTimeout(1700);assert.ok((await page.evaluate(()=>__controlsQA.snapshot())).position[1]<.1);checks.landing=true;
    if(mobile){
      assert.ok(exit.dpr<=1.25);await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);checks.portraitNoOverflow=true;
      await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
    }
    await page.screenshot({path:resolve(output,`${mobile?'mobile':'desktop'}-controls.png`)});
    const last=await page.evaluate(()=>__controlsQA.snapshot());assert.equal(last.assets.failed.length,0);assert.equal(last.audioClips,4);assert.deepEqual(errors,[]);
    results.push({mobile,checks,last,errors,notes:mobile?'Chrome touch/iPhone viewport emulation; not physical iOS Safari':'Temporary headless desktop Chrome'});
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await writeFile(resolve(output,'controls-browser.json'),JSON.stringify(results,null,2));
} finally {await browser.close();}
