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
await page.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await page.waitForFunction(()=>window.__bench&&window.__studio);await settle();assert.equal(await page.locator('#err').textContent(),'');console.log('PASS boot and shader compilation');
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
for(let i=0;i<9;i++){await page.click('#zoomIn');steps.push(await setting('viewZoom'));}
assert.deepEqual(steps,[1.25,1.5,2,3,4,6,8,10,10]);assert.equal(await page.locator('#zoomFit').textContent(),'1000%');
let v=await view();assert.ok(Math.abs(v.c.w/fit.c.w-10)<.01&&v.sl>0&&v.st>0,JSON.stringify(v));{const q=at(v,[v.v.x+v.v.w/2,v.v.y+v.v.h/2]);assert.ok(near(q,[.5,.5],4,v),'buttons zoom about the centre '+JSON.stringify([q,v.c]));}
await page.keyboard.press('-');assert.equal(await setting('viewZoom'),8);await page.keyboard.press('=');assert.equal(await setting('viewZoom'),10);
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
const touch=()=>page.evaluate(()=>getComputedStyle(__bench.canvas).touchAction);assert.equal(await touch(),'none');
await page.click('#brushRemove');assert.equal(await touch(),'none');v=await view();const B0=[v.v.x+v.v.w*.4,v.v.y+v.v.h*.55],B1=[B0[0]+80,B0[1]+20],n0=(await setting('strokes')).length;
assert.ok(await page.evaluate(p=>document.elementFromPoint(...p)===__bench.canvas,B0));
await page.mouse.move(...B0);await page.mouse.down();await page.mouse.move(...B1,{steps:4});await page.mouse.up();await settle();
const s=(await setting('strokes')).at(-1);assert.equal((await setting('strokes')).length,n0+1);assert.ok(near(s.points[0],at(v,B0),.5,v)&&near(s.points.at(-1),at(v,B1),.5,v),'zoomed stroke '+JSON.stringify([s.points[0],at(v,B0)]));
assert.ok(Math.abs(s.radius-(await page.locator('#brushSize').inputValue())/v.c.w)<1e-9);await page.click('#undo');await page.click('#brushOff');await settle();assert.equal((await setting('strokes')).length,n0);
await page.click('#zoomLights');assert.ok(await setting('viewZoom')<=1);await page.click('#zoomFit');assert.deepEqual((await view()).c,fit.c);assert.equal(await page.evaluate(()=>__studio.history.index),hist);}
console.log('PASS zoom to 1000%: steps, keys, Ctrl+wheel about the pointer, scrolling, Space/middle-drag pan, pinned dots, light drag and brush while zoomed');
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
// Detail: the graze light's own smoothed relief, in painting widths. The widest Detail
// reads 3 sigma past each export tile, so the tiled export must still match the preview.
assert.equal((await setting('graze')).detail,0.01);const atDefault=await pixels();await slider('grazeDetail',0);const allDetail=await pixels();assert.notEqual(allDetail,atDefault);
await slider('grazeDetail',0.03);const widest=await pixels();assert.notEqual(widest,allDetail);await slider('grazeFine',0);assert.equal((await setting('graze')).fine,0);assert.notEqual(await pixels(),widest);
{const d=await page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,240,300).data;__bench.state.maxTile=160;const t=await __bench.exportFullRes();const b=t.getContext('2d').getImageData(0,0,240,300).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});assert.ok(d<1,'graze detail tile difference '+d);}
{const v=await page.evaluate(()=>{const check=g=>{const s=__studio.snapshot();s.graze=g;try{return __studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:s}).graze;}catch{return null;}};const base={enabled:true,angle:10,elevation:2,opacity:1};return {legacy:check(base),bad:check({...base,detail:0.5}),badFine:check({...base,detail:0.01,fine:2}),badReach:check({...base,reach:1.5}),badClean:check({...base,clean:-0.1}),badSoft:check({...base,soft:1.5}),badSoftLow:check({...base,soft:-0.1}),softened:check({...base,soft:0.5}),reached:check({...base,detail:0.01,reach:0.5,clean:0.25,soft:1})};});
assert.deepEqual(v.legacy,{enabled:true,angle:10,elevation:2,opacity:1,detail:0,fine:1,reach:0,clean:0,soft:0});assert.equal(v.bad,null);assert.equal(v.badFine,null);
assert.equal(v.badReach,null);assert.equal(v.badClean,null);assert.equal(v.badSoft,null);assert.equal(v.badSoftLow,null);assert.equal(v.softened.soft,0.5);assert.deepEqual(v.reached,{enabled:true,angle:10,elevation:2,opacity:1,detail:0.01,fine:1,reach:0.5,clean:0.25,soft:1});}
await page.click('#undo');await settle();assert.equal((await setting('graze')).fine,0.8);assert.equal(await pixels(),widest);
// Shadow length: the march normally stops at the main lights' reach, a few pixels, so
// a degree off the wall the graze light could not throw the long shadows it is for.
// Clean shadows: a blocker must clear a height first. Both 0 is the merged look
// exactly, and both reach into the tile margin, so the tiled export must still match.
await slider('grazeElevation',1);await slider('grazeReach',0);await slider('grazeClean',0);assert.equal((await setting('graze')).reach,0);assert.equal((await setting('graze')).clean,0);const short=await pixels();
await slider('grazeReach',1);assert.equal((await setting('graze')).reach,1);const longer=await pixels();assert.notEqual(longer,short);
await slider('grazeClean',0.5);assert.equal((await setting('graze')).clean,0.5);assert.notEqual(await pixels(),longer);
{const d=await page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,240,300).data;__bench.state.maxTile=160;const t=await __bench.exportFullRes();const b=t.getContext('2d').getImageData(0,0,240,300).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});assert.ok(d<1,'graze reach tile difference '+d);}
await slider('grazeClean',0);await slider('grazeReach',0);assert.equal(await pixels(),short);
// Softness: the source's radius, from a bare bulb (0) to a strip (1); its shadow edges widen.
await slider('grazeSoft',0);assert.equal((await setting('graze')).soft,0);const bare=await pixels();assert.notEqual(bare,short);
await slider('grazeSoft',1);assert.equal((await setting('graze')).soft,1);assert.notEqual(await pixels(),bare);
await page.click('#undo');await settle();assert.equal((await setting('graze')).soft,0);assert.equal(await pixels(),bare);
await page.click('#undo');await settle();assert.equal((await setting('graze')).soft,0.2);assert.equal(await pixels(),short);
// Presets: each sets every field but keeps the direction; the dropdown names the look the values match, else ''.
{const preset=name=>page.evaluate(async n=>(await import('/src/presets.js')).grazePresets[n],name),shown=()=>page.locator('#grazePreset').inputValue();
const tileDiff=()=>page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,240,300).data;__bench.state.maxTile=160;const t=await __bench.exportFullRes();const b=t.getContext('2d').getImageData(0,0,240,300).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});
const names=await page.evaluate(()=>[...document.querySelectorAll('#grazePreset option')].map(o=>o.value).filter(Boolean));assert.equal(names.length,6);assert.ok(names.includes('Long shadows'));
assert.equal(await shown(),'');const angle=(await setting('graze')).angle,long=await preset('Long shadows');
await page.selectOption('#grazePreset','Long shadows');await settle();gz=await setting('graze');assert.equal(gz.angle,angle);assert.equal(gz.enabled,true);for(const k of Object.keys(long))assert.equal(gz[k],long[k],k);assert.equal(Object.keys(long).length,7);assert.equal(await shown(),'Long shadows');
const longPixels=await pixels();assert.notEqual(longPixels,short);
const d=await tileDiff();assert.ok(d<1,'graze preset tile difference '+d);
for(const [id,v] of [['grazeOpacity',0.5],['grazeElevation',5],['grazeDetail',0.02],['grazeFine',0.1],['grazeReach',0.5],['grazeClean',0.1],['grazeSoft',0.9]]){await page.selectOption('#grazePreset','Long shadows');await settle();assert.equal(await shown(),'Long shadows');await slider(id,v);assert.equal(await shown(),'',id);}
await page.selectOption('#grazePreset','Every detail (raw)');await settle();assert.equal(await shown(),'Every detail (raw)');assert.equal((await setting('graze')).angle,angle);await page.selectOption('#grazePreset','Long shadows');await settle();assert.equal(await pixels(),longPixels);}
await page.click('#grazeVis');await settle();assert.equal(await pixels(),plain);}
console.log('PASS graze effect: dial, keys, opacity, angle to wall, detail, fine texture, shadow length, clean shadows, softness, presets, visibility, undo, validate, tiled export');
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
await page.click('#photoCompass button[data-dir=l]');await settle();assert.equal(await setting('photoDiffuse'),0.35);assert.equal(await setting('azimuthDeg'),180);
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
const compareSharp=()=>page.evaluate(async()=>{const s=__bench.sharp(),{x,y,w,h}=s.rect,o=s.canvas.getBoundingClientRect(),c=__bench.canvas.getBoundingClientRect(),v=document.querySelector('#scroller').getBoundingClientRect();
  const a=s.canvas.getContext('2d').getImageData(0,0,w,h).data,e=await __bench.exportFullRes(),b=e.getContext('2d').getImageData(x,y,w,h).data;
  const m=document.createElement('canvas');m.width=w;m.height=h;const k=__bench.canvas.width/s.outW;m.getContext('2d').drawImage(__bench.canvas,x*k,y*k,w*k,h*k,0,0,w,h);const p=m.getContext('2d').getImageData(0,0,w,h).data;
  let d=0,soft=0,n=0;for(let i=0;i<a.length;i+=4)for(let j=0;j<3;j++){d+=Math.abs(a[i+j]-b[i+j]);soft+=Math.abs(p[i+j]-b[i+j]);n++;}
  return {outW:s.outW,exportW:e.width,rect:s.rect,diff:d/n,soft:soft/n,edges:[o.left-Math.max(c.left,v.left),o.top-Math.max(c.top,v.top),o.right-Math.min(c.right,v.right),o.bottom-Math.min(c.bottom,v.bottom)]};});
