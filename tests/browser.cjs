const assert=require('node:assert/strict');
const outputDir=require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'digilight-test-'));
// Start a static server on port 8766 (or $DIGILIGHT_PORT) from the repository root before running.

const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.DIGILIGHT_BROWSER || undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1350,height:900},acceptDownloads:true});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const settle=async()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,30)))));
const pixels=()=>page.evaluate(()=>{__bench.render();return __bench.canvas.toDataURL()});
const setting=k=>page.evaluate(k=>__bench.state[k],k);
const slider=async(id,v)=>{await page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},v);await settle();};
await page.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766));await page.waitForFunction(()=>window.__bench&&window.__studio);await settle();assert.equal(await page.locator('#err').textContent(),'');console.log('PASS boot and shader compilation');
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
{const preX=(await setting('lights'))[0].x;await page.selectOption('#lightingPreset','Grazing side light');await settle();const sel=0,g=(await setting('lights'))[sel];
const deg=Math.atan2(g.z,Math.hypot(g.x-g.aimX,(g.y-g.aimY)*300/240))*180/Math.PI;assert.ok(g.x<0&&Math.abs(deg-3)<0.2&&g.power>8,JSON.stringify(g));assert.equal(await setting('shadow'),1);
await page.click('#zoomFit');assert.ok((await page.locator('.handle').nth(sel).getAttribute('class')).includes('pinned'));
await page.click('#zoomLights');await settle();assert.ok(await setting('viewZoom')<1);assert.ok(!(await page.locator('.handle').nth(sel).getAttribute('class')).includes('pinned'));
const hb=await page.locator('.handle').nth(sel).boundingBox(),cb=await page.locator('#gl').boundingBox();assert.ok(hb.x+hb.width/2<cb.x);
await page.click('#zoomOut');assert.ok(await setting('viewZoom')<0.85);await page.click('#zoomFit');assert.equal(await setting('viewZoom'),1);
await page.click('#undo');await settle();assert.equal((await setting('lights'))[sel].x,preX);}
console.log('PASS grazing preset, view zoom and off-painting dots');
// Zoom past fit: the stage scrolls, and gestures, pinned dots, light drags and brush strokes all map to the painting.
{const view=()=>page.evaluate(()=>{const s=document.querySelector('#scroller'),c=__bench.canvas.getBoundingClientRect(),r=s.getBoundingClientRect();return {z:__bench.state.viewZoom,sl:s.scrollLeft,st:s.scrollTop,c:{x:c.left,y:c.top,w:c.width,h:c.height},v:{x:r.left+s.clientLeft,y:r.top+s.clientTop,w:s.clientWidth,h:s.clientHeight}};});
const at=(v,p)=>[(p[0]-v.c.x)/v.c.w,(p[1]-v.c.y)/v.c.h],near=(a,b,px,v)=>Math.hypot((a[0]-b[0])*v.c.w,(a[1]-b[1])*v.c.h)<px;
const hist=await page.evaluate(()=>__studio.history.index),fit=await view(),steps=[];
for(let i=0;i<6;i++){await page.click('#zoomIn');steps.push(await setting('viewZoom'));}
assert.deepEqual(steps,[1.25,1.5,2,3,4,4]);assert.equal(await page.locator('#zoomFit').textContent(),'400%');
let v=await view();assert.ok(Math.abs(v.c.w/fit.c.w-4)<.01&&v.sl>0&&v.st>0,JSON.stringify(v));assert.ok(near(at(v,[v.v.x+v.v.w/2,v.v.y+v.v.h/2]),[.5,.5],1,v),'buttons zoom about the centre');
await page.keyboard.press('-');assert.equal(await setting('viewZoom'),3);await page.keyboard.press('=');assert.equal(await setting('viewZoom'),4);
await page.keyboard.press('0');assert.equal(await setting('viewZoom'),1);assert.deepEqual((await view()).c,fit.c);
await page.click('#zoomIn');await page.click('#zoomIn');v=await view();const P=[v.v.x+v.v.w*.3,v.v.y+v.v.h*.4],u0=at(v,P);
await page.mouse.move(...P);await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.mouse.wheel(0,-100);await page.keyboard.up('Control');await settle();
v=await view();assert.ok(Math.abs(v.z-1.5*Math.exp(.44))<.01,'wheel zoom '+v.z);assert.ok(near(at(v,P),u0,1.5,v),'Ctrl+wheel keeps the point under the pointer');
await page.keyboard.down('Control');await page.mouse.wheel(0,40);await page.keyboard.up('Control');await settle();v=await view();assert.ok(v.z<1.5*Math.exp(.44)&&near(at(v,P),u0,1.5,v),'wheel out '+v.z);
const st0=v.st;await page.mouse.wheel(0,150);await page.waitForFunction(s=>document.querySelector('#scroller').scrollTop>s+100,st0);
while(await setting('viewZoom')<4)await page.click('#zoomIn');v=await view();
const C=[v.v.x+v.v.w*.5,v.v.y+v.v.h*.45],lights=JSON.stringify(await setting('lights'));
await page.mouse.move(...C);await page.keyboard.down('Space');assert.ok((await page.locator('#stage').getAttribute('class')).includes('panReady'));
await page.mouse.down();await page.mouse.move(C[0]-120,C[1]-90,{steps:5});await page.mouse.up();await page.keyboard.up('Space');
let w=await view();assert.ok(Math.abs(w.sl-v.sl-120)<2&&Math.abs(w.st-v.st-90)<2,'Space-drag pan '+[w.sl-v.sl,w.st-v.st]);assert.equal(JSON.stringify(await setting('lights')),lights);assert.equal(w.z,4);
assert.ok(!(await page.locator('#stage').getAttribute('class')).includes('panReady'));
await page.mouse.down({button:'middle'});await page.mouse.move(C[0]-50,C[1]-50,{steps:4});await page.mouse.up({button:'middle'});
v=await view();assert.ok(Math.abs(w.sl-v.sl-70)<2&&Math.abs(w.st-v.st-40)<2,'middle-drag pan '+[w.sl-v.sl,w.st-v.st]);assert.equal(JSON.stringify(await setting('lights')),lights);
assert.equal(await page.evaluate(()=>__studio.history.index),hist);assert.ok(!('viewZoom' in await page.evaluate(()=>__studio.snapshot())));
const last=(await setting('lights')).length-1,hs=page.locator('.handle').last(),Q=[v.v.x+v.v.w*.62,v.v.y+v.v.h*.3];let hb=await hs.boundingBox();
await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(...Q,{steps:6});await page.mouse.up();await settle();
v=await view();let q=at(v,Q),l=(await setting('lights'))[last];assert.ok(Math.abs(l.x-q[0])<.002&&Math.abs(l.y-(1-q[1]))<.002,'zoomed drag '+JSON.stringify([l.x,l.y,q]));
hb=await hs.boundingBox();assert.ok(Math.hypot(hb.x+hb.width/2-Q[0],hb.y+hb.height/2-Q[1])<1.5&&!(await hs.getAttribute('class')).includes('pinned'));
await page.evaluate(()=>{document.querySelector('#scroller').scrollTop+=600;});await settle();hb=await hs.boundingBox();
assert.ok((await hs.getAttribute('class')).includes('pinned')&&Math.abs(hb.y+hb.height/2-v.v.y-14)<1.5&&Math.abs(hb.x+hb.width/2-Q[0])<1.5,'dot pins to the visible edge while scrolled '+JSON.stringify(hb));
await page.evaluate(()=>{document.querySelector('#scroller').scrollTop-=600;});await settle();hb=await hs.boundingBox();assert.ok(Math.hypot(hb.x+hb.width/2-Q[0],hb.y+hb.height/2-Q[1])<1.5&&!(await hs.getAttribute('class')).includes('pinned'));
await page.click('#undo');await settle();assert.equal(JSON.stringify(await setting('lights')),lights);
const touch=()=>page.evaluate(()=>getComputedStyle(__bench.canvas).touchAction);assert.equal(await touch(),'pan-x pan-y');
await page.click('#brushRemove');assert.equal(await touch(),'none');v=await view();const B0=[v.v.x+v.v.w*.4,v.v.y+v.v.h*.55],B1=[B0[0]+80,B0[1]+20],n0=(await setting('strokes')).length;
assert.ok(await page.evaluate(p=>document.elementFromPoint(...p)===__bench.canvas,B0));
await page.mouse.move(...B0);await page.mouse.down();await page.mouse.move(...B1,{steps:4});await page.mouse.up();await settle();
const s=(await setting('strokes')).at(-1);assert.equal((await setting('strokes')).length,n0+1);assert.ok(near(s.points[0],at(v,B0),.5,v)&&near(s.points.at(-1),at(v,B1),.5,v),'zoomed stroke '+JSON.stringify([s.points[0],at(v,B0)]));
assert.ok(Math.abs(s.radius-(await page.locator('#brushSize').inputValue())/v.c.w)<1e-9);await page.click('#undo');await page.click('#brushOff');await settle();assert.equal((await setting('strokes')).length,n0);
await page.click('#zoomLights');assert.ok(await setting('viewZoom')<=1);await page.click('#zoomFit');assert.deepEqual((await view()).c,fit.c);assert.equal(await page.evaluate(()=>__studio.history.index),hist);}
console.log('PASS zoom to 400%: steps, keys, Ctrl+wheel about the pointer, scrolling, Space/middle-drag pan, pinned dots, light drag and brush while zoomed');
{await page.getByText('Graze light · raking texture',{exact:true}).click();const plain=await pixels();assert.equal((await setting('graze')).enabled,false);
await page.click('#grazeVis');await settle();assert.equal((await setting('graze')).enabled,true);const fromLeft=await pixels();assert.notEqual(fromLeft,plain);
const dial=await page.locator('#grazeDial').boundingBox();await page.mouse.move(dial.x+dial.width*.95,dial.y+dial.height/2);await page.mouse.down();await page.mouse.up();await settle();
let gz=await setting('graze');assert.ok(gz.angle<3||gz.angle>357,JSON.stringify(gz));const fromRight=await pixels();assert.notEqual(fromRight,fromLeft);
await page.mouse.move(dial.x+dial.width/2,dial.y+dial.height*.05);await page.mouse.down();await page.mouse.move(dial.x+dial.width*.1,dial.y+dial.height*.15,{steps:4});await page.mouse.up();await settle();gz=await setting('graze');assert.ok(gz.angle>120&&gz.angle<150,JSON.stringify(gz));
await page.focus('#grazeDial');await page.keyboard.press('ArrowUp');await settle();assert.equal((await setting('graze')).angle,gz.angle+1);
await slider('grazeOpacity',0);assert.equal(await pixels(),plain);await slider('grazeOpacity',1);const full=await pixels();await slider('grazeElevation',12);assert.notEqual(await pixels(),full);
await page.click('#grazeVis');await settle();assert.equal((await setting('graze')).enabled,false);assert.equal(await pixels(),plain);
await page.click('#undo');await settle();assert.equal((await setting('graze')).enabled,true);assert.equal((await setting('graze')).elevation,12);
await page.click('#undo');await settle();assert.equal((await setting('graze')).elevation,3);
const checked=await page.evaluate(()=>__studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:__studio.snapshot()}).graze);assert.deepEqual(checked,await setting('graze'));
await page.locator('#grazeSection').screenshot({path:outputDir+'/graze-panel.png'});await page.screenshot({path:outputDir+'/graze.png'});
await slider('grazeOpacity',0.5);{const d=await page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,240,300).data;__bench.state.maxTile=160;const t=await __bench.exportFullRes();const b=t.getContext('2d').getImageData(0,0,240,300).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});assert.ok(d<1,'graze tile difference '+d);}
await page.click('#grazeVis');await settle();assert.equal(await pixels(),plain);}
console.log('PASS graze effect: dial, keys, opacity, angle to wall, visibility, undo, validate, tiled export');
await page.getByText('Layers · blend effects',{exact:true}).click();const noLayer=await pixels();await page.click('#addLayer');await settle();
let layers=await setting('layers');assert.deepEqual(layers,[{mode:'pinLight',source:'original',opacity:.35,enabled:true}]);const pin=await pixels();assert.notEqual(pin,noLayer);
await page.locator('.lyOpacity').evaluate(el=>{el.value=0;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});await settle();assert.equal(await pixels(),noLayer);
await page.click('#undo');await settle();assert.equal((await setting('layers'))[0].opacity,.35);assert.equal(await pixels(),pin);
await page.selectOption('.lyMode','multiply');await settle();const mult=await pixels();assert.notEqual(mult,pin);await page.click('.lyVis');await settle();assert.equal(await pixels(),noLayer);await page.click('.lyVis');
await page.click('#compare');await settle();assert.notEqual(await pixels(),mult);await page.click('#compare');
await page.click('.lyDup');await settle();assert.equal((await setting('layers')).length,2);await page.click('#undo');await settle();assert.equal((await setting('layers')).length,1);
await page.selectOption('.lyMode','pinLight');await settle();assert.equal(await pixels(),pin);
console.log('PASS blend layers: add, opacity, mode, visibility, duplicate, undo');
{const drag=async(x0,x1)=>{await page.mouse.move(box.x+box.width*x0,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*x1,box.y+box.height*.5,{steps:8});await page.mouse.up();await settle();};
await page.selectOption('.lyMode','multiply');await settle();const full=await pixels();
await page.click('.lyHideAll');await settle();assert.deepEqual((await setting('layers'))[0].mask,{base:0,strokes:[]});assert.equal(await setting('maskOverlay'),0);const tinted=await pixels();assert.notEqual(tinted,noLayer);
await drag(.3,.6);let mask=(await setting('layers'))[0].mask;assert.equal(mask.strokes.length,1);assert.equal(mask.strokes[0].mode,'show');
await page.click('.lyShow');await settle();assert.equal(await setting('maskOverlay'),-1);const shown=await pixels();assert.notEqual(shown,noLayer);assert.notEqual(shown,full);
const corner=u=>page.evaluate(async u=>{const im=new Image();await new Promise(r=>{im.onload=r;im.src=u;});const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return [...x.getImageData(2,2,1,1).data];},u);
assert.deepEqual(await corner(shown),await corner(noLayer));assert.notDeepEqual(await corner(full),await corner(noLayer));
await page.click('#undo');await settle();assert.equal((await setting('layers'))[0].mask.strokes.length,0);assert.equal(await pixels(),noLayer);await page.click('#redo');await settle();assert.equal(await pixels(),shown);
await page.click('.lyHide');await drag(.3,.6);assert.equal((await setting('layers'))[0].mask.strokes.at(-1).mode,'hide');await page.click('#undo');await settle();await page.click('.lyHide');await settle();assert.equal(await pixels(),shown);
const checked=await page.evaluate(()=>{const s=__studio.snapshot();return __studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:s}).layers;});assert.deepEqual(checked,await setting('layers'));
{const d=await page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,240,300).data;__bench.state.maxTile=160;const t=await __bench.exportFullRes();const b=t.getContext('2d').getImageData(0,0,240,300).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});assert.ok(d<1,'masked layer tile difference '+d);}
await page.click('.lyShow');await page.locator('#layersSection').screenshot({path:outputDir+'/layer-mask-panel.png'});await page.screenshot({path:outputDir+'/layer-mask-overlay.png'});await page.click('.lyShow');
await page.click('.lyReset');await settle();assert.equal((await setting('layers'))[0].mask,undefined);assert.equal(await pixels(),full);await page.click('#undo');await settle();assert.equal(await pixels(),shown);}
console.log('PASS layer masks: hide all, paint show/hide, overlay, undo, validate, tiled export, reset');
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
assert.equal((await setting('layers')).length,1);await page.evaluate(()=>{document.querySelector('#layersSection').open=true;});await page.click('.lyDel');await settle();assert.equal((await setting('layers')).length,0);
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
// Sharp zoom: zoomed in on a photo larger than the 1400 px preview, the visible part is rendered
// again from the full-resolution source once the view is still, and matches a full-resolution export.
{await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1800;c.height=900;const x=c.getContext('2d'),im=x.createImageData(1800,900);let s=7;
  for(let i=0;i<im.data.length;i+=4){const a=(i/4)%1800,y=(i/7200)|0;s=(s*1103515245+12345)&0x7fffffff;const v=110+45*Math.sin(a*.9)*Math.cos(y*.7)+30*Math.sin((a+y)*.03)+(s>>24)/6;im.data[i]=v;im.data[i+1]=v*.8;im.data[i+2]=v*.6;im.data[i+3]=255;}
  x.putImageData(im,0,0);return __bench.setSource(c);});
