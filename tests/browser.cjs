const assert=require('node:assert/strict');
const outputDir=require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'digilight-test-'));
// Start a static server on port 8766 from the repository root before running.

const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.DIGILIGHT_BROWSER || undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1350,height:900},acceptDownloads:true});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const settle=async()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,30)))));
const pixels=()=>page.evaluate(()=>{__bench.render();return __bench.canvas.toDataURL()});
const setting=k=>page.evaluate(k=>__bench.state[k],k);
const slider=async(id,v)=>{await page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},v);await settle();};
await page.goto('http://127.0.0.1:8766');await page.waitForFunction(()=>window.__bench&&window.__studio);await settle();assert.equal(await page.locator('#err').textContent(),'');console.log('PASS boot and shader compilation');
const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');for(let y=0;y<300;y++)for(let a=0;a<240;a++){const v=120+40*Math.sin(a*.35)+25*Math.cos(y*.19);x.fillStyle=`rgb(${v},${v*.7},${v*.5})`;x.fillRect(a,y,1,1);}return c.toDataURL().split(',')[1];});
await page.locator('#file').setInputFiles({name:'painting.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});await page.waitForFunction(()=>__bench.canvas.width===240);await settle();
console.log('PASS uploaded image automatic setup');
await page.selectOption('#lightingPreset','Raking light');await settle();const after=await pixels();
await page.click('#compare');await settle();const before=await pixels();assert.notEqual(after,before);assert.equal(await setting('viewMode'),4);
await page.click('#compare');await settle();assert.equal(await pixels(),after);
await page.click('#splitView');await settle();assert.equal(await setting('compareSplit'),.5);assert.notEqual(await pixels(),after);await page.click('#splitView');
console.log('PASS original toggle and split pixels');
await slider('fineRelief',1.7);assert.equal(await setting('fineRelief'),1.7);await page.click('#undo');await settle();assert.notEqual(await setting('fineRelief'),1.7);await page.click('#redo');await settle();assert.equal(await setting('fineRelief'),1.7);
console.log('PASS slider undo redo');
await page.getByRole('button',{name:'Duplicate',exact:true}).click();await settle();assert.equal((await setting('lights')).length,2);await page.click('#undo');await settle();assert.equal((await setting('lights')).length,1);await page.click('#redo');await settle();assert.equal((await setting('lights')).length,2);
const box=await page.locator('#gl').boundingBox();let h=await page.locator('.handle').last().boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:6});await page.mouse.up();await settle();assert.ok(Math.abs((await setting('lights'))[1].x-.7)<.02);
await page.click('#undo');await settle();assert.notEqual((await setting('lights'))[1].x,.7);
console.log('PASS duplicate lights, dragging and gesture undo');
await page.getByText('Local texture correction',{exact:true}).click();await page.click('#brushRemove');const preBrush=await pixels();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5,{steps:8});await page.mouse.up();await settle();assert.equal((await setting('strokes')).length,1);assert.notEqual(await pixels(),preBrush);await page.click('#undo');await settle();assert.equal((await setting('strokes')).length,0);assert.equal(await pixels(),preBrush);await page.click('#redo');await settle();assert.equal((await setting('strokes')).length,1);
console.log('PASS relief brush pixels and undo redo');
await page.click('#brushAdd');await page.click('#compare');assert.ok(await page.locator('.handle').first().isVisible());{const hb=await page.locator('.handle').first().boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.up();}await settle();assert.equal(await setting('viewMode'),0);assert.ok(!(await page.locator('#wrap').getAttribute('class')||'').includes('brushing'));
await page.click('#showHandles');assert.ok(!(await page.locator('.handle').first().isVisible()));await page.click('#showHandles');assert.ok(await page.locator('.handle').first().isVisible());
await slider('fineRelief',1.3);await page.click('#openPhoto');await settle();assert.equal(await setting('fineRelief'),1.3);
await page.locator('#file').setInputFiles({name:'again.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});await page.waitForFunction(()=>__bench.state.fineRelief!==1.3);await page.click('#undo');await settle();assert.equal(await setting('fineRelief'),1.3);
console.log('PASS light dots override compare/brush; reopening keeps edits; new photo undoable');
await page.getByText('My reusable presets',{exact:true}).click();await page.fill('#presetName','My gallery look');const presetStrength=await setting('fineRelief');await page.click('#savePreset');await page.waitForFunction(()=>document.querySelector('#presetStatus').textContent.startsWith('Saved'));
await slider('fineRelief',.15);await page.click('#applyPreset');await settle();assert.equal(await setting('fineRelief'),presetStrength);await page.click('#undo');await settle();assert.equal(await setting('fineRelief'),.15);await page.click('#redo');await settle();assert.equal(await setting('fineRelief'),presetStrength);
await page.check('#defaultPreset');await page.waitForFunction(()=>document.querySelector('#presetStatus').textContent.startsWith('This preset'));
const presetDownload=page.waitForEvent('download');await page.click('#downloadPreset');const presetFile=await presetDownload;await presetFile.saveAs(outputDir + '/preset.json');
await slider('fineRelief',.25);await page.locator('#file').setInputFiles({name:'next-painting.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});await page.waitForFunction(v=>__bench.state.fineRelief===v,presetStrength);assert.equal(await setting('strokes').then(s=>s.length),0);
await page.uncheck('#defaultPreset');await page.locator('#presetFile').setInputFiles(outputDir + '/preset.json');await page.waitForFunction(()=>document.querySelector('#presetStatus').textContent.startsWith('Imported'));assert.equal(await setting('fineRelief'),presetStrength);assert.equal(await page.locator('#userPresetList option').count(),3);console.log('PASS reusable preset save/apply/undo/default/download/import');
await page.getByText('Projects & variations',{exact:true}).click();await page.fill('#projectName','Test painting');await page.click('#saveProject');await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent.startsWith('Saved in'));const saved=await page.evaluate(()=>__studio.snapshot());
await slider('fineRelief',.1);await page.click('#loadProject');await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent==='Project opened.');await settle();assert.deepEqual(await page.evaluate(()=>__studio.snapshot()),saved);
await page.click('#saveVariation');await page.waitForFunction(()=>document.querySelector('#projectList').options.length===3);console.log('PASS save/open and variations with photo and mask');
const projectDownload=page.waitForEvent('download');await page.click('#downloadProject');const projectFile=await projectDownload;await projectFile.saveAs(outputDir + '/project.json');
await slider('fineRelief',.2);await page.locator('#projectFile').setInputFiles(outputDir + '/project.json');await page.waitForFunction(()=>__bench.state.fineRelief!==.2);await settle();assert.equal(await setting('fineRelief'),saved.fineRelief);console.log('PASS portable project import/export');
await page.click('#compare');const download=page.waitForEvent('download');await page.click('#exportBtn');const image=await download;await image.saveAs(outputDir + '/export.png');await page.waitForFunction(()=>!__bench.state.exporting&&!document.querySelector('#exportBtn').disabled);assert.equal(await setting('viewMode'),4);await page.click('#compare');await settle();
assert.equal(await page.locator('#err').textContent(),'');console.log('PASS PNG export from Before view and preview restoration');
const pngBytes=require('fs').readFileSync(outputDir + '/export.png').toString('base64');
const difference=await page.evaluate(async b=>{const im=new Image();await new Promise(r=>{im.onload=r;im.src='data:image/png;base64,'+b});__bench.render();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const a=x.getImageData(0,0,c.width,c.height).data;x.drawImage(__bench.canvas,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-d[i]);return {mean:sum/a.length,width:im.width,height:im.height};},pngBytes);
assert.deepEqual([difference.width,difference.height],[240,300]);assert.ok(difference.mean<1,JSON.stringify(difference));console.log('PASS export matches relit preview',difference);
const tiledDifference=await page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,240,300).data;__bench.state.maxTile=160;const tiled=await __bench.exportFullRes();const b=tiled.getContext('2d').getImageData(0,0,240,300).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});assert.ok(tiledDifference<1,'Tile difference '+tiledDifference);console.log('PASS multi-tile export with brush mask',tiledDifference);
await page.selectOption('#exportFmt','image/jpeg');await slider('exportScale',50);const jpegDownload=page.waitForEvent('download');await page.click('#exportBtn');const jpeg=await jpegDownload;await jpeg.saveAs(outputDir + '/export.jpg');await page.waitForFunction(()=>!__bench.state.exporting&&!document.querySelector('#exportBtn').disabled);console.log('PASS scaled JPEG export');
// Calibrated relief: quick setup, photo lighting and texture depth, all undoable.
await page.selectOption('#surfacePreset','Palette-knife impasto');await settle();assert.equal(await setting('textureDepthMm'),3.5);assert.equal(await setting('physical'),1);assert.equal(await setting('reliefScale'),4.5);
await page.click('#photoCompass button[data-dir=l]');await settle();assert.equal(await setting('photoDiffuse'),0);assert.equal(await setting('azimuthDeg'),180);
await page.click('#photoCompass button[data-dir=even]');await settle();assert.equal(await setting('photoDiffuse'),0.6);
const preDepth=await pixels();await slider('textureDepthMm',6);assert.equal(await setting('textureDepthMm'),6);assert.notEqual(await pixels(),preDepth);await page.click('#undo');await settle();assert.equal(await setting('textureDepthMm'),3.5);
console.log('PASS quick setup texture, photo lighting and depth undo');
// Light model: type buttons, angle, mirror.
const sel=await setting('selected');
await page.getByRole('button',{name:'Softbox',exact:true}).click();await settle();let lights=await setting('lights');assert.ok(Math.abs(lights[sel].size-0.43)<0.01&&lights[sel].cone===0,JSON.stringify(lights[sel]));
await page.getByRole('button',{name:'Spot',exact:true}).click();await settle();lights=await setting('lights');assert.ok(lights[sel].size<0.02&&lights[sel].cone>0.8);
await page.locator('#lightPanel .row',{hasText:'Angle to wall'}).locator('input').evaluate(el=>{el.value=20;el.dispatchEvent(new Event('input',{bubbles:true}));});await settle();
const elevation=await page.evaluate(i=>{const l=__bench.state.lights[i],a=__bench.canvas.height/__bench.canvas.width;return Math.atan2(l.z,Math.hypot(l.x-l.aimX,(l.y-l.aimY)*a))*180/Math.PI;},sel);assert.ok(Math.abs(elevation-20)<0.5,'elevation '+elevation);
const count=lights.length;await page.getByRole('button',{name:'Mirror',exact:true}).click();await settle();lights=await setting('lights');assert.equal(lights.length,count+1);assert.ok(Math.abs(lights.at(-1).x-(1-lights[sel].x))<1e-9);
await page.getByRole('button',{name:'Shadows',exact:true}).click();await settle();assert.equal(await setting('viewMode'),6);assert.notEqual(await pixels(),preDepth);await page.getByRole('button',{name:'Relit',exact:true}).click();await settle();
console.log('PASS light types, angle, mirror and shadows view');
// Sweep inspector borrows the lights and hands them back; saves see the real ones.
const realLights=await page.evaluate(()=>JSON.stringify(__bench.state.lights));
await page.click('#sweepLight');await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>__studio.sweeping));assert.equal((await setting('lights')).length,1);
assert.equal(await page.evaluate(()=>JSON.stringify(__studio.snapshot().lights)),realLights);const sweepX=(await setting('lights'))[0].x;await page.waitForTimeout(300);assert.notEqual((await setting('lights'))[0].x,sweepX);
await page.click('#sweepLight');await settle();assert.ok(!await page.evaluate(()=>__studio.sweeping));assert.equal(await page.evaluate(()=>JSON.stringify(__bench.state.lights)),realLights);
console.log('PASS sweep light restores lights');
// Projects saved before calibrated relief open with their hand-set relief.
const legacy=JSON.parse(require('fs').readFileSync(outputDir + '/project.json','utf8'));for(const k of ['physical','paintingWidthCm','textureDepthMm','photoDiffuse'])delete legacy.settings[k];legacy.settings.lights.forEach(l=>delete l.size);require('fs').writeFileSync(outputDir + '/legacy.json',JSON.stringify(legacy));
await page.evaluate(()=>{document.querySelector('#projectStatus').textContent='';});await page.locator('#projectFile').setInputFiles(outputDir + '/legacy.json');await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent==='Project opened.');await settle();
assert.equal(await setting('physical'),0);assert.equal(await setting('photoDiffuse'),0);assert.equal(await setting('heightScale'),legacy.settings.heightScale);assert.ok((await setting('lights')).every(l=>Number.isFinite(l.size)));
console.log('PASS legacy project import keeps hand-set relief');
// Shadows follow the physics on the synthetic painting, whose true relief is known:
// deeper texture and lower lights cast more shadow, a larger source softens it, and
// shadows fall on the slopes facing away from the light, flipping when it crosses.
await page.getByText('Demo & multi-photo capture',{exact:true}).click();await page.selectOption('#src','synth');await page.waitForFunction(()=>__bench.canvas.width===820&&__bench.state.photoDiffuse===0);await settle();
const physics=await page.evaluate(async()=>{
  const {synthesizePainting}=await import('/src/synth.js');const s=__bench.state,W=__bench.canvas.width,H=__bench.canvas.height;
  const S=synthesizePainting({width:W,height:H,seed:7,lighting:'single',pigmentDetail:+document.querySelector('#pigment').value});
  const g=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=2;x<W-2;x++)g[y*W+x]=S.height[y*W+x-2]-S.height[y*W+x+2];
  const shadowMap=()=>{s.viewMode=6;__bench.render();const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const d=x.getImageData(0,0,W,H).data,o=new Float32Array(W*H);for(let i=0;i<W*H;i++)o[i]=1-d[i*4]/255;return o;};
  const mean=a=>a.reduce((p,v)=>p+v,0)/a.length,deep=a=>a.filter(v=>v>0.6).length/a.length;
  const corr=(a,b)=>{let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;for(let y=20;y<H-20;y++)for(let x=20;x<W-20;x++){const i=y*W+x;sa+=a[i];sb+=b[i];saa+=a[i]*a[i];sbb+=b[i]*b[i];sab+=a[i]*b[i];n++;}const ma=sa/n,mb=sb/n;return(sab/n-ma*mb)/Math.sqrt((saa/n-ma*ma)*(sbb/n-mb*mb));};
  const light=o=>{s.lights.splice(1);Object.assign(s.lights[0],{aimX:0.5,aimY:0.5,cone:0,enabled:true,size:0.01,softness:0.3},o);__bench.dirty();};
  const r={};s.textureDepthMm=0.5;light({x:-0.4,y:0.5,z:0.3});r.shallow=mean(shadowMap());s.textureDepthMm=5;__bench.dirty();r.deep=mean(shadowMap());
  light({x:-0.4,y:0.5,z:1.6});r.high=mean(shadowMap());light({x:-0.4,y:0.5,z:0.15});const low=shadowMap();r.low=mean(low);r.spotDeep=deep(low);r.left=corr(low,g);
  light({x:1.4,y:0.5,z:0.15});r.right=corr(shadowMap(),g);light({x:-0.4,y:0.5,z:0.15,size:0.5});r.softDeep=deep(shadowMap());s.viewMode=0;return r;});
assert.ok(physics.deep>physics.shallow*2&&physics.low>physics.high*2&&physics.softDeep<physics.spotDeep&&physics.left>0.2&&physics.right<-0.2,JSON.stringify(physics));
console.log('PASS shadows follow depth, angle, source size and side',JSON.stringify(Object.fromEntries(Object.entries(physics).map(([k,v])=>[k,+v.toFixed(3)]))));
await page.screenshot({path:outputDir + '/desktop-tested.png'});
await page.setViewportSize({width:390,height:844});await settle();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const mobile=await page.locator('#gl').boundingBox();assert.ok(mobile.width>100&&mobile.height>100);await page.screenshot({path:outputDir + '/mobile-tested.png'});console.log('PASS mobile layout');
assert.deepEqual(errors,[]);console.log('PASS no browser or WebGL errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