const r=await compareSharp();assert.ok(r.outW===1800&&r.exportW===1800&&r.rect.x>0&&r.rect.y>0,JSON.stringify(r));assert.ok(r.diff<0.5,'overlay vs export '+r.diff);assert.ok(r.soft>3*r.diff+1,'preview is softer '+JSON.stringify(r));
assert.ok(r.edges.every(e=>Math.abs(e)<3),'overlay lies over the visible part '+r.edges);
// With the graze light on (Long shadows) the overlay must still match the export of the same region.
await page.selectOption('#grazePreset','Long shadows');await settle();assert.equal((await setting('graze')).enabled,true);await page.waitForFunction(()=>__bench.sharp());{const g=await compareSharp();assert.ok(g.diff<0.5,'graze overlay vs export '+g.diff);assert.deepEqual(g.rect,r.rect,'same region');console.log('graze overlay diff',+g.diff.toFixed(4));}
await page.evaluate(()=>{document.querySelector('#sharp').style.display='none';});await page.screenshot({path:outputDir+'/zoom-400-preview.png'});await page.evaluate(()=>{document.querySelector('#sharp').style.display='';});
await page.evaluate(()=>{document.querySelector('#scroller').scrollTop+=50;});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));assert.equal(await page.evaluate(()=>__bench.sharp()),null,'scrolling hides it');
await page.waitForFunction(()=>__bench.sharp());await slider('fineRelief',1.1);assert.equal(await page.evaluate(()=>__bench.sharp()),null,'a slider hides it');
await page.waitForFunction(()=>__bench.sharp());await page.click('#zoomFit');await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>__bench.sharp()),null);
console.log('PASS sharp zoom overlay matches full-resolution export',JSON.stringify({diff:+r.diff.toFixed(4),preview:+r.soft.toFixed(2),rect:r.rect}));}
await page.setViewportSize({width:390,height:844});await settle();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const mobile=await page.locator('#gl').boundingBox();assert.ok(mobile.width>100&&mobile.height>100);await page.screenshot({path:outputDir + '/mobile-tested.png'});
for(let i=0;i<9;i++)await page.click('#zoomIn');await settle();assert.equal(await setting('viewZoom'),10);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#scroller').scrollWidth>document.querySelector('#scroller').clientWidth*2));
await page.click('#zoomFit');console.log('PASS mobile layout, also at 1000%');
{await page.locator('#calibrateSection').evaluate(e=>e.open=true);await page.selectOption('#calUnits','in');
const num=async(id,v)=>{await page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));},v);await settle();};
await num('calWidthN',19);await num('calAboveN',32);await num('calLeftN',19);await num('calOutN',4);
assert.ok(Math.abs(await setting('paintingWidthCm')-48.26)<1e-6);assert.equal((await setting('graze')).lamp,undefined);
const asp=await page.evaluate(()=>__bench.canvas.height/__bench.canvas.width);
await page.click('#calUse');await settle();const gz=await setting('graze');
assert.deepEqual(gz.lamp,{left:48.26,above:81.28,out:10.16});assert.equal(gz.opacity,1);assert.equal(gz.enabled,true);
// Centre of the painting: lamp 32 in over the top edge, at the right edge, 4 in off the wall.
const dy=(1+81.28/(48.26*asp)-0.5)*asp,dx=0.5,az=Math.atan2(dy,dx)*180/Math.PI,el=Math.atan2(10.16/48.26,Math.hypot(dx,dy))*180/Math.PI;
assert.ok(Math.abs(gz.angle-az)<0.6&&Math.abs(gz.elevation-Math.min(20,Math.max(1,Math.round(el*2)/2)))<1e-6,JSON.stringify({gz,az,el}));
assert.equal(await setting('azimuthDeg'),Math.round(az));assert.equal(await setting('photoDiffuse'),0.35);
assert.match(await page.locator('#calGeometry').textContent(),/at the top, .* in the middle, .* at the bottom/);
const lit=await pixels();await num('calOutN',8);assert.equal((await setting('graze')).lamp.out,20.32);assert.notEqual(await pixels(),lit);
const m=await page.evaluate(()=>__studio.calibrate.measure());assert.ok([m.fine,m.broad,m.score].every(Number.isFinite),JSON.stringify(m));
const viewAfter=await page.evaluate(()=>[__bench.state.viewMode,__bench.state.compareSplit,__bench.state.graze.opacity]);assert.deepEqual(viewAfter,[0,-1,1]);
const fit=await page.evaluate(()=>__studio.calibrate.autoFit(8));assert.ok(fit.best.score>=fit.start.score&&fit.evals<=8,JSON.stringify(fit));
const fitted=await setting('graze');await page.click('#undo');await settle();assert.equal((await setting('graze')).lamp.out,20.32);await page.click('#redo');await settle();assert.deepEqual(await setting('graze'),fitted);
const saved=await page.evaluate(()=>__studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:__studio.snapshot()}).graze);assert.deepEqual(saved.lamp,fitted.lamp);assert.equal(saved.fill,fitted.fill);
await page.evaluate(()=>{const s=__studio.snapshot();s.graze.lamp={left:1,above:1,out:0};try{__studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:s});window.__bad=false;}catch{window.__bad=true;}});assert.equal(await page.evaluate(()=>window.__bad),true);
await page.locator('#grazeSection').evaluate(e=>e.open=true);await page.focus('#grazeDial');await page.keyboard.press('ArrowUp');await settle();assert.equal((await setting('graze')).lamp,undefined);
console.log('PASS calibrate: lamp geometry, match score, auto-fit, undo and saving');}
{const r=await page.evaluate(async()=>{const {lightReach}=await import('./src/shade.js');const L=(p,on=true)=>({power:p,rgb:[1,1,1],enabled:on});const reach=[...lightReach([L(4),L(1),L(0.1),L(9,false)])].slice(0,4);const s=__studio.snapshot();delete s.shadowDetail;const legacy=__studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:s}).shadowDetail;const before=__bench.state.shadowDetail;__bench.state.shadowDetail=0.01;__bench.render();await new Promise(r=>setTimeout(r,400));return {reach,legacy,before,err:document.querySelector('#err').textContent};});assert.deepEqual(r.reach.map(v=>+v.toFixed(3)),[1,0.25,0.15,0.15]);assert.equal(r.legacy,0);assert.equal(r.before,0.004);assert.equal(r.err,'');await page.evaluate(()=>{__bench.state.shadowDetail=0.004;});console.log('PASS shadow smoothing and extra-light shadow reach');}
// Measure relief · lamp photos: a synthetic painting whose relief does not show in its
// even shot, three lamp shots (the first moved 2 px, as a creeping tripod does), and
// the measured relief compared with the truth, through the section's own controls.
{const W=420,H=340,widthCm=40,lamps=[{left:-5,above:15,out:12},{left:20,above:14,out:13},{left:45,above:15,out:12}];
const png=await page.evaluate(({W,H,widthCm,lamps})=>{
  const n=W*H,ht=new Float32Array(n),k=W/widthCm;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)ht[y*W+x]=1.5*Math.sin(x/9+Math.sin(y/23))*Math.cos(y/13)+Math.sin((x+y)/5.5)+2*Math.exp(-((x-150)**2+(y-120)**2)/400);
  window.__lampTruth=ht;
  const alb=(x,y)=>{const a=[[0.55,0.25,0.2],[0.45,0.45,0.42],[0.25,0.22,0.3]][(Math.floor(x/60)+Math.floor(y/50))%3].slice();a[0]*=1+0.25*Math.sin(x/4.7)*Math.sin(y/3.9);return a;};
  const enc=v=>{v=Math.max(0,Math.min(1,v));return Math.round(255*(v<=0.0031308?12.92*v:1.055*v**(1/2.4)-0.055));};
  const img=(f,dx=0)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d'),d=g.createImageData(W,H);
    for(let y=0;y<H;y++)for(let X=0;X<W;X++){const x=Math.min(W-1,Math.max(0,X-dx)),v=f(x,y),a=alb(x,y),o=(y*W+X)*4;d.data[o]=enc(a[0]*v);d.data[o+1]=enc(a[1]*v);d.data[o+2]=enc(a[2]*v);d.data[o+3]=255;}
    g.putImageData(d,0,0);return c.toDataURL('image/png').split(',')[1];};
  const lit=l=>(x,y)=>{const hx=(ht[y*W+Math.min(W-1,x+1)]-ht[y*W+Math.max(0,x-1)])/2,hy=(ht[Math.min(H-1,y+1)*W+x]-ht[Math.max(0,y-1)*W+x])/2;
    const lx=l.left*k-x-0.5,ly=-l.above*k-y-0.5,lz=l.out*k,r=Math.hypot(lx,ly,lz);return 0.15+1.6*Math.max(0,(-hx*lx-hy*ly+lz)/(r*Math.hypot(hx,hy,1)))*(lz/r)**2;};
  return {even:img(()=>0.6),shots:lamps.map((l,i)=>img(lit(l),i===0?2:0))};},{W,H,widthCm,lamps});