await page.waitForFunction(()=>__bench.canvas.width===1400);await settle();await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>__bench.sharp()),null,'no overlay at fit');
while(await setting('viewZoom')<4)await page.click('#zoomIn');await page.evaluate(()=>{const s=document.querySelector('#scroller');s.scrollLeft=s.scrollWidth*.3;s.scrollTop=s.scrollHeight*.3;});
await page.waitForFunction(()=>__bench.sharp());await page.screenshot({path:outputDir+'/zoom-400-sharp.png'});
const r=await page.evaluate(async()=>{const s=__bench.sharp(),{x,y,w,h}=s.rect,o=s.canvas.getBoundingClientRect(),c=__bench.canvas.getBoundingClientRect(),v=document.querySelector('#scroller').getBoundingClientRect();
  const a=s.canvas.getContext('2d').getImageData(0,0,w,h).data,e=await __bench.exportFullRes(),b=e.getContext('2d').getImageData(x,y,w,h).data;
  const m=document.createElement('canvas');m.width=w;m.height=h;const k=__bench.canvas.width/s.outW;m.getContext('2d').drawImage(__bench.canvas,x*k,y*k,w*k,h*k,0,0,w,h);const p=m.getContext('2d').getImageData(0,0,w,h).data;
  let d=0,soft=0,n=0;for(let i=0;i<a.length;i+=4)for(let j=0;j<3;j++){d+=Math.abs(a[i+j]-b[i+j]);soft+=Math.abs(p[i+j]-b[i+j]);n++;}
  return {outW:s.outW,exportW:e.width,rect:s.rect,diff:d/n,soft:soft/n,edges:[o.left-Math.max(c.left,v.left),o.top-Math.max(c.top,v.top),o.right-Math.min(c.right,v.right),o.bottom-Math.min(c.bottom,v.bottom)]};});