const buf=b=>Buffer.from(b,'base64');
await page.locator('#file').setInputFiles({name:'even.png',mimeType:'image/png',buffer:buf(png.even)});await page.waitForFunction(w=>__bench.canvas.width===w,W);await settle();
await page.locator('#calibrateSection').evaluate(e=>e.open=true);await page.locator('#lampSection').evaluate(e=>e.open=true);await page.selectOption('#calUnits','cm');
await page.locator('#calWidthN').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));},widthCm);
assert.equal(await page.locator('#lampMeasure').isDisabled(),true);assert.equal(await page.locator('#lampUse').isDisabled(),true);
await page.locator('#lampFile').setInputFiles(png.shots.map((b,i)=>({name:`lamp${i+1}.png`,mimeType:'image/png',buffer:buf(b)})));
await page.waitForFunction(()=>document.querySelectorAll('.lampRow').length===3);
for(let i=0;i<3;i++)for(const k of ['above','left','out']){const el=page.locator('.lampRow').nth(i).locator(`input[data-k=${k}]`);await el.fill(String(lamps[i][k]));await el.dispatchEvent('change');}
const r=await page.evaluate(async()=>{const {boxBlur,DRIFT_SIGMA}=await import('/src/lampphotos.js');const res=await __studio.lamp.measure();window.__lampRes=res;const W=res.w,H=res.h,t=__lampTruth,d=boxBlur(t,W,H,DRIFT_SIGMA*W);
  let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;const tv=[];for(let y=10;y<H-10;y++)for(let x=10;x<W-10;x++){const i=y*W+x,a=t[i]-d[i],b=res.height[i];sa+=a;sb+=b;saa+=a*a;sbb+=b*b;sab+=a*b;n++;tv.push(a);}
  tv.sort((a,b)=>a-b);const corr=(sab/n-sa/n*sb/n)/Math.sqrt((saa/n-(sa/n)**2)*(sbb/n-(sb/n)**2));
  const trueMm=(tv[Math.floor(tv.length*0.98)]-tv[Math.floor(tv.length*0.02)])*__bench.state.paintingWidthCm*10/W;
  return {corr,depth:res.depthMm,trueMm,check:res.check,shift:res.shots[0].align.map,state:__bench.state.textureDepthMm};});
assert.ok(r.corr>0.85,'measured vs true relief '+JSON.stringify(r));assert.ok(Math.abs(r.depth/r.trueMm-1)<0.25,'depth '+JSON.stringify(r));
assert.ok(r.check.every(c=>c>0.8),'check '+JSON.stringify(r.check));assert.ok(Math.abs(r.shift[2]-2)<0.3&&Math.abs(r.shift[5])<0.3,'alignment '+JSON.stringify(r.shift));
assert.equal(r.state,Math.min(10,Math.max(0.05,+r.depth.toFixed(2))));
assert.equal(await page.locator('#lampUse').isChecked(),true);assert.match(await page.locator('#lampResult').textContent(),/Measured relief .* mm deep.*Check: .*\(good\)/);
const on=await pixels();await page.locator('#lampUse').uncheck();await settle();const off=await pixels();assert.notEqual(on,off);await page.locator('#lampUse').check();await settle();assert.equal(await pixels(),on);
await page.locator('.lampRow').nth(0).locator('[data-act=compare]').click();await settle();
assert.equal(await setting('compareSplit'),0.5);assert.equal(await page.locator('#compareLabel').textContent(),'LAMP 1 ← → AFTER');assert.equal((await setting('graze')).lamp.left,-5);assert.equal((await setting('graze')).detail,0);
const cmp=await pixels();await page.locator('.lampRow').nth(0).locator('[data-act=compare]').click();await settle();assert.equal(await setting('compareSplit'),-1);assert.notEqual(await pixels(),cmp);
const par=await page.evaluate(async()=>{const s=__bench.state;s.maxTile=200;const c=await __bench.exportFullRes();delete s.maxTile;__bench.render();
  const W=__bench.canvas.width,H=__bench.canvas.height,a=document.createElement('canvas');a.width=W;a.height=H;const ax=a.getContext('2d');ax.drawImage(__bench.canvas,0,0);const b=document.createElement('canvas');b.width=W;b.height=H;const bx=b.getContext('2d');bx.drawImage(c,0,0);
  const da=ax.getImageData(0,0,W,H).data,db=bx.getImageData(0,0,W,H).data;let d=0;for(let i=0;i<da.length;i+=4)d+=Math.abs(da[i]-db[i]);return d/(W*H);});