assert.ok(r.outW===1800&&r.exportW===1800&&r.rect.x>0&&r.rect.y>0,JSON.stringify(r));assert.ok(r.diff<0.5,'overlay vs export '+r.diff);assert.ok(r.soft>3*r.diff+1,'preview is softer '+JSON.stringify(r));
assert.ok(r.edges.every(e=>Math.abs(e)<3),'overlay lies over the visible part '+r.edges);
await page.evaluate(()=>{document.querySelector('#sharp').style.display='none';});await page.screenshot({path:outputDir+'/zoom-400-preview.png'});await page.evaluate(()=>{document.querySelector('#sharp').style.display='';});
await page.evaluate(()=>{document.querySelector('#scroller').scrollTop+=50;});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));assert.equal(await page.evaluate(()=>__bench.sharp()),null,'scrolling hides it');
await page.waitForFunction(()=>__bench.sharp());await slider('fineRelief',1.1);assert.equal(await page.evaluate(()=>__bench.sharp()),null,'a slider hides it');
await page.waitForFunction(()=>__bench.sharp());await page.click('#zoomFit');await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>__bench.sharp()),null);
console.log('PASS sharp zoom overlay matches full-resolution export',JSON.stringify({diff:+r.diff.toFixed(4),preview:+r.soft.toFixed(2),rect:r.rect}));}
await page.setViewportSize({width:390,height:844});await settle();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const mobile=await page.locator('#gl').boundingBox();assert.ok(mobile.width>100&&mobile.height>100);await page.screenshot({path:outputDir + '/mobile-tested.png'});
for(let i=0;i<6;i++)await page.click('#zoomIn');await settle();assert.equal(await setting('viewZoom'),4);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#scroller').scrollWidth>document.querySelector('#scroller').clientWidth*2));
await page.click('#zoomFit');console.log('PASS mobile layout, also at 400%');
assert.deepEqual(errors,[]);console.log('PASS no browser or WebGL errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