assert.ok(par<1,'tiled export with measured relief matches the preview '+par);
// Saved with the project: the measured relief comes back from a downloaded project, on or off as it was.
const grab=()=>page.evaluate(()=>{__bench.render();const c=document.createElement('canvas');c.width=__bench.canvas.width;c.height=__bench.canvas.height;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);return Array.from(x.getImageData(0,0,c.width,c.height).data.filter((_,i)=>i%4===0));});
const roundTrip=async(file)=>{const dl=page.waitForEvent('download');await page.click('#downloadProject');await (await dl).saveAs(outputDir+'/'+file);await page.evaluate(()=>{document.querySelector('#projectStatus').textContent='';});
  await page.locator('#projectFile').setInputFiles(outputDir+'/'+file);await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent==='Project opened.');await settle();return JSON.parse(require('fs').readFileSync(outputDir+'/'+file,'utf8'));};
{const pre=await grab(),pj=await roundTrip('measured.json');assert.equal(pj.relief.format,'height16png');assert.equal(pj.relief.on,true);
const m=await page.evaluate(()=>{const m=__bench.measured(),t=__lampRes.height;let e=0,lo=Infinity,hi=-Infinity;for(let i=0;i<t.length;i++){e=Math.max(e,Math.abs(m.height[i]-t[i]));lo=Math.min(lo,t[i]);hi=Math.max(hi,t[i]);}return {on:m.on,w:m.w,h:m.h,err:e/(hi-lo),depth:m.info.depthMm};});
assert.ok(m.on&&m.w===W&&m.h===H&&m.err<2e-5&&Math.abs(m.depth-r.depth)<1e-9,'reloaded relief '+JSON.stringify(m));
assert.equal(await page.locator('#lampUse').isChecked(),true);assert.match(await page.locator('#lampResult').textContent(),/^Measured relief from the project, [\d.]+ mm deep\.$/);
const post=await grab();let d=0;for(let i=0;i<pre.length;i++)d+=Math.abs(pre[i]-post[i]);assert.ok(d/pre.length<0.5,'render after reopening '+d/pre.length);
await page.locator('#lampUse').uncheck();await settle();const pj2=await roundTrip('measured-off.json');assert.equal(pj2.relief.on,false);assert.equal(await page.locator('#lampUse').isChecked(),false);assert.equal(await page.locator('#lampUse').isDisabled(),false);
await page.locator('#lampUse').check();await settle();
const bad=await page.evaluate(async(pj)=>{pj.relief.lo=NaN;try{await __studio.validate(pj);const {validRelief}=await import('/src/reliefsave.js');validRelief(pj.relief);return false;}catch{return true;}},pj);assert.equal(bad,true);
console.log('PASS measured relief saved in projects, on and off');}
await page.locator('#file').setInputFiles({name:'other.png',mimeType:'image/png',buffer:buf(png.shots[1])});await page.waitForFunction(()=>document.querySelector('#lampUse').disabled);
assert.equal(await page.locator('#lampUse').isChecked(),false);assert.equal(await page.locator('.lampRow').count(),3);
console.log('PASS lamp photos: measured relief matches the truth',JSON.stringify({corr:+r.corr.toFixed(3),depth:+r.depth.toFixed(2),trueMm:+r.trueMm.toFixed(2),check:r.check.map(c=>+c.toFixed(2)),exportDiff:+par.toFixed(3)}));}
// The DSC_8382 sample (the user's tripod set) and its lamp shots, with the lamp
// positions and the panel's width filled in.
{await page.selectOption('#samplePick','dsc8382');await page.waitForFunction(()=>__bench.canvas.width===1378);await settle();
assert.equal(await page.locator('#lampSample').isHidden(),false);await page.click('#lampSample');await page.waitForFunction(()=>__studio.lamp.rows.length===6);await settle();
const rows=await page.evaluate(()=>__studio.lamp.rows.slice(3).map(r=>({name:r.name,w:r.w,h:r.h,lamp:r.lamp})));
assert.deepEqual(rows.map(r=>r.name),['DSC_8379.jpg','DSC_8380.jpg','DSC_8381.jpg']);assert.ok(rows.every(r=>r.w===1378&&r.h===1327));
assert.ok(Math.abs(rows[1].lamp.left+2.8*2.54)<1e-9&&Math.abs(rows[1].lamp.out-5.75*2.54)<1e-9);assert.ok(Math.abs(await setting('paintingWidthCm')-48.26)<1e-9);
assert.equal(await page.locator('#lampSample').isHidden(),true);await page.evaluate(()=>{__studio.lamp.rows.length=0;});
console.log('PASS DSC_8382 sample with its lamp photos');}
{page.once('dialog',d=>d.accept('streaks top left'));const [dl]=await Promise.all([page.waitForEvent('download'),page.click('#testBundle')]);const zp=outputDir+'/bundle.zip';await dl.saveAs(zp);const buf=require('fs').readFileSync(zp);const names=[];for(let o=0;o+30<buf.length&&buf.readUInt32LE(o)===0x04034b50;){const n=buf.readUInt16LE(o+26),sz=buf.readUInt32LE(o+18);names.push(buf.toString('utf8',o+30,o+30+n));if(names.at(-1)==='notes.txt')assert.equal(buf.toString('utf8',o+30+n,o+30+n+sz),'streaks top left');o+=30+n+sz;}for(const f of ['project.digilight.json','notes.txt','view-relit.png','view-original.png','view-split.png','view-shadows.png','view-height.png','original.jpg','relit-full.png','info.json'])assert.ok(names.includes(f),f);await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent.startsWith('Test bundle downloaded'));console.log('PASS export for testing bundle');}
// Shadow lift: 0 leaves the render alone; raised, it brightens the darks most near the light.
{const lum=()=>page.evaluate(()=>{__bench.render();const c=__bench.canvas,g=document.createElement('canvas');g.width=c.width;g.height=c.height;const x=g.getContext('2d');x.drawImage(c,0,0);const d=x.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height;
  const at=(u,v)=>{let s=0,n=0;for(let y=Math.floor(v*h)-5;y<Math.floor(v*h)+5;y++)for(let a=Math.floor(u*w)-5;a<Math.floor(u*w)+5;a++){const i=(y*w+a)*4;s+=d[i]+d[i+1]+d[i+2];n++;}return s/n/3;};return {near:at(.12,.12),far:at(.88,.88)};});
 const saved=await page.evaluate(()=>JSON.stringify([__bench.state.lights,__bench.state.graze]));
 await page.evaluate(()=>{const s=__bench.state;s.graze.enabled=false;s.lights.forEach((l,i)=>{l.enabled=i===0;});Object.assign(s.lights[0],{x:0,y:1,z:.3,power:.02,lift:0});});const base=await pixels(),l0=await lum();
 await page.evaluate(()=>{__bench.state.lights[0].lift=0;});assert.equal(await pixels(),base,'lift 0 is a no-op');
 await page.evaluate(()=>{__bench.state.lights[0].lift=1;});const l1=await lum();
 assert.ok(l1.near-l0.near>2*(l1.far-l0.far)&&l1.near>l0.near+5,'lift strongest near the light '+JSON.stringify([l0,l1]));
 await page.evaluate(s=>{const [L,G]=JSON.parse(s);__bench.state.lights.forEach((l,i)=>Object.assign(l,L[i]));Object.assign(__bench.state.graze,G);},saved);await page.evaluate(()=>{__bench.state.lights[0].lift=.4;__bench.state.graze.lift=.3;});
 const v=await page.evaluate(()=>__studio.validate({format:'digilight',version:1,image:'data:image/png;base64,AA',settings:__studio.snapshot()}));assert.equal(v.lights[0].lift,.4);assert.equal(v.graze.lift,.3);
 await page.evaluate(()=>{__bench.state.lights[0].lift=0;__bench.state.graze.lift=0;});await settle();
 console.log('PASS shadow lift: no-op at 0, strongest near the light, saved with the light and graze');}
// Phone: two-finger pinch zooms about the fingers, one finger pans when zoomed, a pinch that
// starts on a brush stroke drops it; Full screen hides the chrome and Exit restores it.
{const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});const m=await ctx.newPage();m.on('pageerror',e=>errors.push(e.message));
await m.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await m.waitForFunction(()=>window.__bench&&window.__studio);await m.waitForTimeout(300);
const cdp=await ctx.newCDPSession(m),touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],id)=>({x,y,id}))});
const z=()=>m.evaluate(()=>__bench.state.viewZoom),sc=()=>m.evaluate(()=>{const s=document.querySelector('#scroller');return [s.scrollLeft,s.scrollTop];});
const pinch=async(c,d0,d1)=>{await touch('touchStart',[[c[0]-d0/2,c[1]]]);await touch('touchMove',[[c[0]-d0/2,c[1]],[c[0]+d0/2,c[1]]]);await touch('touchStart',[[c[0]-d0/2,c[1]],[c[0]+d0/2,c[1]]]);for(let i=1;i<=8;i++){const d=d0+(d1-d0)*i/8;await touch('touchMove',[[c[0]-d/2,c[1]],[c[0]+d/2,c[1]]]);}await touch('touchEnd',[]);};
let b=await m.locator('#gl').boundingBox();const c=[b.x+b.width/2,b.y+b.height/2];
await pinch(c,60,180);let zz=await z();assert.ok(Math.abs(zz-3)<.15,'pinch zoom '+zz);
const s0=await sc();await touch('touchStart',[[c[0],c[1]]]);for(let i=1;i<=6;i++)await touch('touchMove',[[c[0]-10*i,c[1]-8*i]]);await touch('touchEnd',[]);const s1=await sc();assert.ok(s1[0]-s0[0]>50&&s1[1]-s0[1]>40,'one-finger pan '+JSON.stringify([s0,s1]));
await pinch(c,200,40);assert.ok(await z()<1.2,'pinch out '+await z());await m.click('#zoomFit');
await m.getByText('Local texture correction',{exact:true}).click();await m.click('#brushAdd');const n0=(await m.evaluate(()=>__bench.state.strokes.length));b=await m.locator('#gl').boundingBox();
await pinch([b.x+b.width/2,b.y+b.height/2],60,120);assert.equal(await m.evaluate(()=>__bench.state.strokes.length),n0,'a pinch drops the stroke its first finger began');await m.click('#brushOff');
await m.click('#fullView');await m.waitForTimeout(200);assert.ok(await m.locator('#studioToolbar').isHidden()&&await m.locator('#panel').isHidden()&&await m.locator('#fullExit').isVisible());
const st=await m.locator('#stage').boundingBox();assert.ok(st.width>=389&&st.height>=843,'stage fills the screen '+JSON.stringify(st));
b=await m.locator('#gl').boundingBox();await pinch([b.x+b.width/2,b.y+b.height/2],60,150);assert.ok(await z()>2,'pinch in full screen '+await z());
await m.click('#fullFit');assert.equal(await z(),1);await m.click('#fullExit');await m.waitForTimeout(200);assert.ok(await m.locator('#studioToolbar').isVisible()&&await m.locator('#fullExit').isHidden());
await ctx.close();console.log('PASS phone pinch zoom, one-finger pan, pinch cancels stroke, full screen view');}
assert.deepEqual(errors,[]);console.log('PASS no browser or WebGL errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
