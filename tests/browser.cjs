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
await page.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await page.waitForFunction(()=>window.__bench&&window.__studio);await settle();
// The panel tests below check settings and pixels exactly as each control sets them, so the guard (its own test, near the end) is off here.
await page.evaluate(()=>{__studio.guard.enabled=false;});assert.equal(await page.locator('#err').textContent(),'');console.log('PASS boot and shader compilation');
// Opens on Setup with Auto's Analyze; the desktop tests below use All (every section).
assert.equal(await page.evaluate(()=>__studio.tools.current),'setup');assert.ok(await page.locator('#autoAnalyze').isVisible()&&await page.locator('#quickSetup').isVisible()&&await page.locator('#openPhoto').isVisible()&&await page.locator('#layersSection').isHidden(),'opens on Setup with Analyze');
await page.click('#toolRail .railAll');console.log('PASS opens on Setup with Analyze');
{const relit=await pixels();await page.evaluate(()=>{document.querySelector('#layersSection').open=true;});await slider('originalTop',1);assert.equal(await setting('originalTop'),1);await page.click('#compare');const orig=await pixels();await page.click('#compare');await settle();assert.equal(await pixels(),orig);await slider('originalTop',.5);const half=await pixels();assert.notEqual(half,relit);assert.notEqual(half,orig);await slider('originalTop',0);await settle();assert.equal(await pixels(),relit);await page.evaluate(()=>{document.querySelector('#layersSection').open=false;});console.log('PASS Original on top layer opacity');}
{assert.ok(await page.locator('#toolSearchInput').isHidden(),'search bar hidden until the icon');await page.click('#searchBtn');assert.ok(await page.locator('#toolSearchInput').isVisible()&&await page.evaluate(()=>document.activeElement.id==='toolSearchInput'),'search icon opens and focuses it');
await page.fill('#toolSearchInput','batch');await settle();assert.ok(await page.locator('#toolSearchList li').count()>0);await page.keyboard.press('Enter');await settle();assert.ok(await page.evaluate(()=>document.querySelector('#saveSection').open&&!document.querySelector('[data-pane=batch]').hidden));
await page.waitForFunction(()=>!document.body.classList.contains('searchOpen'));// the pick closed it
// Open it again with the icon, which focuses it: opened without focus, the pick's deferred blur close (150 ms on) can shut it again.
await page.click('#searchBtn');await page.fill('#toolSearchInput','graze opac');await settle();await page.fill('#toolSearchInput','Shadow lift');await settle();await page.keyboard.press('Enter');await settle();assert.ok(await page.evaluate(()=>document.querySelector('#grazeSection').open||[...document.querySelectorAll('details')].some(d=>d.open)));
await page.locator('#saveSection .subTabs [data-pane=image]').click();console.log('PASS tool search opens sections and Save & export tabs');}
// Tool rail (desktop): a vertical rail between painting and panel; All (default) shows every section, a tool only its own.
{const tool=()=>page.evaluate(()=>__studio.tools.current),R=await page.locator('#toolRail').boundingBox(),S=await page.locator('#stage').boundingBox(),P=await page.locator('#panel').boundingBox();
assert.ok(R.height>R.width&&Math.abs(R.x-(S.x+S.width))<1&&Math.abs(P.x-(R.x+R.width))<1,'vertical rail between painting and panel '+JSON.stringify({R,S,P}));assert.equal(await tool(),'all');
assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#panel > *, #creative > *')].every(el=>el.dataset.tool||el.id==='creative'||el.id==='toolSearch'||el===document.querySelector('#panel').firstElementChild)),'every block belongs to a tool');
await page.click('#toolRail [data-tool=layers]');assert.equal(await tool(),'layers');assert.ok(await page.locator('#addLayer').isVisible()&&await page.locator('#autoAnalyze').isHidden()&&await page.locator('#quickSetup').isHidden()&&await page.locator('#searchBtn').isVisible());
{const W0=(await page.locator('#stage').boundingBox()).width;await page.click('#toolRail [data-tool=layers]');assert.ok(await page.evaluate(()=>__studio.tools.minimized)&&await page.locator('#panel').isHidden()&&(await page.locator('#stage').boundingBox()).width>W0+200,'same tool again minimizes the panel');
 await page.click('#toolRail [data-tool=layers]');assert.ok(!await page.evaluate(()=>__studio.tools.minimized)&&await page.locator('#addLayer').isVisible(),'and again opens it');
 const c=await page.locator('#gl').boundingBox();await page.mouse.dblclick(c.x+c.width*.93,c.y+c.height*.93);await settle();assert.ok(await page.evaluate(()=>document.body.classList.contains('fullView')),'double-click: full screen');
 const c2=await page.locator('#gl').boundingBox();await page.mouse.dblclick(c2.x+c2.width*.93,c2.y+c2.height*.93);await settle();assert.ok(!await page.evaluate(()=>document.body.classList.contains('fullView')),'double-click again leaves');
 await page.mouse.move(c.x+c.width*.9,c.y+c.height*.9);await page.mouse.down();await page.mouse.move(c.x+c.width*.7,c.y+c.height*.7,{steps:4});await page.mouse.up();await page.mouse.down();await page.mouse.up();await settle();assert.ok(!await page.evaluate(()=>document.body.classList.contains('fullView')),'a drag is not a tap');}
await page.click('#searchBtn');await page.fill('#toolSearchInput','Analyze');await settle();await page.keyboard.press('Enter');await settle();assert.equal(await tool(),'auto','search switches to the tool holding the hit');assert.ok(await page.locator('#layersSection').isHidden());
await page.click('#toolRail .railAll');assert.equal(await tool(),'all');assert.ok(await page.locator('#addLayer').isVisible()&&await page.locator('#autoAnalyze').isVisible()&&await page.locator('#quickSetup').isVisible());
await page.evaluate(()=>{document.querySelector('#layersSection').open=false;});console.log('PASS desktop tool rail: one tool at a time, search switches tool, All shows every section');}
const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');for(let y=0;y<300;y++)for(let a=0;a<240;a++){const v=120+40*Math.sin(a*.35)+25*Math.cos(y*.19);x.fillStyle=`rgb(${v},${v*.7},${v*.5})`;x.fillRect(a,y,1,1);}return c.toDataURL().split(',')[1];});
await page.locator('#file').setInputFiles({name:'painting.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});await page.waitForFunction(()=>__bench.canvas.width===240);await settle();
console.log('PASS uploaded image automatic setup');
// Auto: Analyze makes looks for this photo without changing it; a look applies in one undoable step,
// Strength mixes it with the settings it replaced (0 = exactly those), a saved preset is adapted.
{await page.evaluate(()=>{const s=__bench.state;s.textureDepthMm=9;s.graze.enabled=true;s.graze.angle=10;document.querySelector('#presetName').value='Auto test preset';document.querySelector('#savePreset').click();});
await page.waitForFunction(()=>[...document.querySelectorAll('#userPresetList option')].some(o=>o.textContent.includes('Auto test preset')));
await page.evaluate(()=>{const s=__bench.state;s.textureDepthMm=1;s.graze.enabled=false;s.graze.angle=180;__studio.restore(__studio.snapshot());__studio.checkpoint();});await settle();
const pre=await page.evaluate(()=>JSON.stringify(__studio.snapshot())),hist=await page.evaluate(()=>__studio.history.index),px0=await pixels();
await page.click('#autoAnalyze');await page.waitForFunction(()=>__studio.auto.analysis&&!document.querySelector('#autoAnalyze').disabled,null,{timeout:600000});await settle();
const A=await page.evaluate(()=>{const A=__studio.auto.analysis;return {depth:A.depth,rake:A.rake,n:A.items.length,tiles:document.querySelectorAll('#autoLooks .autoLook canvas').length,thumbW:document.querySelector('#autoLooks canvas').width,
  lines:document.querySelectorAll('#autoReadout .autoLine').length,items:A.items.map(i=>({name:i.name,kind:i.kind,exp:i.settings.exposure,depth:i.settings.textureDepthMm,g:i.settings.graze.enabled,angle:i.settings.graze.angle,rake:[i.settings.graze.elevation,i.settings.graze.detail,i.settings.graze.fine],width:i.settings.paintingWidthCm}))};});
assert.equal(await page.evaluate(()=>JSON.stringify(__studio.snapshot())),pre,'Analyze leaves the settings as they were');assert.equal(await page.evaluate(()=>__studio.history.index),hist);assert.equal(await pixels(),px0);
assert.ok(A.n>=9&&A.tiles===A.n&&A.thumbW===240&&A.lines===5,JSON.stringify(A));
// The analysis saved for the tools' disk cache and loaded back: same looks, no heightmap; refused for other settings.
const rt=await page.evaluate(async()=>{const dl=window.digilight,c=JSON.parse(JSON.stringify(await dl.getAnalysis())),was=__studio.auto.analysis,size=JSON.stringify(c).length;
  const s=await dl.setAnalysis(JSON.stringify(c)),now=__studio.auto.analysis;let other='';try{const k=JSON.parse(c.key);k[0].exposure+=1;await dl.setAnalysis({...c,key:JSON.stringify(k)});}catch(e){other=e.message;}
  return {size,hm:'hm' in (c.analysis.strokes||{}),same:JSON.stringify(now.items.map(i=>i.settings))===JSON.stringify(was.items.map(i=>i.settings))&&now.rake===was.rake&&now.depth===was.depth,
    looks:s.looks.length,tiles:document.querySelectorAll('#autoLooks .autoLook canvas').length,thumbW:now.items[0].thumb.width,other};});
assert.ok(rt.same&&!rt.hm&&rt.size<2e6&&rt.looks===A.n&&rt.tiles===A.n&&rt.thumbW===240&&/another photo or other settings/.test(rt.other),JSON.stringify(rt));assert.ok(A.depth>=.3&&A.depth<=6&&A.rake>=0&&A.rake<360,JSON.stringify(A));
const mine=A.items.find(i=>i.name==='Auto test preset');assert.ok(mine&&mine.kind==='preset'&&mine.depth===A.depth&&mine.g&&mine.angle===A.rake&&mine.width===JSON.parse(pre).paintingWidthCm,'preset adapted '+JSON.stringify(mine));
// Goldens: each built-in look's recipe as Analyze makes it on this fixture (tests/goldens/looks.json), so a change to
// any look shows as a diff. Exposure is fitted by rendering, so it may move 0.06; everything else must match.
// An intended change: UPDATE_GOLDENS=1 node tests/browser.cjs rewrites the file (commit it with the change).
{const fs=require('fs'),file=require('path').join(__dirname,'goldens','looks.json');
 const now=await page.evaluate(()=>__studio.auto.analysis.items.filter(i=>i.kind==='built-in').map(i=>({id:i.id,version:i.version,settings:i.settings})));
 const round=(v)=>typeof v==='number'?Math.round(v*1e6)/1e6:Array.isArray(v)?v.map(round):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,round(v[k])])):v;
 const cur=round(now);
 if(process.env.UPDATE_GOLDENS==='1'||!fs.existsSync(file)){fs.mkdirSync(require('path').dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(cur,null,1)+'\n');console.log('  (goldens written: tests/goldens/looks.json)');}
 const gold=JSON.parse(fs.readFileSync(file,'utf8')),diffs=[];
 const walk=(a,b,p)=>{if(diffs.length>20)return;if(typeof a==='number'&&typeof b==='number'){if(Math.abs(a-b)>(/\.exposure$/.test(p)?0.06:1e-6))diffs.push(`${p}: ${b} → ${a}`);return;}
  if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[k],b[k],p+'.'+k);return;}
  if(JSON.stringify(a)!==JSON.stringify(b))diffs.push(`${p}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);};
 walk(Object.fromEntries(cur.map(l=>[l.id,l])),Object.fromEntries(gold.map(l=>[l.id,l])),'look');
 assert.deepEqual(diffs,[],'built-in looks changed (UPDATE_GOLDENS=1 to accept):\n'+diffs.join('\n'));
 console.log('PASS built-in looks match their goldens',cur.length);}
// Built-in looks have fixed ids and recipe versions (jobs, records and LOOK_BIAS use them); applyLook takes an id.
{const L=await page.evaluate(async()=>{const d=window.digilight,out={ids:d.looks().filter(l=>l.kind==='built-in').map(l=>[l.id,l.version])};
  try{await d.applyLook('nope');}catch(e){out.bad=e.message;}
  const h=__studio.history.index;out.applied=await d.applyLook('raking-texture');out.angle=__bench.state.graze.angle;out.steps=__studio.history.index-h;await d.undo();out.back=JSON.stringify(__studio.snapshot());return out;});
 assert.deepEqual(L.ids.map(l=>l[0]),['gallery','gallery-spot','matched','matched-raking','favourite','favourite-left','favourite-side-lamp','raking-texture','long-shadows','soft-window','museum-spot']);
 assert.deepEqual(L.ids.find(l=>l[0]==='favourite-side-lamp'),['favourite-side-lamp',5]);assert.match(L.bad,/No look "nope".*Raking texture \(raking-texture\)/);
 assert.ok(L.applied.id==='raking-texture'&&L.applied.look==='Raking texture'&&L.angle===A.rake&&L.steps===1,JSON.stringify(L.applied));assert.equal(L.back,pre,'undo');
 console.log('PASS built-in looks: fixed ids and versions, applyLook by id');}
// Round 2's keepers in the favourite looks: deeper relief over the fitted depth (auto.js deeper()).
for(const n of ['Favourite, side lamp left','Favourite, from the left']){const f=A.items.find(i=>i.name===n);assert.ok(f&&f.depth===Math.min(10,Math.round(A.depth*1.65*100)/100)&&f.g,n+' '+JSON.stringify(f));assert.deepEqual(f.rake,[6,n==='Favourite, side lamp left'?0.03:0.02,0.15],'round 5: lower raking, side lamp smoothed more '+n);}
const rk=A.items.find(i=>i.name==='Raking texture');assert.ok(rk.g&&rk.angle===A.rake&&rk.depth===A.depth&&Math.abs(rk.exp)<=3);
await page.locator('.autoLook',{hasText:'Raking texture'}).click();await settle();
const on=await page.evaluate(()=>{const s=__bench.state;return {g:s.graze.enabled,angle:s.graze.angle,depth:s.textureDepthMm,exp:s.exposure,op:s.graze.opacity,tile:document.querySelector('.autoLook.on span').textContent};});
assert.ok(on.g&&on.angle===A.rake&&on.depth===A.depth&&on.exp===rk.exp&&on.tile==='Raking texture',JSON.stringify(on));assert.notEqual(await pixels(),px0);
await slider('autoStrength',0);assert.equal(await page.evaluate(()=>JSON.stringify(__studio.snapshot())),pre,'Strength 0 is the settings before the look');assert.equal(await pixels(),px0);
await slider('autoStrength',.5);const half=await page.evaluate(()=>({exp:__bench.state.exposure,op:__bench.state.graze.opacity,depth:__bench.state.textureDepthMm}));const P=JSON.parse(pre);
assert.ok(Math.abs(half.exp-(P.exposure+rk.exp)/2)<1e-9&&Math.abs(half.op-on.op/2)<1e-9&&Math.abs(half.depth-(P.textureDepthMm+A.depth)/2)<1e-9,JSON.stringify(half));
await slider('autoStrength',1);assert.equal(await setting('exposure'),rk.exp);
await page.click('#autoUndo');await settle();assert.ok(Math.abs(await setting('exposure')-half.exp)<1e-9,'Undo goes back to Strength 50%');
await slider('exposure',1.5);await slider('paintingWidthCm',80);await page.locator('.autoLook',{hasText:/^Gallery$/}).click();await settle();assert.ok(await page.evaluate(()=>__bench.state.graze.enabled)===false);
assert.equal(await setting('paintingWidthCm'),80,'a look keeps the photo\'s current width');assert.equal(await setting('textureDepthMm'),A.depth);
await slider('autoStrength',0);assert.equal(await setting('exposure'),1.5,'a look picked after a hand change mixes with the changed settings');
const mix=await page.evaluate(async()=>{const {mixSettings}=await import('/src/auto.js');const L=(x,p)=>({x,y:.5,z:1,power:p,kelvin:4000,cone:0,softness:.5,size:.02});
  const a={exposure:0,lights:[L(0,2)],graze:{enabled:false,angle:350,opacity:.5},layers:[],strokes:[1]},b={exposure:1,lights:[L(1,4),L(1,8)],graze:{enabled:true,angle:10,opacity:.8},layers:[{mode:'normal'}],strokes:[]};
  const m=mixSettings(a,b,.5);return {n:m.lights.length,x:m.lights[0].x,p:[m.lights[0].power,m.lights[1].power],g:[m.graze.angle,m.graze.opacity],layers:m.layers.length,strokes:m.strokes.length,
  angle:mixSettings({...a,graze:{...a.graze,enabled:true}},b,.5).graze.angle};});
assert.deepEqual(mix,{n:2,x:.5,p:[3,4],g:[10,.4],layers:1,strokes:1,angle:0},JSON.stringify(mix));
await page.evaluate(p=>{__studio.restore(JSON.parse(p));__studio.checkpoint();},pre);await settle();
console.log('PASS Auto: Analyze leaves settings, looks for this photo, saved and loaded (cache), pick, Strength mix, Undo, saved preset adapted',JSON.stringify({depth:A.depth,rake:A.rake,looks:A.n}));}
// Auto looks side by side: press and hold a look shows it until let go (no undo step, not picked);
// Compare full screen renders the looks in the batch viewer; Pin as A makes Hold flip to that look.
{const before=await page.evaluate(()=>JSON.stringify(__studio.snapshot())),hi=await page.evaluate(()=>__studio.history.index),act=await page.evaluate(()=>__studio.auto.active?.index??null);
const tile=page.locator('#autoLooks .autoLook').nth(1);await tile.scrollIntoViewIfNeeded();const tb=await tile.boundingBox();
await page.mouse.move(tb.x+tb.width/2,tb.y+tb.height/2);await page.mouse.down();await page.waitForTimeout(700);
const during=await page.evaluate(()=>({snap:JSON.stringify(__studio.snapshot()),held:!!document.querySelector('#autoLooks .autoLook.held'),hist:__studio.history.index}));
await page.mouse.up();await page.waitForTimeout(500);
const after=await page.evaluate(()=>({snap:JSON.stringify(__studio.snapshot()),held:!!document.querySelector('#autoLooks .autoLook.held'),hist:__studio.history.index,act:__studio.auto.active?.index??null}));
assert.ok(during.held&&during.snap!==before&&during.hist===hi,'holding shows the look');assert.equal(after.snap,before,'let go: back as it was');assert.ok(!after.held&&after.hist===hi&&after.act===act,'not picked, no undo step');
await page.evaluate(()=>{document.querySelector('#batchDetail').value='fast';});
await page.click('#autoCompare');await page.waitForFunction(()=>!document.querySelector('#batchViewer').hidden,null,{timeout:300000});
const v=await page.evaluate(()=>{const A=__studio.auto.analysis,b=__batch.batch;return {n:b.items.length,names:b.items.map(i=>i.name),want:A.items.map(i=>i.name),exp:b.items[1].settings.exposure,wantExp:A.items[0].settings.exposure,src:document.querySelector('#batchSource').value};});
assert.equal(v.src,'auto');assert.equal(v.n,Math.min(10,v.want.length+1));assert.equal(v.names[0],'Current look');assert.deepEqual(v.names.slice(1),v.want.slice(0,v.n-1));assert.equal(v.exp,v.wantExp,'a look as Auto made it');
assert.equal(await page.evaluate(()=>JSON.stringify(__studio.snapshot())),before);assert.equal(await page.evaluate(()=>__studio.history.index),hi);
const src=()=>page.evaluate(()=>({img:document.querySelector('#bvImg').src,tag:document.querySelector('#bvTag').textContent,hold:document.querySelector('#bvHold').textContent}));
await page.evaluate(()=>__batch.viewer.go(1));await page.click('#bvPin');assert.equal(await page.textContent('#bvPin'),'Unpin A');assert.equal(await page.evaluate(()=>__batch.viewer.pinned),1);
await page.click('#bvNext');const hb=await page.locator('#bvHold').boundingBox();assert.match((await src()).hold,/Hold: A·02/);
await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();const held=await src();await page.mouse.up();const back=await src();
const urls=await page.evaluate(()=>__batch.batch.items.map(i=>i.url));
assert.equal(held.img,urls[1]);assert.equal(held.tag,'A · LOOK 02');assert.equal(back.img,urls[2]);
await page.keyboard.press('p');assert.equal(await page.evaluate(()=>__batch.viewer.pinned),2,'P pins the look on screen');await page.keyboard.press('p');assert.equal(await page.evaluate(()=>__batch.viewer.pinned),null);
await page.click('#bvClose');await page.evaluate(()=>{const s=document.querySelector('#batchSource');s.value='sweep';s.dispatchEvent(new Event('change'));document.querySelector('#batchDetail').value='sharp';});console.log('PASS Auto looks: press and hold previews, Compare full screen, Pin as A',v.n);}
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
await page.click('#undo');await settle();assert.equal((await setting('graze')).elevation,4,'new graze light starts as Broad soft raking');
const checked=await page.evaluate(()=>__studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:__studio.snapshot()}).graze);assert.deepEqual(checked,await setting('graze'));
await page.locator('#grazeSection').screenshot({path:outputDir+'/graze-panel.png'});await page.screenshot({path:outputDir+'/graze.png'});
await slider('grazeOpacity',0.5);{const d=await page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,240,300).data;__bench.state.maxTile=160;const t=await __bench.exportFullRes();const b=t.getContext('2d').getImageData(0,0,240,300).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});assert.ok(d<1,'graze tile difference '+d);}
// Detail: the graze light's own smoothed relief, in painting widths. The widest Detail
// reads 3 sigma past each export tile, so the tiled export must still match the preview.
assert.equal((await setting('graze')).detail,0.02);const atDefault=await pixels();await slider('grazeDetail',0);const allDetail=await pixels();assert.notEqual(allDetail,atDefault);
await slider('grazeDetail',0.03);const widest=await pixels();assert.notEqual(widest,allDetail);await slider('grazeFine',0);assert.equal((await setting('graze')).fine,0);assert.notEqual(await pixels(),widest);
{const d=await page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,240,300).data;__bench.state.maxTile=160;const t=await __bench.exportFullRes();const b=t.getContext('2d').getImageData(0,0,240,300).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});assert.ok(d<1,'graze detail tile difference '+d);}
{const v=await page.evaluate(()=>{const check=g=>{const s=__studio.snapshot();s.graze=g;try{return __studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:s}).graze;}catch{return null;}};const base={enabled:true,angle:10,elevation:2,opacity:1};return {legacy:check(base),bad:check({...base,detail:0.5}),badFine:check({...base,detail:0.01,fine:2}),badReach:check({...base,reach:1.5}),badClean:check({...base,clean:-0.1}),badSoft:check({...base,soft:1.5}),badSoftLow:check({...base,soft:-0.1}),softened:check({...base,soft:0.5}),reached:check({...base,detail:0.01,reach:0.5,clean:0.25,soft:1})};});
assert.deepEqual(v.legacy,{enabled:true,angle:10,elevation:2,opacity:1,detail:0,fine:1,reach:0,clean:0,soft:0});assert.equal(v.bad,null);assert.equal(v.badFine,null);
assert.equal(v.badReach,null);assert.equal(v.badClean,null);assert.equal(v.badSoft,null);assert.equal(v.badSoftLow,null);assert.equal(v.softened.soft,0.5);assert.deepEqual(v.reached,{enabled:true,angle:10,elevation:2,opacity:1,detail:0.01,fine:1,reach:0.5,clean:0.25,soft:1});}
await page.click('#undo');await settle();assert.equal((await setting('graze')).fine,0.15);assert.equal(await pixels(),widest);
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
await page.click('#undo');await settle();assert.equal((await setting('graze')).soft,0.4);assert.equal(await pixels(),short);
// Presets: each sets every field but keeps the direction; the dropdown names the look the values match, else ''.
{const preset=name=>page.evaluate(async n=>(await import('/src/presets.js')).grazePresets[n],name),shown=()=>page.locator('#grazePreset').inputValue();
const tileDiff=()=>page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=240;c.height=300;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,240,300).data;__bench.state.maxTile=160;const t=await __bench.exportFullRes();const b=t.getContext('2d').getImageData(0,0,240,300).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});
const names=await page.evaluate(()=>[...document.querySelectorAll('#grazePreset option')].map(o=>o.value).filter(Boolean));assert.equal(names.length,7);assert.ok(names.includes('Long shadows')&&names.includes('Broad soft raking'));
assert.equal(await shown(),'');const angle=(await setting('graze')).angle,long=await preset('Long shadows');
await page.selectOption('#grazePreset','Long shadows');await settle();gz=await setting('graze');assert.equal(gz.angle,angle);assert.equal(gz.enabled,true);for(const k of Object.keys(long))assert.equal(gz[k],long[k],k);assert.equal(Object.keys(long).length,8);assert.equal(await shown(),'Long shadows');
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
await page.selectOption('.lyMode','multiply');await settle();const mult=await pixels();assert.notEqual(mult,pin);{await page.click('.lyModeBtn');await page.hover('.blendMenu li[data-mode=screen]');await settle();const prev=await pixels();assert.notEqual(prev,mult);assert.equal((await setting('layers'))[0].mode,'screen');
await page.mouse.click(5,300);await settle();assert.equal(await page.locator('.blendMenu').count(),0);assert.equal((await setting('layers'))[0].mode,'multiply');assert.equal(await pixels(),mult);
await page.click('.lyModeBtn');await page.click('.blendMenu li[data-mode=screen]');await settle();assert.equal((await setting('layers'))[0].mode,'screen');assert.equal(await pixels(),prev);assert.ok((await page.locator('.lyModeBtn').textContent()).startsWith('Screen'));
await page.selectOption('.lyMode','multiply');await settle();assert.equal(await pixels(),mult);console.log('PASS blend mode hover preview, click outside restores, click applies');}await page.click('.lyVis');await settle();assert.equal(await pixels(),noLayer);await page.click('.lyVis');
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
await page.evaluate(()=>{document.querySelector('#saveSection').open=true;});await page.locator('#saveSection .subTabs [data-pane=presets]').click();await page.fill('#presetName','My gallery look');const presetStrength=await setting('fineRelief');await page.evaluate(()=>{document.querySelector('#presetStatus').textContent='';});await page.click('#savePreset');await page.waitForFunction(()=>document.querySelector('#presetStatus').textContent.startsWith('Saved'));
await slider('fineRelief',.15);await page.click('#applyPreset');await settle();assert.equal(await setting('fineRelief'),presetStrength);await page.click('#undo');await settle();assert.equal(await setting('fineRelief'),.15);await page.click('#redo');await settle();assert.equal(await setting('fineRelief'),presetStrength);
await page.check('#defaultPreset');await page.waitForFunction(()=>document.querySelector('#presetStatus').textContent.startsWith('This preset'));
const presetDownload=page.waitForEvent('download');await page.click('#downloadPreset');const presetFile=await presetDownload;await presetFile.saveAs(outputDir + '/preset.json');
await slider('fineRelief',.25);await page.locator('#file').setInputFiles({name:'next-painting.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});await page.waitForFunction(v=>__bench.state.fineRelief===v,presetStrength);assert.equal(await setting('strokes').then(s=>s.length),0);
await page.uncheck('#defaultPreset');await page.locator('#presetFile').setInputFiles(outputDir + '/preset.json');await page.waitForFunction(()=>document.querySelector('#presetStatus').textContent.startsWith('Imported'));assert.equal(await setting('fineRelief'),presetStrength);assert.equal(await page.locator('#userPresetList option').count(),3);console.log('PASS reusable preset save/apply/undo/default/download/import');
await page.locator('#saveSection .subTabs [data-pane=projects]').click();await page.fill('#projectName','Test painting');await page.click('#saveProject');await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent.startsWith('Saved in'));const saved=await page.evaluate(()=>__studio.snapshot());
await slider('fineRelief',.1);await page.click('#loadProject');await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent==='Project opened.');await settle();assert.deepEqual(await page.evaluate(()=>__studio.snapshot()),saved);
await page.click('#saveVariation');await page.waitForFunction(()=>document.querySelector('#projectList').options.length===3);console.log('PASS save/open and variations with photo and mask');
const projectDownload=page.waitForEvent('download');await page.click('#downloadProject');const projectFile=await projectDownload;await projectFile.saveAs(outputDir + '/project.json');
await slider('fineRelief',.2);await page.locator('#projectFile').setInputFiles(outputDir + '/project.json');await page.waitForFunction(()=>__bench.state.fineRelief!==.2);await settle();assert.equal(await setting('fineRelief'),saved.fineRelief);console.log('PASS portable project import/export');
await page.locator('#saveSection .subTabs [data-pane=image]').click();await page.click('#compare');{const dl=page.waitForEvent('download');await page.click('#exportBtn');const orig=await dl;assert.ok(orig.suggestedFilename().startsWith('original-'),orig.suggestedFilename());await orig.saveAs(outputDir+'/original.png');await page.waitForFunction(()=>!document.querySelector('#exportBtn').disabled);assert.equal(await setting('viewMode'),4);
const d=await page.evaluate(async b=>{const im=new Image();await new Promise(r=>{im.onload=r;im.src='data:image/png;base64,'+b});__bench.render();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const a=x.getImageData(0,0,c.width,c.height).data;x.drawImage(__bench.canvas,0,0);const e=x.getImageData(0,0,c.width,c.height).data;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-e[i]);return sum/a.length;},require('fs').readFileSync(outputDir+'/original.png').toString('base64'));assert.ok(d<2,'before export vs before view '+d);}
await page.click('#compare');await settle();console.log('PASS Before view exports the original without effects');
const download=page.waitForEvent('download');await page.click('#exportBtn');const image=await download;await image.saveAs(outputDir + '/export.png');await page.waitForFunction(()=>!__bench.state.exporting&&!document.querySelector('#exportBtn').disabled);
assert.equal(await page.locator('#err').textContent(),'');console.log('PASS PNG export and preview restoration');
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
// Checked as the slider moves: the overlay comes back 250 ms after the view is still again.
await page.waitForFunction(()=>__bench.sharp());assert.equal(await page.locator('#fineRelief').evaluate(el=>{el.value=1.1;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return __bench.sharp();}),null,'a slider hides it');await settle();
await page.waitForFunction(()=>__bench.sharp());await page.click('#zoomFit');await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>__bench.sharp()),null);
console.log('PASS sharp zoom overlay matches full-resolution export',JSON.stringify({diff:+r.diff.toFixed(4),preview:+r.soft.toFixed(2),rect:r.rect}));}
await page.setViewportSize({width:390,height:844});await settle();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const mobile=await page.locator('#gl').boundingBox();assert.ok(mobile.width>100&&mobile.height>100);await page.screenshot({path:outputDir + '/mobile-tested.png'});
for(let i=0;i<9;i++)await page.click('#zoomIn');await settle();assert.equal(await setting('viewZoom'),10);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#scroller').scrollWidth>document.querySelector('#scroller').clientWidth*2));
await page.click('#zoomFit');await page.setViewportSize({width:1350,height:900});await settle();console.log('PASS mobile layout, also at 1000%');
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
  return {corr,depth:res.depthMm,trueMm,check:res.check,shift:res.shots[0].align.map,state:__bench.state.textureDepthMm,fit:res.fit&&{depth:res.fit.depth,reached:res.fit.reached}};});
assert.ok(r.corr>0.85,'measured vs true relief '+JSON.stringify(r));assert.ok(Math.abs(r.depth/r.trueMm-1)<0.25,'depth '+JSON.stringify(r));
assert.ok(r.check.every(c=>c>0.8),'check '+JSON.stringify(r.check));assert.ok(Math.abs(r.shift[2]-2)<0.3&&Math.abs(r.shift[5])<0.3,'alignment '+JSON.stringify(r.shift));
assert.ok(r.fit,'Measure relief fits the depth');assert.equal(r.state,r.fit.reached==='yes'?r.fit.depth:Math.min(10,Math.max(0.05,+r.depth.toFixed(2))),JSON.stringify(r.fit));assert.match(await page.locator('#lampFitResult').textContent(),/^Texture depth [\d.]+ mm/);
assert.equal(await page.locator('#lampUse').isChecked(),true);assert.match(await page.locator('#lampResult').textContent(),/Measured relief .* mm deep.*Check: .*\(good\)/);
const on=await pixels();await page.locator('#lampUse').uncheck();await settle();const off=await pixels();assert.notEqual(on,off);await page.locator('#lampUse').check();await settle();assert.equal(await pixels(),on);
await page.locator('.lampRow').nth(0).locator('[data-act=compare]').click();await settle();
assert.equal(await setting('compareSplit'),0.5);assert.equal(await page.locator('#compareLabel').textContent(),'LAMP 1 ← → AFTER');assert.equal((await setting('graze')).lamp.left,-5);assert.equal((await setting('graze')).detail,0);assert.equal((await setting('graze')).fill,0.25);
const cmp=await pixels();await page.locator('.lampRow').nth(0).locator('[data-act=compare]').click();await settle();assert.equal(await setting('compareSplit'),-1);assert.notEqual(await pixels(),cmp);
const par=await page.evaluate(async()=>{const s=__bench.state;s.maxTile=200;const c=await __bench.exportFullRes();delete s.maxTile;__bench.render();
  const W=__bench.canvas.width,H=__bench.canvas.height,a=document.createElement('canvas');a.width=W;a.height=H;const ax=a.getContext('2d');ax.drawImage(__bench.canvas,0,0);const b=document.createElement('canvas');b.width=W;b.height=H;const bx=b.getContext('2d');bx.drawImage(c,0,0);
  const da=ax.getImageData(0,0,W,H).data,db=bx.getImageData(0,0,W,H).data;let d=0;for(let i=0;i<da.length;i+=4)d+=Math.abs(da[i]-db[i]);return d/(W*H);});
assert.ok(par<1,'tiled export with measured relief matches the preview '+par);
// Saved with the project: the measured relief comes back from a downloaded project, on or off as it was.
const grab=()=>page.evaluate(()=>{__bench.render();const c=document.createElement('canvas');c.width=__bench.canvas.width;c.height=__bench.canvas.height;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);return Array.from(x.getImageData(0,0,c.width,c.height).data.filter((_,i)=>i%4===0));});
const roundTrip=async(file)=>{await page.evaluate(()=>{document.querySelector('#saveSection').open=true;document.querySelector('#saveSection .subTabs [data-pane=projects]').click();});const dl=page.waitForEvent('download');await page.click('#downloadProject');await (await dl).saveAs(outputDir+'/'+file);await page.evaluate(()=>{document.querySelector('#projectStatus').textContent='';});
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
// Fit depth to photos (texscore.js, RL-Sq style): the score is 0 on flat grey and close to 0
// on a smooth pool of light, about the same at two resolutions of one painting; the fit
// brackets render / photo contrast = 1, keeps every other setting and is one undo step.
{const u=await page.evaluate(async()=>{const {textureScore}=await import('/src/texscore.js');
  const mk=(W,H,f)=>{const d=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=Math.round(255*f(x/W,y/H)),o=(y*W+x)*4;d[o]=d[o+1]=d[o+2]=v;d[o+3]=255;}return d;};
  // strokes 30 mm apart on a 300 mm wide painting, under a lamp brighter on the right (the
  // light blur is in pixels, so finer strokes lose more of their contrast at the lower resolution)
  const strokes=W=>{const H=W*2/3;return textureScore(mk(W,H,(x,y)=>(0.3+0.4*x)*(1+0.2*Math.sin(2*Math.PI*x*300/30)*Math.sin(2*Math.PI*y*200/30))),W,H,300/W).score;};
  return {flat:textureScore(mk(300,200,()=>0.5),300,200,1).score,pool:textureScore(mk(300,200,(x,y)=>0.2+0.6*x*(1-0.5*y)),300,200,1).score,s300:strokes(300),s600:strokes(600)};});
assert.equal(u.flat,0);assert.ok(u.pool<0.01,'pool of light '+JSON.stringify(u));assert.ok(u.s300>0.01&&Math.abs(u.s600/u.s300-1)<0.12,'resolution '+JSON.stringify(u));
const f=await page.evaluate(async()=>{__bench.state.textureDepthMm=3;__bench.dirty();__bench.render();__studio.checkpoint();const before=__studio.snapshot(),hi=__studio.history.index;const r=await __studio.lamp.fitDepth();
  return {depth:r.depth,reached:r.reached,samples:r.samples,lamps:r.lamps.map(l=>l.depth),per:r.lamps.map(l=>l.samples.map(x=>[+x[0].toFixed(3),+x[1].toFixed(3)])),photo:r.photo,before:JSON.stringify(before),after:JSON.stringify(__studio.snapshot()),hi,hi2:__studio.history.index};});
assert.equal(f.reached,'yes',JSON.stringify(f.samples));assert.equal(await setting('textureDepthMm'),f.depth);assert.equal(f.hi2,f.hi+1);
const t=[...f.samples].sort((a,b)=>a[0]-b[0]);assert.ok(t.at(-1)[1]>t[0][1],'contrast rises with depth '+JSON.stringify(t));
const lo=t.filter(s=>s[0]<=f.depth).at(-1),up=t.find(s=>s[0]>=f.depth);assert.ok(lo[1]<1&&up[1]>=1&&up[0]/lo[0]<1.1,'bracket '+JSON.stringify([lo,up]));
// Only the depth changes, calibrated, and with it what calibrated mode derives from it (studio.js DERIVED).
const strip=j=>{const o=JSON.parse(j);for(const k of ['textureDepthMm','physical','heightScale','reliefStrength'])delete o[k];return JSON.stringify(o);};assert.equal(strip(f.after),strip(f.before));
assert.match(await page.locator('#lampFitResult').textContent(),/^Texture depth [\d.]+ mm: the renders match .*Each lamp alone: 1: ((under|over) )?[\d.]+ mm · 2: ((under|over) )?[\d.]+ mm · 3: ((under|over) )?[\d.]+ mm/,JSON.stringify(f.per));
await page.click('#undo');await settle();assert.equal(await setting('textureDepthMm'),JSON.parse(f.before).textureDepthMm);await page.click('#redo');await settle();assert.equal(await setting('textureDepthMm'),f.depth);
console.log('PASS texture contrast score and Fit depth to photos',JSON.stringify({...u,depth:f.depth,lamps:f.lamps.map(d=>d&&+d.toFixed(2)),photo:f.photo.map(p=>+p.toFixed(4)),tries:f.samples.length}));}
// Profile · height map (probe.js): ISO roughness numbers on known surfaces; the render's
// heights read back the right way up; a dragged line gives the measured relief's profile
// in mm; the colour height map has a scale bar in mm/µm.
{const k=await page.evaluate(async()=>{const {areaStats,lineStats,profile}=await import('/src/probe.js');
  const W=200,H=100,A=0.3,Z=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)Z[y*W+x]=A*Math.sin(2*Math.PI*x/20)+0.002*x-0.001*y+5;
  const a=areaStats(Z,W,H);const sq=new Float32Array(400).map((_,i)=>(Math.floor(i/10)%2?A:-A)+0.01*i),d=new Float32Array(400).map((_,i)=>i*0.1);const l=lineStats(d,sq);
  const p=profile(Z,W,H,10,50,110,50,0.5);return {Sq:a.Sq,Sa:a.Sa,Ssk:a.Ssk,Sku:a.Sku,Rz:l.Rz,Rq:l.Rq,len:p.d.at(-1),z0:p.z[0]};});
assert.ok(Math.abs(k.Sq-0.3/Math.SQRT2)<0.003&&Math.abs(k.Sa-0.6/Math.PI)<0.003&&Math.abs(k.Ssk)<0.02&&Math.abs(k.Sku-1.5)<0.04,'sine surface '+JSON.stringify(k));
assert.ok(Math.abs(k.Rz-0.6)<0.06&&Math.abs(k.Rq-0.3)<0.01&&Math.abs(k.len-50)<1e-6,'square line '+JSON.stringify(k));
const rb=await page.evaluate(()=>{const m=__bench.measured(),r=__bench.heights();let sa=0,sb=0,saa=0,sbb=0,sab=0;const n=r.a.length;for(let i=0;i<n;i++){const a=r.a[i],b=m.height[i];sa+=a;sb+=b;saa+=a*a;sbb+=b*b;sab+=a*b;}
  return {w:r.w,h:r.h,corr:(sab/n-sa/n*sb/n)/Math.sqrt((saa/n-(sa/n)**2)*(sbb/n-(sb/n)**2))};});
assert.ok(rb.w===W&&rb.h===H&&rb.corr>0.999,'heights read back the right way up '+JSON.stringify(rb));
await page.locator('#probeSection').evaluate(e=>e.open=true);const lights=JSON.stringify(await setting('lights')),strokes=(await setting('strokes')).length;
await page.click('#probeLine');const gb=await page.locator('#gl').boundingBox();
await page.mouse.move(gb.x+gb.width*.2,gb.y+gb.height*.5);await page.mouse.down();await page.mouse.move(gb.x+gb.width*.8,gb.y+gb.height*.5,{steps:6});await page.mouse.up();await settle();
assert.equal(JSON.stringify(await setting('lights')),lights);assert.equal((await setting('strokes')).length,strokes);
assert.match(await page.locator('#probeLineStats').textContent(),/^Line [\d.]+ mm: P-V \(Rz\) [\d.]+ (µm|mm), RMS \(Rq\) [\d.]+ (µm|mm)/);
assert.match(await page.locator('#probeArea').textContent(),/Region in view .*measured relief .*Sq [\d.]+ (µm|mm), Sa .*Ssk -?[\d.]+, Sku [\d.]+/);assert.equal(await page.locator('#probePlot').isHidden(),false);
const pr=await page.evaluate(()=>{const r=__studio.probe.measure(),m=__bench.measured(),mm=__bench.state.paintingWidthCm*10/m.w,[x0,y0,x1,y1]=r.line,i=r.profile.z.length>>1;
  const x=Math.round((x0+x1)/2-0.5),y=Math.round((y0+y1)/2-0.5);return {source:r.source,len:r.lineStats.length,want:Math.hypot(x1-x0,y1-y0)*mm,mid:r.profile.z[i],truth:m.height[y*m.w+x]*mm,Sq:r.area.Sq};});
assert.equal(pr.source,'measured');assert.ok(Math.abs(pr.len-pr.want)<1e-3&&Math.abs(pr.len-0.6*widthCm*10)<0.03*widthCm*10,'line length '+JSON.stringify(pr));assert.ok(Math.abs(pr.mid-pr.truth)<0.02*pr.Sq*10+1e-3,'profile reads the measured heights '+JSON.stringify(pr));
await page.click('#probeLine');const grey=(await page.click('#probeMapGrey'),await settle(),await pixels());assert.equal(await setting('viewMode'),2);assert.equal(await page.locator('#heightBar').isVisible(),true);
await page.click('#probeMapColour');await settle();assert.equal(await setting('heightColour'),1);assert.notEqual(await pixels(),grey);
assert.match(await page.locator('#heightBar').textContent(),/^Height, measured .*-[\d.]+ (µm|mm)0[\d.]+ (µm|mm)$/);assert.equal(await page.locator('#views button.on').textContent(),'Height');
await page.evaluate(()=>{__bench.state.viewMode=0;__bench.state.heightColour=0;document.dispatchEvent(new Event('digilight:views'));__bench.render();});await settle();assert.equal(await page.locator('#heightBar').isHidden(),true);
console.log('PASS profile probe, ISO roughness and colour height map',JSON.stringify({sine:{Sq:+k.Sq.toFixed(4),Sku:+k.Sku.toFixed(3)},readback:+rb.corr.toFixed(5),line:+pr.len.toFixed(1),Sq:+pr.Sq.toFixed(3)}));}
// Photo checks (photocheck.js, doc items 14–16): clipping shares and the warning on a lamp
// photo; stroke direction of known stripes; glints added to one lamp photo are found and
// left out; Best raking direction keeps the strongest of four directions, one undo step.
{const u=await page.evaluate(async()=>{const {clipping,strokeDirection,nearerSide}=await import('/src/photocheck.js');
  const px=new Uint8ClampedArray(100*100*4).fill(128);for(let i=0;i<150;i++)px.set([255,255,255],i*4*7);const c=clipping(px),ok=clipping(new Uint8ClampedArray(400).fill(128));
  const W=160,H=120,al=30*Math.PI/180,Z=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)Z[y*W+x]=Math.sin(2*Math.PI*(x*Math.cos(al)-y*Math.sin(al))/9);
  return {hi:c.hi,warn:c.warn,okWarn:ok.warn,dir:strokeDirection(Z,W,H),side:nearerSide(30,200)};});
assert.ok(Math.abs(u.hi-0.015)<1e-9&&/1\.5% blown highlights/.test(u.warn)&&u.okWarn==='','clipping '+JSON.stringify(u));
assert.ok(Math.abs(u.dir.acrossDeg-30)<2&&Math.abs(u.dir.strokeDeg-120)<2&&u.dir.coherence>0.9&&u.side===210,'stroke direction '+JSON.stringify(u));
const clipped=await page.evaluate(({W,H})=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#806050';x.fillRect(0,0,W,H);x.fillStyle='#fff';x.fillRect(10,10,40,40);return c.toDataURL('image/png').split(',')[1];},{W,H});
await page.locator('#lampFile').setInputFiles({name:'blown.png',mimeType:'image/png',buffer:buf(clipped)});await page.waitForFunction(()=>document.querySelectorAll('.lampRow').length===4);
assert.match(await page.locator('.lampRow').nth(3).locator('.lampClip').textContent(),/Overexposed .*1\.1% blown highlights/);assert.equal(await page.locator('.lampRow').nth(1).locator('.lampClip').count(),0);
await page.locator('.lampRow').nth(3).locator('[data-act=del]').click();await page.waitForFunction(()=>document.querySelectorAll('.lampRow').length===3);
const g=await page.evaluate(async()=>{const r=__studio.lamp.rows[1],c=document.createElement('canvas');c.width=r.w;c.height=r.h;const x=c.getContext('2d');x.drawImage(r.img,0,0);
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;x.fillStyle='rgb(246,244,240)';for(let i=0;i<260;i++)x.fillRect(Math.floor(rnd()*(r.w-2)),Math.floor(rnd()*(r.h-2)),2,2);
  r.img=await createImageBitmap(c);const t=__lampTruth,W=r.w,H=r.h,{boxBlur,DRIFT_SIGMA}=await import('/src/lampphotos.js'),d=boxBlur(t,W,H,DRIFT_SIGMA*W);
  const corr=h=>{let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;for(let y=10;y<H-10;y++)for(let x=10;x<W-10;x++){const i=y*W+x,a=t[i]-d[i],b=h[i];sa+=a;sb+=b;saa+=a*a;sbb+=b*b;sab+=a*b;n++;}return (sab/n-sa/n*sb/n)/Math.sqrt((saa/n-(sa/n)**2)*(sbb/n-(sb/n)**2));};
  const a=await __studio.lamp.measure({glints:false,fit:false}),ca=corr(a.height),b=await __studio.lamp.measure({fit:false}),cb=corr(b.height);
  return {corrOff:ca,corrOn:cb,checkOff:a.check,checkOn:b.check,glint:b.shots.map(s=>s.glint)};});
assert.ok(g.glint[1]>0.003&&g.glint[1]>4*Math.max(g.glint[0],g.glint[2]),'glints found in the glinted photo only '+JSON.stringify(g));
assert.ok(g.corrOn>g.corrOff&&g.checkOn[1]>g.checkOff[1],'leaving glints out helps '+JSON.stringify(g));assert.match(await page.locator('#lampResult').textContent(),/Glints left out: [\d.]+%, [\d.]+%, [\d.]+% of each lamp photo/);
const hi=await page.evaluate(()=>__studio.history.index),a0=(await setting('graze')).angle;const br=await page.evaluate(()=>{const r=__studio.bestRaking();return {from:r.best.from,best:r.best.score,scores:r.tries.map(t=>t.score),coh:r.coherence};});
assert.equal((await setting('graze')).angle,br.from);assert.equal(br.best,Math.max(...br.scores));assert.equal(await page.evaluate(()=>__studio.history.index),hi+1);
assert.match(await page.locator('#grazeBestNote').textContent(),/^Strokes run mostly at \d+°.*coherence [\d.]+ \(measured relief\)\. Stroke contrast .*Light now from \d+°/);
await page.click('#undo');await settle();assert.equal((await setting('graze')).angle,a0);
console.log('PASS photo checks: clipping warning, stroke direction, glints left out, best raking direction',JSON.stringify({corrOff:+g.corrOff.toFixed(4),corrOn:+g.corrOn.toFixed(4),checkOff:g.checkOff.map(c=>+c.toFixed(3)),checkOn:g.checkOn.map(c=>+c.toFixed(3)),glint:g.glint.map(v=>+(v*100).toFixed(2)),best:br.from,coh:+br.coh.toFixed(2)}));}
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
{await page.evaluate(()=>{document.querySelector('#saveSection').open=true;});await page.locator('#saveSection .subTabs [data-pane=testing]').click();page.once('dialog',d=>d.accept('streaks top left'));const [dl]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.click('#testBundle')]);const zp=outputDir+'/bundle.zip';await dl.saveAs(zp);const buf=require('fs').readFileSync(zp);const names=[];for(let o=0;o+30<buf.length&&buf.readUInt32LE(o)===0x04034b50;){const n=buf.readUInt16LE(o+26),sz=buf.readUInt32LE(o+18);names.push(buf.toString('utf8',o+30,o+30+n));if(names.at(-1)==='notes.txt')assert.equal(buf.toString('utf8',o+30+n,o+30+n+sz),'streaks top left');o+=30+n+sz;}for(const f of ['project.digilight.json','notes.txt','view-relit.png','view-original.png','view-split.png','view-shadows.png','view-height.png','original.jpg','relit-full.png','info.json'])assert.ok(names.includes(f),f);await page.waitForFunction(()=>document.querySelector('#projectStatus').textContent.startsWith('Test bundle downloaded'));console.log('PASS export for testing bundle');}
// Shadow lift: 0 leaves the render alone; raised, it brightens the darks most near the light.
{const lum=()=>page.evaluate(()=>{__bench.render();const c=__bench.canvas,g=document.createElement('canvas');g.width=c.width;g.height=c.height;const x=g.getContext('2d');x.drawImage(c,0,0);const d=x.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height;
  const at=(u,v)=>{let s=0,n=0;for(let y=Math.floor(v*h)-5;y<Math.floor(v*h)+5;y++)for(let a=Math.floor(u*w)-5;a<Math.floor(u*w)+5;a++){const i=(y*w+a)*4;s+=d[i]+d[i+1]+d[i+2];n++;}return s/n/3;};return {near:at(.12,.12),far:at(.88,.88)};});
 const saved=await page.evaluate(()=>JSON.stringify([__bench.state.lights,__bench.state.graze]));
 await page.evaluate(()=>{const s=__bench.state;s.graze.enabled=false;s.lights.forEach((l,i)=>{l.enabled=i===0;});Object.assign(s.lights[0],{x:0,y:1,z:.3,power:.02,lift:0});});const base=await pixels(),l0=await lum();
 await page.evaluate(()=>{__bench.state.lights[0].lift=0;});assert.equal(await pixels(),base,'lift 0 is a no-op');
 await page.evaluate(()=>{__bench.state.lights[0].lift=1;});const l1=await lum();
 assert.ok(l1.near-l0.near>2*(l1.far-l0.far)&&l1.near>l0.near+5,'lift strongest near the light '+JSON.stringify([l0,l1]));
 await page.evaluate(()=>{__bench.state.lights[0].lift=-1;});const ld=await lum();assert.ok(ld.near<l0.near-2&&ld.far<=l0.far+0.5,'negative lift deepens the darks '+JSON.stringify([l0,ld]));
 await page.evaluate(s=>{const [L,G]=JSON.parse(s);__bench.state.lights.forEach((l,i)=>Object.assign(l,L[i]));Object.assign(__bench.state.graze,G);},saved);await page.evaluate(()=>{__bench.state.lights[0].lift=.4;__bench.state.graze.lift=.3;});
 await page.evaluate(()=>{__bench.state.lights[0].lift=-.4;});const v=await page.evaluate(()=>__studio.validate({format:'digilight',version:1,image:'data:image/png;base64,AA',settings:__studio.snapshot()}));assert.equal(v.lights[0].lift,-.4);assert.equal(v.graze.lift,.3);
 await page.evaluate(()=>{__bench.state.lights[0].lift=0;__bench.state.graze.lift=0;});await settle();
 console.log('PASS shadow lift: no-op at 0, strongest near the light, negative deepens, saved with the light and graze');}
// Relief view and Relief only / Colour over relief (doc item 3): the graze light on an even
// grey, with no colour; the view works with the graze light hidden and ignores layers;
// Colour over relief adds one Overlay layer of the photo, Relief only takes it away.
{const snap=await page.evaluate(()=>JSON.stringify(__studio.snapshot()));
const look=()=>page.evaluate(()=>{__bench.render();const c=__bench.canvas,x=document.createElement('canvas');x.width=c.width;x.height=c.height;const g=x.getContext('2d');g.drawImage(c,0,0);const d=g.getImageData(0,0,c.width,c.height).data;
  let ch=0,y=0;for(let i=0;i<d.length;i+=4){ch+=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);y+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];}return {url:c.toDataURL(),chroma:ch/(d.length/4),y:y/(d.length/4)};});
await page.evaluate(()=>{const s=__bench.state;s.graze.enabled=false;s.layers=[];s.viewMode=0;});const relit=await look();
await page.locator('#views button',{hasText:/^Relief$/}).click();await settle();assert.equal(await setting('viewMode'),7);
const rv=await look();assert.notEqual(rv.url,relit.url);assert.ok(rv.chroma<0.35*relit.chroma&&rv.y>60&&rv.y<200,'relief view is grey '+JSON.stringify([relit.chroma,rv.chroma,rv.y]));
await page.evaluate(()=>{__bench.state.graze.enabled=true;__bench.state.layers=[{mode:'multiply',source:'original',opacity:1,enabled:true}];});assert.equal((await look()).url,rv.url,'relief view: graze on or off, layers ignored');
await page.evaluate(()=>{__bench.state.layers=[];__bench.state.viewMode=0;});await settle();
await page.locator('#grazeSection').evaluate(e=>e.open=true);
await page.click('#grazeReliefOnly');await settle();let g=await setting('graze');assert.ok(g.enabled&&g.grey===1&&g.opacity===1,JSON.stringify(g));
const ro=await look();assert.ok(ro.chroma<0.35*relit.chroma,'relief only is grey');
await page.click('#grazeColourOver');await settle();await page.click('#grazeColourOver');await settle();
let L=await setting('layers');assert.equal(L.length,1);assert.deepEqual(L[0],{mode:'overlay',source:'original',opacity:1,enabled:true});
const co=await look();assert.ok(co.chroma>2*ro.chroma,'colour over relief has colour '+JSON.stringify([ro.chroma,co.chroma]));
await page.click('#grazeReliefOnly');await settle();assert.equal((await setting('layers')).length,0);
await page.click('#undo');await settle();assert.equal((await setting('layers')).length,1);
await page.click('#grazeGrey');await settle();assert.equal((await setting('graze')).grey,0);assert.ok((await look()).chroma>co.chroma*0.5);await page.click('#undo');await settle();assert.equal((await setting('graze')).grey,1);
const v=await page.evaluate(()=>__studio.validate({format:'digilight',version:1,image:'data:image/png;base64,AA',settings:__studio.snapshot()}).graze.grey);assert.equal(v,1);
const bad=await page.evaluate(()=>{const s=__studio.snapshot();s.graze.grey=2;try{__studio.validate({format:'digilight',version:1,image:'data:image/png;base64,AA',settings:s});return false;}catch{return true;}});assert.equal(bad,true);
await page.evaluate(s=>{__studio.restore(JSON.parse(s));__studio.checkpoint();},snap);await settle();
console.log('PASS relief view, Relief only and Colour over relief',JSON.stringify({relitChroma:+relit.chroma.toFixed(1),reliefChroma:+rv.chroma.toFixed(1),colourOverChroma:+co.chroma.toFixed(1),reliefY:+rv.y.toFixed(0)}));}
// Batch preview: steps of one setting render as WebP previews; the live settings and undo
// history come back unchanged; zoom stays put across looks; picked looks export full size.
{await page.evaluate(()=>{document.querySelector('#saveSection').open=true;});await page.locator('#saveSection .subTabs [data-pane=batch]').click();await settle();await page.selectOption('#batchKey','exp');await page.fill('#batchFrom','-1');await page.fill('#batchTo','1');await page.selectOption('#batchCount','3');
const before=await page.evaluate(()=>JSON.stringify(__studio.snapshot())),hi=await page.evaluate(()=>__studio.history.index);
await page.click('#batchRun');await page.waitForFunction(()=>!document.querySelector('#batchViewer').hidden,null,{timeout:120000});
const items=await page.evaluate(()=>__batch.batch.items.map(i=>({name:i.name,type:i.blob.type,size:i.blob.size,exp:i.settings.exposure})));
assert.equal(items.length,4);assert.deepEqual(items.map(i=>i.exp),[items[0].exp,-1,0,1]);assert.ok(items.every(i=>i.type==='image/webp'&&i.size>1000),JSON.stringify(items));assert.notEqual(items[1].size,items[3].size);
assert.equal(await page.evaluate(()=>JSON.stringify(__studio.snapshot())),before);assert.equal(await page.evaluate(()=>__studio.history.index),hi);
await page.click('#bvStars button[data-k="5"]');await page.click('#bvNext');await page.click('#bvStars button[data-k="2"]');assert.equal(await page.textContent('#bvExport'),'Export picked (1)');
{const d=await page.evaluate(()=>{const b=__batch.batch,c=__bench.canvas;return {detail:document.querySelector('#batchDetail').value,w:b.w,h:b.h,cw:c.width,ch:c.height};});
assert.equal(d.detail,'sharp');assert.ok(d.w>=d.cw&&Math.abs(d.w/d.h-d.cw/d.ch)<0.01,JSON.stringify(d));
await page.fill('#bvNote','too dark on the left');await page.click('#bvPrev');assert.equal(await page.inputValue('#bvNote'),'');await page.click('#bvNext');assert.equal(await page.inputValue('#bvNote'),'too dark on the left');
await page.focus('#bvNote');await page.keyboard.press('End');await page.keyboard.press('4');assert.equal(await page.evaluate(()=>__batch.batch.items[1].stars),2);
const [rd]=await Promise.all([page.waitForEvent('download'),page.click('#bvRatings')]);assert.match(rd.suggestedFilename(),/^digilight-ratings-.+-\d{8}-\d{4}\.json$/);
const rj=JSON.parse(require('fs').readFileSync(await rd.path(),'utf8'));assert.equal(rj.format,'digilight-ratings');assert.equal(rj.looks.length,4);
assert.deepEqual(rj.looks.slice(0,2).map(l=>[l.stars,l.note,l.selected]),[[5,'',true],[2,'too dark on the left4',false]]);
assert.deepEqual(rj.looks[1].changed,{exposure:-1});assert.equal(rj.looksFrom.setting,'Exposure');assert.equal(rj.settings['02'].exposure,-1);assert.equal(rj.previews.w,d.w);}
const sb=await page.locator('#bvStage').boundingBox();await page.mouse.move(sb.x+sb.width*.3,sb.y+sb.height*.4);await page.mouse.wheel(0,-500);const z1=await page.evaluate(()=>__batch.viewer.zoom);assert.ok(z1.z>2);
await page.click('#bvNext');assert.deepEqual(await page.evaluate(()=>__batch.viewer.zoom),z1);
const [dl]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.click('#bvExport')]);assert.match(dl.suggestedFilename(),/^01-current-look-\d+x\d+\.(png|jpg)$/);
assert.equal(await page.evaluate(()=>JSON.stringify(__studio.snapshot())),before);
await page.waitForFunction(()=>[...document.querySelectorAll('#projectList option')].some(o=>o.textContent.endsWith(' — Current look')));
await page.click('#bvPrev');await page.click('#bvApply');assert.equal(await setting('exposure'),-1);assert.ok(await page.locator('#batchViewer').isHidden());await page.click('#undo');await settle();assert.equal(await page.evaluate(()=>JSON.stringify(__studio.snapshot())),before);
{await page.evaluate(()=>Object.assign(__bench.state.lights[__bench.state.selected],{kelvin:2700,power:3.3,z:0.21,lift:0.4}));await page.getByRole('button',{name:'+ Light',exact:true}).click();await settle();
const L=await setting('lights'),n=L.at(-1);
const src=L.find(l=>l.kelvin===2700&&l!==n);assert.ok(src&&n.kelvin===2700&&n.power===3.3&&n.z===0.21&&n.lift===0.4&&(n.x!==src.x||n.y!==src.y),JSON.stringify(n));await page.click('#undo');await settle();}
console.log('PASS batch preview: WebP looks, sharp previews, notes and Save ratings JSON, settings and history restored, zoom kept, picked export saved as a project, use this look; + Light starts from the selected light');}
// Colour & strokes: neutral values change nothing; Keep greys neutral takes a warm light's
// tint off grey paint; Vibrance saturates the red half and leaves the grey half; Room light
// colour tints the room light; Stroke definition carves the relief and exports as previewed;
// the settings save, and saves made before them open at the neutral values.
{const fx=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=240;const x=c.getContext('2d');for(let y=0;y<240;y++)for(let a=0;a<200;a++){const t=Math.sin(a*.45)*Math.cos(y*.31)+.6*Math.sin((a+y)*.13),v=140+45*t;x.fillStyle=a<100?`rgb(${v},${v},${v})`:`rgb(${v},${v*.45},${v*.35})`;x.fillRect(a,y,1,1);}return c.toDataURL().split(',')[1];});
await page.locator('#file').setInputFiles({name:'look.png',mimeType:'image/png',buffer:Buffer.from(fx,'base64')});await page.waitForFunction(()=>__bench.canvas.width===200);await settle();
const stats=()=>page.evaluate(()=>{__bench.render();const c=__bench.canvas,g=document.createElement('canvas');g.width=c.width;g.height=c.height;const x=g.getContext('2d');x.drawImage(c,0,0);const d=x.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height;
  const half=(a0,a1)=>{const m=[0,0,0];let n=0,sat=0;const Y=[];for(let y=20;y<h-20;y++)for(let a=a0;a<a1;a++){const i=(y*w+a)*4,r=d[i],gg=d[i+1],b=d[i+2];m[0]+=r;m[1]+=gg;m[2]+=b;n++;const mx=Math.max(r,gg,b);sat+=mx?(mx-Math.min(r,gg,b))/mx:0;Y.push(.2126*r+.7152*gg+.0722*b);}
    const mean=Y.reduce((s,v)=>s+v,0)/Y.length,sd=Math.sqrt(Y.reduce((s,v)=>s+(v-mean)**2,0)/Y.length);return {rgb:m.map(v=>v/n),sat:sat/n,y:mean,sd};};
  return {grey:half(15,85),red:half(115,185)};});
await page.evaluate(()=>{const s=__bench.state;s.graze.enabled=false;s.lights.forEach((l,i)=>{l.enabled=i===0;});Object.assign(s.lights[0],{x:.5,y:1.1,z:.6,power:4,cone:0,lift:0,kelvin:3000,useKelvin:true});__bench.applyColor(s.lights[0]);s.ambient=.1;s.textureDepthMm=2;});
const base=await pixels(),s0=await stats();
const saved=await page.evaluate(()=>{const s=__bench.state,o={};for(const k of ['neutralWB','vibrance','roomKelvin','strokeDef','strokeSize']){o[k]=s[k];delete s[k];}return o;});
assert.equal(await pixels(),base,'neutral colour & strokes render as without them');await page.evaluate(o=>Object.assign(__bench.state,o),saved);
await slider('neutralWB',1);const s1=await stats();const cast=s=>Math.log(s.grey.rgb[0]/s.grey.rgb[2]);
assert.ok(cast(s0)>.25&&Math.abs(cast(s1))<.35*cast(s0)&&s1.red.rgb[0]/s1.red.rgb[2]>1.8,'keep greys neutral '+JSON.stringify([s0.grey.rgb,s1.grey.rgb,s1.red.rgb]));
await slider('vibrance',.6);const s2=await stats();assert.ok(s2.red.sat>s1.red.sat+.04&&Math.abs(s2.grey.sat-s1.grey.sat)<.02,'vibrance '+JSON.stringify([s1.red.sat,s2.red.sat,s1.grey.sat,s2.grey.sat]));
await slider('vibrance',0);await slider('neutralWB',0);await page.evaluate(()=>{__bench.state.ambient=.6;});const r0=await stats();await slider('roomKelvin',2500);const r1=await stats();
assert.ok(cast(r1)>cast(r0)+.1,'room light colour '+JSON.stringify([r0.grey.rgb,r1.grey.rgb]));await slider('roomKelvin',6500);await page.evaluate(()=>{__bench.state.ambient=.1;});
await slider('strokeDef',1);const k1=await stats();const spread=await setting('strokeSpread');
assert.ok(spread>0&&k1.grey.sd>s0.grey.sd*1.05&&Math.abs(k1.grey.y-s0.grey.y)<.08*s0.grey.y,'stroke definition '+JSON.stringify({spread,sd:[s0.grey.sd,k1.grey.sd],y:[s0.grey.y,k1.grey.y]}));
await slider('strokeSize',.02);const k2=await stats();assert.notEqual(k2.grey.sd,k1.grey.sd);assert.ok(await setting('strokeSpread')!==spread,'stroke band measured again at the new size');
const ex=await page.evaluate(async()=>{__bench.render();const full=await __bench.exportFullRes();const c=document.createElement('canvas');c.width=full.width;c.height=full.height;const x=c.getContext('2d');x.drawImage(full,0,0);const a=x.getImageData(0,0,c.width,c.height).data;__bench.render();x.drawImage(__bench.canvas,0,0,c.width,c.height);const d=x.getImageData(0,0,c.width,c.height).data;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-d[i]);return {mean:s/a.length,w:full.width};});
assert.ok(ex.w===200&&ex.mean<1,'stroke definition exports as previewed '+JSON.stringify(ex));
const tiledEx=await page.evaluate(async()=>{__bench.render();const c=document.createElement('canvas');c.width=200;c.height=240;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,200,240).data;__bench.state.maxTile=110;try{const t=await __bench.exportFullRes();const b=t.getContext('2d').getImageData(0,0,200,240).data;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length;}finally{delete __bench.state.maxTile;}});
assert.ok(tiledEx<1,'stroke definition across export tiles '+tiledEx);
await page.click('#undo');await settle();assert.equal(await setting('strokeSize'),.01);
const v=await page.evaluate(()=>{const snap=__studio.snapshot(),old={...snap};for(const k of ['neutralWB','vibrance','roomKelvin','strokeDef','strokeSize'])delete old[k];
  const mk=s=>({format:'digilight',version:1,image:'data:image/png;base64,AA',settings:s});let bad='';try{__studio.validate(mk({...snap,vibrance:2}));}catch(e){bad=e.message;}
  return {now:__studio.validate(mk(snap)),old:__studio.validate(mk(old)),bad};});
assert.equal(v.now.strokeDef,1);assert.deepEqual([v.old.neutralWB,v.old.vibrance,v.old.roomKelvin,v.old.strokeDef,v.old.strokeSize],[0,0,6500,0,.01]);assert.match(v.bad,/vibrance/);
await page.selectOption('#lightingPreset','Gallery spot, upper right');await settle();
const g=await page.evaluate(()=>{const s=__bench.state;return {wb:s.neutralWB,vib:s.vibrance,sd:s.strokeDef,x:s.lights[0].x,n:s.lights.length,out:document.querySelector('#neutralWB').closest('.row').querySelector('output').textContent};});
assert.ok(g.wb>0&&g.vib>0&&g.sd>0&&g.x>1&&g.n===1&&g.out===`${Math.round(g.wb*100)}%`,JSON.stringify(g));
await page.evaluate(()=>{document.querySelector('#colourSection').open=true;});await page.selectOption('#lookPreset','Raking graze (05)');await settle();
const lk=await page.evaluate(()=>{const s=__bench.state;return {g:s.graze.enabled,op:s.graze.opacity,z:s.lights[0].z,rs:s.reliefScale,al:s.albedoSuppress,sd:s.strokeDef,exp:s.exposure};});
assert.deepEqual(lk,{g:true,op:.3,z:.45,rs:3,al:.7,sd:.5,exp:.35},'matched look '+JSON.stringify(lk));
await page.selectOption('#lookPreset','Brighter (07)');await settle();assert.equal(await page.evaluate(()=>__bench.state.graze.enabled),false);assert.equal(await setting('exposure'),.6);
await page.click('#undo');await settle();assert.equal(await setting('exposure'),.35);
await page.selectOption('#lookPreset','Your favourite (10-16)');await settle();
{const f=await page.evaluate(()=>{const s=__bench.state;const r={layers:JSON.stringify(s.layers),top:s.originalTop,g:[s.graze.enabled,s.graze.elevation,s.graze.opacity],rs:s.reliefScale,al:s.albedoSuppress,sd:s.strokeDef,exp:s.exposure};s.layers[0].opacity=0.1;return r;});
 assert.deepEqual(f,{layers:JSON.stringify([{mode:'pinLight',source:'original',opacity:0.88,enabled:true}]),top:.07,g:[true,4,.63],rs:5,al:.2,sd:0,exp:.04},'favourite look '+JSON.stringify(f));
 await page.selectOption('#lookPreset','');await page.selectOption('#lookPreset','Your favourite (10-16)');await settle();assert.equal(await page.evaluate(()=>__bench.state.layers[0].opacity),.88,'the look is copied, not shared');
 await page.click('#undo');await settle();await page.click('#undo');await settle();}
await page.evaluate(()=>Object.assign(__bench.state,{neutralWB:0,vibrance:0,roomKelvin:6500,strokeDef:0,strokeSize:.01}));await page.evaluate(()=>document.dispatchEvent(new Event('digilight:settings')));await settle();
console.log('PASS colour & strokes: no-op when neutral, greys neutral, vibrance spares greys, room light colour, stroke definition exports as previewed, saved and validated, Gallery spot preset, matched looks',JSON.stringify({cast:[+cast(s0).toFixed(2),+cast(s1).toFixed(2)],sat:[+s1.red.sat.toFixed(3),+s2.red.sat.toFixed(3)],sd:[+s0.grey.sd.toFixed(1),+k1.grey.sd.toFixed(1)],export:+ex.mean.toFixed(3),tiled:+tiledEx.toFixed(3)}));}
// Phase 3 — Colour tool adjustments, eyes, Opacity; overlays (grain, vignette, …); Fine-tune and
// Layers eyes; Auto's Opacity. Defaults change nothing; each eye hides exactly its own effect.
{const open=()=>page.evaluate(()=>{for(const id of ['colourSection','layersSection','fineTune'])document.getElementById(id).open=true;});await open();
await page.evaluate(()=>{Object.assign(__bench.state,{layers:[],originalTop:0});document.dispatchEvent(new Event('digilight:settings'));});await settle();
const ev=fn=>page.evaluate(fn),same=async(a,msg)=>assert.equal(await pixels(),a,msg);
const tone=()=>page.evaluate(()=>{__bench.render();const c=__bench.canvas,g=document.createElement('canvas');g.width=c.width;g.height=c.height;const x=g.getContext('2d');x.drawImage(c,0,0);const d=x.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height;
  const reg=(x0,x1,y0,y1)=>{let n=0,s=0,s2=0,sat=0;for(let y=y0;y<y1;y++)for(let a=x0;a<x1;a++){const i=(y*w+a)*4,Y=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2],mx=Math.max(d[i],d[i+1],d[i+2]);n++;s+=Y;s2+=Y*Y;sat+=mx?(mx-Math.min(d[i],d[i+1],d[i+2]))/mx:0;}const m=s/n;return {y:m,sd:Math.sqrt(Math.max(0,s2/n-m*m)),sat:sat/n};};
  return {all:reg(0,w,0,h),centre:reg(w*.4|0,w*.6|0,h*.4|0,h*.6|0),corner:reg(0,w*.12|0,0,h*.1|0),red:reg(w*.6|0,w*.9|0,h*.2|0,h*.8|0)};});
const base=await pixels(),t0=await tone();
const kept=await ev(()=>{const s=__bench.state,o={adjust:s.adjust,overlays:s.overlays,layersOn:s.layersOn};delete s.adjust;delete s.overlays;delete s.layersOn;return o;});
await same(base,'default adjustments and overlays render as without them');await ev(()=>{});await page.evaluate(o=>Object.assign(__bench.state,o),kept);
// Levels: changes the image, its eye hides it exactly, a second click brings it back; undoable.
const h0=await ev(()=>__studio.history.index);
await slider('adj-levels-inBlack',.25);const lv=await pixels();assert.notEqual(lv,base);assert.ok((await tone()).all.y<t0.all.y,'levels input black darkens');
await page.click('#adj-levels .eye');await settle();await same(base,'Levels eye hides it');assert.equal(await ev(()=>__bench.state.adjust.levels.on),0);
await page.click('#adj-levels .eye');await settle();await same(lv,'and shows it again');
await page.click('#undo');await settle();await same(base,'eye click is one undo step');await page.click('#redo');await settle();await same(lv);assert.ok(await ev(()=>__studio.history.index)>h0);
// The Colour tool's eye and Opacity: hidden = no adjustments and no Colour & strokes lighting; half = in between.
await slider('neutralWB',1);const wb=await pixels();assert.notEqual(wb,lv);
await page.click('#colourEye');await settle();await same(base,'Colour eye hides the adjustments and the lighting colour controls');
await page.click('#colourEye');await settle();await same(wb);
await slider('adjustOpacity',.5);const half=await pixels();assert.ok(half!==wb&&half!==base);const th=await tone();assert.ok(th.all.y>(await (async()=>t0.all.y)())-40);
await slider('adjustOpacity',1);await slider('neutralWB',0);await slider('adj-levels-inBlack',0);await settle();await same(base,'neutral again');
// Black & White is hidden until used; moving a slider shows it; Channel Mixer monochrome; Curves; Hue/Saturation.
assert.equal(await ev(()=>__bench.state.adjust.bw.on),0);await slider('adj-bw-reds',60);assert.equal(await ev(()=>__bench.state.adjust.bw.on),1);assert.ok((await tone()).red.sat<.02,'black & white');
await page.click('#adj-bw .eye');await settle();await same(base);
await ev(()=>{const m=__bench.state.adjust.mixer;m.mono=1;document.dispatchEvent(new Event('digilight:settings'));});await settle();assert.ok((await tone()).red.sat<.02,'monochrome mixer');assert.equal(await ev(()=>document.querySelector('#adj-mixer-mono').checked),true);
await ev(()=>{__bench.state.adjust.mixer.mono=0;__bench.state.adjust.curves.rgb=[[0,0],[.5,.7],[1,1]];document.dispatchEvent(new Event('digilight:settings'));});await settle();assert.ok((await tone()).all.y>t0.all.y+8,'curve lifts the mids');
await ev(()=>{__bench.state.adjust.curves.rgb=[[0,0],[1,1]];});await slider('adj-hueSat-saturation',-1);assert.ok((await tone()).red.sat<.03,'saturation -100');await slider('adj-hueSat-saturation',0);await settle();await same(base);
// Curves editor: a click adds a point, a drag moves it, double-click removes it.
{const box=await page.locator('#adj-curves-box');await ev(()=>{document.querySelector('#adj-curves').open=true;});await box.scrollIntoViewIfNeeded();const b=await box.boundingBox();
 await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.3,{steps:3});await page.mouse.up();await settle();
 const p=await ev(()=>__bench.state.adjust.curves.rgb);assert.equal(p.length,3);assert.ok(p[1][1]>.6&&Math.abs(p[1][0]-.5)<.03,JSON.stringify(p));assert.notEqual(await pixels(),base);
 await page.mouse.dblclick(b.x+b.width*p[1][0],b.y+b.height*(1-p[1][1]));await settle();assert.equal((await ev(()=>__bench.state.adjust.curves.rgb)).length,2);await same(base,'curve back to straight');}
// Relief (3D): scales the depth the lights shade and shadow; its eye hides it.
{const hs0=await ev(()=>{__bench.render();return __bench.state.heightScale;});await slider('adj-relief-amount',2);const rp=await pixels();assert.notEqual(rp,base);assert.ok(Math.abs(await ev(()=>{__bench.render();return __bench.state.heightScale;})-2*hs0)<1e-9,'relief doubles the depth');
 await page.click('#adj-relief .eye');await settle();await same(base,'Relief eye');await page.click('#adj-relief .eye');await settle();await same(rp);await slider('adj-relief-amount',1);await settle();await same(base);}
// Relief (3D) bands: Fine and Mid detail scale their band alone (the spread is still measured at 100%),
// Broad form adds the large-scale layer (0 = none) at Broad size, in the tiled export as previewed.
{const hs=()=>ev(()=>{__bench.render();return JSON.stringify(__bench.state.heightStats);}),hs0=await hs();
 await slider('adj-relief-fine',0);const fp=await pixels();assert.notEqual(fp,base);assert.equal(await hs(),hs0,'Fine detail does not re-measure the relief');
 await slider('adj-relief-fine',1);await settle();await same(base);await slider('adj-relief-mid',2);assert.notEqual(await pixels(),base);await slider('adj-relief-mid',1);await settle();await same(base);
 await slider('adj-relief-form',1);const fm=await pixels();assert.notEqual(fm,base);assert.ok(await ev(()=>__bench.state.reliefBands.formScale>0));
 await slider('adj-relief-formSize',2);assert.notEqual(await pixels(),fm,'Broad size');
 const d=await ev(async()=>{__bench.render();const W=__bench.canvas.width,H=__bench.canvas.height,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(__bench.canvas,0,0);const a=x.getImageData(0,0,W,H).data;
   __bench.state.maxTile=160;const o=await __bench.exportFullRes();const t=o.canvas||o;const g=document.createElement('canvas');g.width=W;g.height=H;g.getContext('2d').drawImage(t,0,0,W,H);const b=g.getContext('2d').getImageData(0,0,W,H).data;
   let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);delete __bench.state.maxTile;__bench.dirty();__bench.render();return sum/a.length;});
 assert.ok(d<1,'Broad form tile difference '+d);
 await page.click('#adj-relief .eye');await settle();await same(base,'Relief eye hides the bands');await page.click('#adj-relief .eye');await settle();
 await slider('adj-relief-formSize',0.1);const sm=await pixels();assert.notEqual(sm,base,'Broad size 10%');assert.ok(await ev(()=>__bench.state.reliefBands.formScale>0));
 await slider('adj-relief-formSize',0);await settle();await same(base,'Broad size 0 is none');assert.equal(await ev(()=>__bench.state.reliefBands.formScale),0);
 await slider('adj-relief-formSize',1);await slider('adj-relief-form',0);await settle();await same(base,'Broad form 0 is none');
 const v=await ev(()=>{const t=r=>{const s=__studio.snapshot();s.adjust={relief:r};try{return __studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:s}).adjust.relief;}catch{return null;}};
   return {old:t({on:1,amount:2}),bad:t({form:4}),badSize:t({formSize:-0.05}),zeroSize:t({formSize:0})};});
 assert.deepEqual(v.old,{on:1,amount:2,fine:1,mid:1,form:0,formSize:1,smooth:0},'older saves open with the bands neutral');assert.equal(v.bad,null);assert.equal(v.badSize,null);assert.equal(v.zeroSize?.formSize,0,'Broad size 0 saves');
 console.log('PASS Relief (3D) bands: fine, mid, broad form and size, tiled export, eye, validate');}
// Relief (3D) › Smooth lowers the fine band (and the graze grit / Stroke definition) without moving
// their sliders; Lift darks brightens the darks most. Both 0 = none, both hidden by their eye.
{await slider('adj-relief-smooth',1);const sp=await pixels();assert.notEqual(sp,base,'Smooth changes the relief');
 assert.ok(Math.abs(await ev(()=>{__bench.render();return __bench.state.reliefBands.fine;})-.45)<1e-9,'Smooth 100% = fine band 45%');assert.equal(await ev(()=>__bench.state.adjust.relief.fine),1,'Fine detail slider untouched');
 await page.click('#adj-relief .eye');await settle();await same(base,'Relief eye hides Smooth');await page.click('#adj-relief .eye');await settle();await same(sp);
 await slider('adj-relief-smooth',0);await settle();await same(base,'Smooth 0 is none');
 const dark=()=>ev(()=>{__bench.render();const c=__bench.canvas,g=document.createElement('canvas');g.width=c.width;g.height=c.height;const x=g.getContext('2d');x.drawImage(c,0,0);const d=x.getImageData(0,0,c.width,c.height).data;
   const Y=[];for(let i=0;i<d.length;i+=4)Y.push(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]);Y.sort((a,b)=>a-b);return [Y[Y.length*.05|0],Y[Y.length*.95|0]];});
 const [d0,b0]=await dark();await slider('adj-lift-amount',1);const lp=await pixels();assert.notEqual(lp,base);const [d1,b1]=await dark();
 assert.ok(d1-d0>12&&d1-d0>2*(b1-b0),'Lift darks lifts the darks most '+JSON.stringify([d0,d1,b0,b1]));
 await page.click('#adj-lift .eye');await settle();await same(base,'Lift darks eye');await page.click('#adj-lift .eye');await settle();await same(lp);
 await slider('adj-lift-amount',0);await settle();await same(base,'Lift darks 0 is none');
 const v=await ev(()=>{const t=a=>{const s=__studio.snapshot();s.adjust=a;try{return __studio.validate({format:'digilight',version:1,image:'data:image/png;base64,',settings:s}).adjust;}catch{return null;}};
   return {old:t({relief:{on:1}})?.lift,bad:t({lift:{amount:3}}),badS:t({relief:{smooth:2}})};});
 assert.deepEqual(v.old,{on:1,amount:0},'older saves open with Lift darks at 0');assert.equal(v.bad,null);assert.equal(v.badS,null);
 console.log('PASS Relief (3D) Smooth and Lift darks: match the sliders, eyes, 0 = none, validate');}
// Overlays: grain adds texture to the painting and exports at the size it previews; vignette darkens corners; the master eye hides all.
await page.click('#ov-grain .eye');await settle();const gr=await pixels();assert.notEqual(gr,base);const tg=await tone();assert.ok(tg.centre.sd>t0.centre.sd+1,'grain '+JSON.stringify([t0.centre.sd,tg.centre.sd]));
await slider('ov-grain-seed',7);assert.notEqual(await pixels(),gr,'seed changes the pattern');await slider('ov-grain-seed',1);
await page.click('#ov-grain .eye');await page.click('#ov-vignette .eye');await settle();const tv=await tone();assert.ok(tv.corner.y<t0.corner.y-5&&Math.abs(tv.centre.y-t0.centre.y)<2,'vignette '+JSON.stringify([t0.corner.y,tv.corner.y,t0.centre.y,tv.centre.y]));const vig=await pixels();
await page.click('#overlaysEye');await settle();await same(base,'overlays eye hides them all');await page.click('#overlaysEye');await settle();await same(vig);
await page.evaluate(()=>{document.querySelector('#ov-vignette').open=true;});await page.locator('#ov-vignette-mode').scrollIntoViewIfNeeded();await page.click('#ov-vignette-mode');await page.click('.blendMenu li[data-mode=screen]');await settle();assert.equal(await ev(()=>__bench.state.overlays.vignette.mode),'screen');assert.match(await page.locator('#ov-vignette-mode').textContent(),/Screen/);
for(const k of ['leak','window','pool']){await page.click(`#ov-${k} .eye`);await settle();}assert.notEqual(await pixels(),vig);
{const exp=await ev(async()=>{const o=await __bench.exportFullRes();const c=o.canvas||o,W=__bench.canvas.width,H=__bench.canvas.height;const g=document.createElement('canvas');g.width=W;g.height=H;g.getContext('2d').drawImage(c,0,0,W,H);const a=g.getContext('2d').getImageData(0,0,W,H).data;
   __bench.render();const p=document.createElement('canvas');p.width=W;p.height=H;p.getContext('2d').drawImage(__bench.canvas,0,0);const b=p.getContext('2d').getImageData(0,0,W,H).data;let s=0;for(let i=0;i<a.length;i+=4)s+=Math.abs(a[i]-b[i]);return s/(a.length/4);});
 assert.ok(exp<6,'overlays export as previewed, mean |diff| '+exp);}
// Saved, validated and undoable; older saves open with everything neutral; bad values refused.
const v=await ev(()=>{const snap=__studio.snapshot(),mk=s=>({format:'digilight',version:1,image:'data:image/png;base64,AA',settings:s});const back=__studio.validate(mk(snap));const old={...snap};delete old.adjust;delete old.overlays;delete old.layersOn;delete old.fineHidden;const o=__studio.validate(mk(old));
  const bad=x=>{try{__studio.validate(mk({...snap,...x}));return '';}catch(e){return e.message;}};
  return {pool:back.overlays.pool.on,mode:back.overlays.vignette.mode,oldOv:o.overlays.on&&!o.overlays.grain.on,oldAdj:o.adjust.levels.inBlack===0&&o.adjust.bw.on===0,layersOn:o.layersOn,
    b1:bad({adjust:{levels:{gamma:50}}}),b2:bad({overlays:{vignette:{mode:'nope'}}}),b3:bad({adjust:{curves:{rgb:[[0,0],[0,1]]}}}),b4:bad({overlays:{leak:{hex:'red'}}})};});
assert.ok(v.pool===1&&v.mode==='screen'&&v.oldOv&&v.oldAdj&&v.layersOn===1&&/colour/.test(v.b1)&&/overlays/i.test(v.b2)&&/colour/.test(v.b3)&&/overlays/i.test(v.b4),JSON.stringify(v));
await page.click('#overlaysEye');await settle();await same(base);
// Fine-tune's eye puts its sliders at their starting values and keeps yours; moving one while hidden shows it.
await slider('fineRelief',1.6);await slider('roughness',.2);const tuned=await pixels();
await page.click('#fineEye');await settle();const fh=await ev(()=>({fr:__bench.state.fineRelief,ro:__bench.state.roughness,stash:__bench.state.fineHidden,ui:+document.querySelector('#fineRelief').value}));
assert.ok(fh.fr===.65&&fh.ro===.55&&fh.stash.fineRelief===1.6&&fh.stash.roughness===.2&&fh.ui===.65,JSON.stringify(fh));assert.notEqual(await pixels(),tuned);
await page.click('#fineEye');await settle();await same(tuned,'Fine-tune back');assert.equal(await setting('fineHidden'),null);
await page.click('#fineEye');await settle();await slider('roughness',.3);assert.deepEqual(await ev(()=>[__bench.state.fineHidden,__bench.state.fineRelief,__bench.state.roughness]),[null,1.6,.3],'moving a hidden slider shows Fine-tune with the new value');
await slider('fineRelief',.65);await slider('roughness',.55);await settle();
// Layers eye hides the blend layers; Auto's Opacity is Original on top turned round.
const before=await pixels();await page.click('#addLayer');await settle();const ly=await pixels();assert.notEqual(ly,before);
await page.click('#layersEye');await settle();await same(before,'layers eye');await page.click('#layersEye');await settle();await same(ly);await page.click('.lyDel');await settle();
await slider('autoOpacity',.25);assert.equal(await setting('originalTop'),.75);assert.equal(await ev(()=>+document.querySelector('#originalTop').value),.75);await slider('originalTop',0);assert.equal(await ev(()=>+document.querySelector('#autoOpacity').value),1);
const mx=await ev(async()=>{const {mixSettings}=await import('/src/auto.js');const a={lights:[],adjust:{on:1,x:1},overlays:{on:1},layersOn:1},b={lights:[],adjust:{on:0,x:2},overlays:{on:0},layersOn:0};const m1=mixSettings(a,b,.4),m2=mixSettings(a,b,.6);return [m1.adjust.x,m1.layersOn,m2.adjust.x,m2.layersOn,m2.overlays.on];});
assert.deepEqual(mx,[1,1,2,0,0],'whole tools switch at half in a Strength mix');
await page.evaluate(()=>{for(const id of ['colourSection','layersSection','fineTune'])document.getElementById(id).open=false;});
console.log('PASS colour adjustments, eyes and Opacity; overlays (grain, vignette, leak, window, pool) export as previewed; Fine-tune and Layers eyes; Auto Opacity; saved and validated',JSON.stringify({grainSd:[+t0.centre.sd.toFixed(1),+tg.centre.sd.toFixed(1)],vignette:[+t0.corner.y.toFixed(1),+tv.corner.y.toFixed(1)]}));}
// Phone: two-finger pinch zooms about the fingers, one finger pans when zoomed, a pinch that
// starts on a brush stroke drops it; Full screen hides the chrome and Exit restores it.
{const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});const m=await ctx.newPage();m.on('pageerror',e=>errors.push(e.message));
await m.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await m.waitForFunction(()=>window.__bench&&window.__studio);await m.waitForTimeout(300);
// Phone tool strip: one section at a time, the strip under the panel, the painting keeps most of the screen.
{const T=()=>m.evaluate(()=>__studio.tools.current),vis=sel=>m.locator(sel).isVisible();
const R=await m.locator('#toolRail').boundingBox(),P=await m.locator('#panel').boundingBox(),S=await m.locator('#stage').boundingBox();
assert.ok(Math.abs(R.y+R.height-844)<1&&R.width>=389&&P.y+P.height<=R.y+1&&S.height>=300,'strip at the bottom '+JSON.stringify({R,P,S}));
assert.equal(await T(),'setup');assert.ok(await vis('#autoAnalyze')&&!await vis('#grazeSection')&&!await vis('#layersSection')&&!await vis('#toolRail .railAll'));
const small=await m.evaluate(()=>[...document.querySelectorAll('#toolRail button, #autoSection button, #studioToolbar button')].filter(b=>b.offsetParent&&b.getBoundingClientRect().height<40).map(b=>b.textContent));assert.deepEqual(small,[],'touch targets at least 40 px');
await m.tap('#toolRail [data-tool=graze]');assert.equal(await T(),'graze');assert.ok(await m.evaluate(()=>document.querySelector('#grazeSection').open)&&await vis('#grazeDial')&&!await vis('#autoAnalyze'));
await m.tap('#searchBtn');await m.fill('#toolSearchInput','Add layer');await m.keyboard.press('Enter');await m.waitForTimeout(100);assert.equal(await T(),'layers');assert.ok(await vis('#addLayer'));
await m.reload();await m.waitForFunction(()=>window.__bench&&window.__studio);await m.waitForTimeout(300);assert.equal(await T(),'setup','every visit opens on Setup');
await m.tap('#toolRail [data-tool=auto]');console.log('PASS phone tool strip: one section at a time, strip at the bottom, touch targets, search switches tool, opens on Setup');}
const cdp=await ctx.newCDPSession(m),touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],id)=>({x,y,id}))});
const z=()=>m.evaluate(()=>__bench.state.viewZoom),sc=()=>m.evaluate(()=>{const s=document.querySelector('#scroller');return [s.scrollLeft,s.scrollTop];});
const pinch=async(c,d0,d1)=>{await touch('touchStart',[[c[0]-d0/2,c[1]]]);await touch('touchMove',[[c[0]-d0/2,c[1]],[c[0]+d0/2,c[1]]]);await touch('touchStart',[[c[0]-d0/2,c[1]],[c[0]+d0/2,c[1]]]);for(let i=1;i<=8;i++){const d=d0+(d1-d0)*i/8;await touch('touchMove',[[c[0]-d/2,c[1]],[c[0]+d/2,c[1]]]);}await touch('touchEnd',[]);};
let b=await m.locator('#gl').boundingBox();const c=[b.x+b.width/2,b.y+b.height/2];
await pinch(c,60,180);let zz=await z();assert.ok(Math.abs(zz-3)<.15,'pinch zoom '+zz);
const s0=await sc();await touch('touchStart',[[c[0],c[1]]]);for(let i=1;i<=6;i++)await touch('touchMove',[[c[0]-10*i,c[1]-8*i]]);await touch('touchEnd',[]);const s1=await sc();assert.ok(s1[0]-s0[0]>50&&s1[1]-s0[1]>40,'one-finger pan '+JSON.stringify([s0,s1]));
await pinch(c,200,40);assert.ok(await z()<1.2,'pinch out '+await z());await m.click('#zoomFit');
await m.tap('#toolRail [data-tool=detail]');await m.getByText('Local texture correction',{exact:true}).click();await m.click('#brushAdd');const n0=(await m.evaluate(()=>__bench.state.strokes.length));b=await m.locator('#gl').boundingBox();
await pinch([b.x+b.width/2,b.y+b.height/2],60,120);assert.equal(await m.evaluate(()=>__bench.state.strokes.length),n0,'a pinch drops the stroke its first finger began');await m.click('#brushOff');
await m.click('#fullView');await m.waitForTimeout(200);assert.ok(await m.locator('#studioToolbar').isHidden()&&await m.locator('#panel').isHidden()&&await m.locator('#toolRail').isHidden()&&await m.locator('#fullExit').isVisible());
const st=await m.locator('#stage').boundingBox();assert.ok(st.width>=389&&st.height>=843,'stage fills the screen '+JSON.stringify(st));
b=await m.locator('#gl').boundingBox();await pinch([b.x+b.width/2,b.y+b.height/2],60,150);assert.ok(await z()>2,'pinch in full screen '+await z());
await m.click('#fullFit');assert.equal(await z(),1);await m.click('#fullExit');await m.waitForTimeout(200);assert.ok(await m.locator('#studioToolbar').isVisible()&&await m.locator('#fullExit').isHidden());
await ctx.close();console.log('PASS phone pinch zoom, one-finger pan, pinch cancels stroke, full screen view');
// Phone: no page zoom on a field's focus or a double tap; sliders taken anywhere along them (touchsliders.js).
{const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});const m=await ctx.newPage();m.on('pageerror',e=>errors.push(e.message));
await m.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await m.waitForFunction(()=>window.__bench&&window.__studio);await m.waitForTimeout(300);
const css=await m.evaluate(()=>({html:getComputedStyle(document.documentElement).touchAction,search:getComputedStyle(document.querySelector('#toolSearchInput')).fontSize,sel:getComputedStyle(document.querySelector('#samplePick')).fontSize}));
assert.deepEqual(css,{html:'manipulation',search:'16px',sel:'16px'},'no iPhone zoom on focus or double tap '+JSON.stringify(css));
const cdp=await ctx.newCDPSession(m),touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],id)=>({x,y,id}))});
await m.tap('#toolRail [data-tool=colour]');const sel='#lookControls input[type=range]';const sl=m.locator(sel).first();await sl.scrollIntoViewIfNeeded();
const id=await sl.evaluate(el=>{el.id||=(el.id='touchTestSlider');return el.id;});const S=m.locator('#'+id);
const info=()=>S.evaluate(el=>({v:+el.value,min:+el.min,max:+el.max,step:+el.step||1}));
const setV=v=>S.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},v);
const drag=async(x0,y0,dx,dy)=>{await touch('touchStart',[[x0,y0]]);for(let i=1;i<=8;i++)await touch('touchMove',[[x0+dx*i/8,y0+dy*i/8]]);await touch('touchEnd',[]);await m.waitForTimeout(50);};
const I=await info();const mid=I.min+(I.max-I.min)/2;await setV(mid);let r=await S.boundingBox();const span=r.width-26,cy=r.y+r.height/2;
// a sideways drag that starts well off the knob moves the value by the finger's travel, without jumping first
await drag(r.x+r.width*0.15,cy,60,2);let v=(await info()).v,want=mid+60/span*(I.max-I.min);
assert.ok(Math.abs(v-want)<=Math.max(I.step,(I.max-I.min)*0.03),'relative drag '+JSON.stringify({v,want,I}));
// an up-or-down drag that starts on a slider scrolls and leaves the value alone
await setV(mid);r=await S.boundingBox();await drag(r.x+r.width*0.8,r.y+r.height/2,3,-60);assert.ok(Math.abs((await info()).v-mid)<=I.step/2,'vertical drag leaves it '+(await info()).v);
// a tap on the track jumps there. That drag flung the panel: on a slow machine it is still coasting when
// the tap lands (often hundreds of px, onto the painting), so wait for it to stop and bring the slider back.
const still=()=>m.evaluate(()=>new Promise(res=>{const p=document.querySelector('#panel');let y=p.scrollTop,n=0;const f=()=>{n=p.scrollTop===y?n+1:0;y=p.scrollTop;if(n>=10)res();else requestAnimationFrame(f);};requestAnimationFrame(f);}));
await still();await S.scrollIntoViewIfNeeded();await still();
r=await S.boundingBox();const at=[r.x+13+span*0.85,r.y+r.height/2];assert.equal(await m.evaluate(([x,y])=>document.elementFromPoint(x,y)?.id,at),id,'the tap lands on the slider');
await touch('touchStart',[at]);await touch('touchEnd',[]);await m.waitForTimeout(50);v=(await info()).v;want=I.min+0.85*(I.max-I.min);
assert.ok(Math.abs(v-want)<=Math.max(I.step,(I.max-I.min)*0.03),'tap jumps '+JSON.stringify({v,want}));
await ctx.close();console.log('PASS phone: 16px fields and no double-tap zoom; sliders drag from anywhere, scroll leaves them, tap jumps');}}
// Automation API (window.digilight, docs/automation.md): set by name is one undo step and checked like an import,
// render/export as data URL or Blob, project round trip, fixed presets, ?set= on open, postMessage bridge with ?bridge.
{const ctx=await browser.newContext({viewport:{width:1350,height:900}});const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766);
await a.goto(base+'/?synth');await a.waitForFunction(()=>window.digilight&&window.__studio);await a.waitForTimeout(300);
const r=await a.evaluate(async()=>{const d=window.digilight,out={};
 out.info=await d.ready();const desc=d.describe();out.formSize=desc.find(x=>x.path==='adjust.relief.formSize');out.exposure=desc.find(x=>x.path==='exposure');
 const p0=await d.render(),u0=__studio.history.index;
 out.set=await d.set({exposure:0.5,'graze.opacity':0.4,'lights.0.power':3});out.steps=__studio.history.index-u0;const p1=await d.render();out.changed=p0!==p1;
 for(const [k,v] of [['graze.opacity',2],['nope',1],['lights.5.power',1]])try{await d.set(k,v);out[k]='no error';}catch(e){out[k]=e.message;}
 out.kept=[d.get('graze.opacity'),__studio.history.index-u0];
 await d.undo();out.undone=d.get('exposure');await d.redo();out.redone=d.get('exposure');
 const proj=await d.getProject({name:'API test'});out.projName=proj.name;await d.set('exposure',-1);await d.setProject(JSON.stringify(proj));out.reopened=d.get('exposure');out.sameAfterReopen=(await d.render())===p1;
 out.presets=d.presets();await d.applyPreset('graze','Classic raking');out.graze=d.get('graze');
 try{await d.applyPreset('graze','Nope');}catch(e){out.badPreset=e.message;}
 const e1=await d.export({width:100,format:'jpeg'});out.exp=e1.slice(0,23);const im=new Image();await new Promise(res=>{im.onload=res;im.src=e1;});out.expW=im.width;
 out.blob=(await d.render({as:'blob',format:'webp'})).type;out.looks=d.looks().length;return out;});
assert.ok(r.info.photo&&r.info.preview.width>0&&r.info.mode==='single',JSON.stringify(r.info));
assert.equal(r.formSize.min,0);assert.equal(typeof r.exposure.label,'string');assert.ok(r.exposure.max>r.exposure.min);
assert.deepEqual(r.set,{exposure:0.5,'graze.opacity':0.4,'lights.0.power':3});assert.equal(r.steps,1,'one undo step');assert.ok(r.changed);
assert.match(r['graze.opacity'],/Invalid graze light: nothing changed/);assert.match(r.nope,/Unknown setting "nope"/);assert.match(r['lights.5.power'],/Unknown setting/);
assert.deepEqual(r.kept,[0.4,1],'a rejected set changes nothing');assert.equal(r.undone,0);assert.equal(r.redone,0.5);
assert.equal(r.projName,'API test');assert.equal(r.reopened,0.5);assert.ok(r.sameAfterReopen,'project round trip renders the same');
assert.ok(r.presets.lighting.length&&r.presets.graze.includes('Classic raking')&&r.presets.looks.length);assert.ok(r.graze.enabled&&r.graze.elevation===3,JSON.stringify(r.graze));assert.match(r.badPreset,/No graze preset/);
assert.equal(r.exp,'data:image/jpeg;base64,');assert.equal(r.expW,100);assert.equal(r.blob,'image/webp');assert.equal(r.looks,0,'no looks before Analyze');
await a.goto(base+'/?synth&set='+encodeURIComponent('exposure=0.3;graze.opacity=0.2'));await a.waitForFunction(()=>window.digilight&&__bench.state.exposure===0.3,null,{timeout:30000});
assert.equal(await a.evaluate(()=>__bench.state.graze.opacity),0.2,'?set= on open');
const br=await a.evaluate(async(u)=>{const f=document.createElement('iframe');f.style.cssText='width:900px;height:700px';document.body.append(f);
 const replies={};let ready;const isReady=new Promise(r=>{ready=r;});addEventListener('message',e=>{if(e.source!==f.contentWindow)return;if(e.data.digilight==='ready')ready();else replies[e.data.digilight]?.(e.data);});
 f.src=u;await isReady;const call=(id,method,...args)=>new Promise(r=>{replies[id]=r;f.contentWindow.postMessage({digilight:id,method,args},'*');});
 const s=await call(1,'set','exposure',0.25),i=await call(2,'info'),bad=await call(3,'nope'),err=await call(4,'set','graze.opacity',5);
 return {s,i,bad,err,state:f.contentWindow.__bench.state.exposure,note:!!f.contentDocument.getElementById('bridgeNote')};},base+'/?synth&bridge');
assert.deepEqual(br.s.result,{exposure:0.25});assert.equal(br.state,0.25);assert.ok(br.i.result.preview.width>0);assert.match(br.bad.error,/Unknown method/);assert.match(br.err.error,/Invalid graze light/);assert.ok(br.note,'bridge notice shown');
await a.goto(base+'/?synth');await a.waitForFunction(()=>window.digilight);assert.equal(await a.evaluate(()=>!!document.getElementById('bridgeNote')),false,'no bridge without ?bridge');
await ctx.close();console.log('PASS automation API: set by name (one undo step, validated), render/export, project round trip, presets, ?set=, postMessage bridge');}
// Shadow light (+ Shadow): a Shade darkens a soft pool where its dot is and leaves the rest alone; Darkness 0 is no change;
// Negative light also darkens there; kind and darkness are validated, saved in projects, and reachable by the API.
{const ctx=await browser.newContext({viewport:{width:1350,height:900}});const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));
await a.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await a.waitForFunction(()=>window.digilight&&window.__studio);await a.waitForTimeout(300);
const r=await a.evaluate(async()=>{const d=window.digilight,out={};
 const luma=async()=>{const im=new Image();im.src=await d.render();await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
  const at=(fx,fy)=>{const w=Math.round(im.width*.08),h=Math.round(im.height*.08),D=g.getImageData(Math.round(im.width*fx-w/2),Math.round(im.height*fy-h/2),w,h).data;let s=0;for(let i=0;i<D.length;i+=4)s+=.2126*D[i]+.7152*D[i+1]+.0722*D[i+2];return s/(D.length/4);};
  return {near:at(.3,.3),far:at(.8,.8),url:im.src};};
 const L0=await luma();
 document.querySelector('#addShadow').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const l=__bench.state.lights[1];out.kind=l.kind;out.n=__bench.state.lights.length;out.tab=[...document.querySelectorAll('#tabs button')].map(b=>b.textContent);
 out.dot=document.querySelectorAll('.handle.shadow').length;out.panel=[...document.querySelectorAll('#lightPanel label')].map(x=>x.textContent);
 const L1=await luma();out.shade=[L1.near/L0.near,L1.far/L0.far];
 await d.set('lights.1.dark',0);out.zero=(await luma()).url===L0.url;await d.set('lights.1.dark',0.6);
 document.querySelector('#lightPanel [data-kind=negative]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));out.neg=__bench.state.lights[1].kind;
 const L2=await luma();out.negative=[L2.near/L0.near,L2.far/L0.far];
 for(const [k,v] of [['lights.1.kind','cloud'],['lights.1.dark',2]])try{await d.set(k,v);out[k]='no error';}catch(e){out[k]=e.message;}
 const proj=await d.getProject();out.saved=[proj.settings.lights[1].kind,proj.settings.lights[1].dark,proj.settings.lights[0].kind];
 await d.set('lights.1.kind','shade');await d.setProject(proj);out.reopened=__bench.state.lights[1].kind;
 const added=await d.addLight('shade',{x:.7,y:.3,aimX:.7,aimY:.3,dark:.4});out.added=[added.index,added.light.kind,added.light.dark];
 try{await d.addLight('cloud');}catch(e){out.badAdd=e.message;}
 out.removed=(await d.removeLight(2)).lights;
 await d.set('lights.1.kind','shade');const pool=await d.render(),shots={};
 for(const sh of ['window','blinds','leaves']){await d.set('lights.1.shape',sh);shots[sh]=await d.render();}
 out.shapes=new Set([pool,...Object.values(shots)]).size;
 for(const [k,v] of [['lights.1.shape','star'],['lights.1.patternSize',9]])try{await d.set(k,v);out['bad '+k]='no error';}catch(e){out['bad '+k]=e.message;}
 await d.set({'lights.1.shape':'window','lights.1.patternSize':1.5,'lights.1.patternRot':30});const pj=await d.getProject();out.shapeSaved=[pj.settings.lights[1].shape,pj.settings.lights[1].patternSize,pj.settings.lights[1].patternRot];
 return out;});
assert.equal(r.kind,'shade');assert.equal(r.n,2);assert.deepEqual(r.tab.slice(0,2),['Light 1','Shadow 2']);assert.ok(r.tab.includes('+ Shadow'));assert.equal(r.dot,1);
assert.ok(r.panel.includes('Darkness')&&r.panel.includes('Tint')&&!r.panel.includes('Shadow lift'),JSON.stringify(r.panel));
assert.ok(r.shade[0]<0.8&&Math.abs(r.shade[1]-1)<0.03,'shade darkens its pool only '+JSON.stringify(r.shade));assert.ok(r.zero,'Darkness 0 changes nothing');
assert.equal(r.neg,'negative');assert.ok(r.negative[0]<0.85&&Math.abs(r.negative[1]-1)<0.03,'negative light darkens near it '+JSON.stringify(r.negative));
assert.match(r['lights.1.kind'],/Invalid light kind/);assert.match(r['lights.1.dark'],/Invalid shadow darkness/);
assert.deepEqual(r.saved,['negative',0.6,undefined]);assert.equal(r.reopened,'negative');
assert.deepEqual(r.added,[2,'shade',0.4]);assert.equal(r.shapes,4,'pool, window, blinds and leaves each differ');assert.match(r['bad lights.1.shape'],/Invalid shadow shape/);assert.match(r['bad lights.1.patternSize'],/Invalid shadow shape/);assert.deepEqual(r.shapeSaved,['window',1.5,30]);assert.match(r.badAdd,/kind is light, shade or negative/);assert.equal(r.removed,2);
await ctx.close();console.log('PASS Shadow light: Shade pool and Negative light darken where they fall, shapes (window, blinds, leaves), validated, saved, API',JSON.stringify({shade:r.shade.map(v=>+v.toFixed(2)),negative:r.negative.map(v=>+v.toFixed(2))}));}
// Stroke direction: with Stroke definition on, 0 renders as before, more lights each stroke from the main lamp's side; off without Stroke definition; validated.
{const ctx=await browser.newContext({viewport:{width:1350,height:900}});const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));
await a.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await a.waitForFunction(()=>window.digilight&&window.__studio);await a.waitForTimeout(300);
const r=await a.evaluate(async()=>{const d=window.digilight,out={};
 await d.set({strokeDef:0,strokeDir:1});const off=await d.render();await d.set('strokeDir',0);out.offSame=(await d.render())===off;
 await d.set('strokeDef',0.6);const iso=await d.render();await d.set('strokeDir',1);const dir=await d.render();out.changed=dir!==iso;
 await d.set('lights.0.x',1-d.get('lights.0.x'));const flip=await d.render();out.followsLamp=flip!==dir;
 await d.set('strokeDir',0);out.isoBack=(await d.render())!==dir;
 try{await d.set('strokeDir',2);out.bad='no error';}catch(e){out.bad=e.message;}
 out.slider=!!document.querySelector('#strokeDir');return out;});
assert.ok(r.offSame,'no effect without Stroke definition');assert.ok(r.changed&&r.followsLamp&&r.isoBack,JSON.stringify(r));assert.match(r.bad,/nothing changed/);assert.ok(r.slider);
await ctx.close();console.log('PASS Stroke direction follows the main lamp, off at 0 and without Stroke definition, validated');}
// The relief is rebuilt only when a setting it is made from changes (app.js surfaceKey); an export reuses the
// preview's measurements without rebuilding it first, and the preview after it matches; a crop is that part of a whole export.
{const ctx=await browser.newContext({viewport:{width:1350,height:900}});const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));
await a.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await a.waitForFunction(()=>window.digilight&&window.__studio);await a.waitForTimeout(300);
const r=await a.evaluate(async()=>{const d=window.digilight,out={},n=()=>__bench.surfaceBuilds(),ranges=Object.fromEntries(d.describe().map(x=>[x.path,x]));
 await d.render();let b=n();
 await d.set({exposure:0.3,'lights.0.power':2,'graze.enabled':true,'graze.opacity':0.5});await d.render();out.shadeOnly=n()-b;
 const nudge=(k)=>{const v=d.get(k),x=ranges[k];if(typeof v==='boolean')return !v;const t=v+(x.max-x.min)*0.13;return Math.round((t>x.max?v-(x.max-x.min)*0.13:t)*1e4)/1e4;};
 out.keys={};
 for(const k of ['reliefScale','azimuthDeg','integrateTaps','chromaReject','albedoSuppress','fineRelief','mediumRelief','broadRelief','neutralize','photoDiffuse','textureDepthMm','paintingWidthCm','adjust.relief.amount','adjust.relief.fine','adjust.relief.mid']){
  if(!ranges[k]){out.keys[k]='not settable';continue;}b=n();await d.set(k,nudge(k));await d.render();out.keys[k]=n()-b;}
 b=n();await d.undo();await d.render();out.undo=n()-b;
 const px=async(url)=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,im.width,im.height);};
 const p0=await d.render();b=n();const e1=await d.export();out.exportBuilds=n()-b;const p1=await d.render();out.previewSame=p1===p0;out.rebuiltAfter=n()-b;
 const e2=await d.export();out.exportSame=e1===e2;
 const A=await px(e1),W=A.width,H=A.height;out.size=[W,H];
 const rect={x:Math.round(W*.3),y:Math.round(H*.2),w:Math.round(W*.25),h:Math.round(H*.3)};
 const C=await px(await d.export({crop:rect}));out.crop=[C.width,C.height];let diff=0;
 for(let y=0;y<C.height;y++)for(let x=0;x<C.width;x++)for(let ch=0;ch<3;ch++)diff+=Math.abs(C.data[(y*C.width+x)*4+ch]-A.data[((y+rect.y)*W+x+rect.x)*4+ch]);out.cropDiff=diff/(C.width*C.height*3);
 const F=await px(await d.export({crop:'0.5,0.5,0.5,0.5',width:100}));out.fracCrop=[F.width,F.height];
 for(const c of ['1,2',{x:-1,y:0,w:5,h:5}])try{await d.export({crop:c});out.badCrop='no error';}catch(e){out.badCrop=e.message;}
 b=n();await d.set('reliefScale',nudge('reliefScale'));const e3=await d.export();out.exportAfterSurface=[n()-b,e3!==e2];
 return out;});
assert.equal(r.shadeOnly,0,'lights, exposure and the graze do not rebuild the relief');
for(const [k,v] of Object.entries(r.keys))assert.equal(v,1,k+' rebuilds the relief once '+JSON.stringify(r.keys));
assert.equal(r.undo,1,'undo of a relief setting rebuilds it');
assert.equal(r.exportBuilds,0,'an export needs no preview rebuild first');assert.ok(r.previewSame&&r.rebuiltAfter===1,'the preview after an export rebuilds and matches '+JSON.stringify(r));
assert.ok(r.exportSame,'a second export matches the first');
assert.deepEqual(r.crop,[Math.round(r.size[0]*.25),Math.round(r.size[1]*.3)]);assert.ok(r.cropDiff<0.5,'a crop is that part of the whole export '+r.cropDiff);
assert.equal(r.fracCrop[0],50,'fractions of a width-scaled export '+JSON.stringify(r.fracCrop));assert.match(r.badCrop,/crop is/);
assert.ok(r.exportAfterSurface[0]===1&&r.exportAfterSurface[1],'an export after a relief setting rebuilds the preview first '+JSON.stringify(r.exportAfterSurface));
await ctx.close();console.log('PASS relief rebuilt only for its own settings, exports reuse the preview, crops match the whole export',JSON.stringify({keys:Object.keys(r.keys).length,cropDiff:+r.cropDiff.toFixed(4)}));}
// Metrics (measure.js imageMetrics) with render / export: against the photo at the same size and crop. With the
// photo on top at 100% the render is the photo, so every difference is ~0; brighter blows whites, darker crushes darks.
{const ctx=await browser.newContext({viewport:{width:1350,height:900}});const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));
await a.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await a.waitForFunction(()=>window.digilight&&window.__studio);await a.waitForTimeout(300);
const r=await a.evaluate(async()=>{const d=window.digilight,out={};
 d.setGuard(false);   // measures the pictures as set; the guard has its own test
 const plain=await d.render();const m=await d.render({metrics:true});out.same=m.image===plain;out.m=m.metrics;
 await d.set('originalTop',1);
 out.photoPreview=(await d.render({metrics:true})).metrics.vsPhoto;
 out.photoExport=(await d.export({width:120,metrics:true})).metrics;
 out.photoCrop=(await d.export({crop:'0.2,0.3,0.5,0.4',metrics:true})).metrics;
 await d.set('originalTop',0);
 await d.set('exposure',2.5);out.bright=(await d.render({metrics:true})).metrics;
 await d.set('exposure',d.describe().find(x=>x.path==='exposure').min);out.dark=(await d.render({metrics:true})).metrics;
 return out;});
// Exact, not near: the photo is drawn the way the picture's pixels started (preview copy / tile cut); resampled
// another way it is a level off, and on a bright painting that alone counted 0.5% as newly blown (10-20).
const near0=(v)=>v.newBlown===0&&v.newCrushed===0&&Math.abs(v.darksLift)<=0.05&&[v.stops.p05,v.stops.p50,v.stops.p95,...v.thirds].every(x=>x===0)&&Object.values(v.detail).every(x=>x===1);
assert.ok(r.same,'metrics leave the image as it was');
assert.ok(r.m.render.p50>0&&r.m.photo.p50>0&&r.m.size[0]>0&&r.m.render.thirds.length===3&&Array.isArray(r.m.warnings)&&r.m.ms>=0,JSON.stringify(r.m));
for(const [k,v] of [['preview',r.photoPreview],['export',r.photoExport.vsPhoto],['crop',r.photoCrop.vsPhoto]])assert.ok(near0(v),'the photo measures as the photo: '+k+' '+JSON.stringify(v));
assert.equal(r.photoExport.size[0],120);assert.ok(r.photoCrop.crop&&r.photoCrop.warnings.length===0,JSON.stringify(r.photoCrop));
assert.ok(r.bright.vsPhoto.newBlown>0.003&&r.bright.warnings.some(w=>/whites/.test(w))&&r.bright.vsPhoto.stops.p50>0,JSON.stringify(r.bright.vsPhoto));
assert.ok(r.dark.vsPhoto.stops.p50<0&&r.dark.warnings.some(w=>/darks/.test(w)),JSON.stringify(r.dark));
await ctx.close();console.log('PASS metrics: render / export / crop against the photo, the photo measures as itself, warnings for blown whites and dark',JSON.stringify({preview:r.photoPreview.detail,bright:r.bright.vsPhoto.newBlown,ms:r.m.ms}));}
// exportMany: variants that share a relief come out of one tiled pass (the relief built once per tile for
// them all), each the same picture as its own export; another relief gets its own pass; settings put back.
{const ctx=await browser.newContext({viewport:{width:1350,height:900}});const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));
await a.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await a.waitForFunction(()=>window.digilight&&window.__studio);await a.waitForTimeout(300);
const r=await a.evaluate(async()=>{const d=window.digilight,gb=__bench.gbuf,orig=gb.build;let tiles=0;d.setGuard(false);
 const pw=__bench.canvas.width,ph=__bench.canvas.height;gb.build=function(tex,w,h,o){if(w!==pw||h!==ph)tiles++;return orig.call(this,tex,w,h,o);};__bench.state.maxTile=160;
 const px=async(url)=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data;};
 const base=d.settings();
 await d.set({'graze.enabled':true,'graze.opacity':0.5});const A=d.settings();
 await d.set({exposure:0.4,'lights.0.kelvin':3500,'graze.detail':0.03});const B=d.settings();
 await d.set({reliefScale:Math.round(d.get('reliefScale')*1.5*100)/100});const C=d.settings();
 const single=[],per=[];for(const s of [A,B,C]){await d.setSettings(s);const t=tiles;single.push(await d.export({format:'png'}));per.push(tiles-t);}
 await d.setSettings(base);const before=JSON.stringify(d.settings());
 const t1=tiles;const many=await d.exportMany([A,B,C].map((settings)=>({settings,format:'png'})));const nMany=tiles-t1;const after=JSON.stringify(d.settings());
 const diffs=[];for(let k=0;k<3;k++){const p=await px(single[k]),q=await px(many[k]);let sum=0;for(let i=0;i<p.length;i++)sum+=Math.abs(p[i]-q[i]);diffs.push(sum/p.length);}
 const m=await d.exportMany([{settings:A,width:100,crop:'0,0,0.5,0.5',format:'jpeg'}],{metrics:true});
 let bad='';try{await d.exportMany([{width:100}]);}catch(e){bad=e.message;}
 delete __bench.state.maxTile;gb.build=orig;
 return {per,nMany,diffs,restored:before===after,distinct:new Set(single).size,m:[m[0].image.slice(0,23),m[0].metrics.size,!!m[0].metrics.crop],bad};});
assert.equal(r.distinct,3,'three different pictures');assert.ok(r.per.every(n=>n>1),'several tiles each '+JSON.stringify(r.per));
assert.equal(r.nMany,Math.max(r.per[0],r.per[1])+r.per[2],'A and B share one relief pass, C has its own '+JSON.stringify(r));
assert.ok(r.diffs.every(x=>x<0.5),'each the same as its own export '+JSON.stringify(r.diffs));assert.ok(r.restored,'settings put back');
assert.ok(r.m[0]==='data:image/jpeg;base64,'&&r.m[1][0]===50&&r.m[2],'a cropped, scaled jpeg with metrics '+JSON.stringify(r.m));assert.match(r.bad,/exportMany takes/);
await ctx.close();console.log('PASS exportMany: shared relief rendered once for its variants, same pictures as single exports, settings put back',JSON.stringify({per:r.per,many:r.nMany,diffs:r.diffs.map(x=>+x.toFixed(4))}));}
// Record (digilight.record): what a picture was made from; its settings make the same picture again.
{const ctx=await browser.newContext({viewport:{width:1350,height:900}});const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));
await a.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await a.waitForFunction(()=>window.digilight&&window.__studio);await a.waitForTimeout(300);
const r=await a.evaluate(async()=>{const d=window.digilight;
 await d.applyPreset('graze','Classic raking');await d.set({exposure:0.2,'lights.0.kelvin':3600});const img=await d.render();
 const rec=await d.record({metrics:{probe:1}});await d.set({exposure:-1,'graze.enabled':false});const changed=(await d.render())!==img;
 await d.setSettings(rec.settings);const again=(await d.render())===img;
 const e1=await d.export({width:120,hash:true}),e2=await d.export({width:120,hash:true,metrics:true}),r1=await d.render({hash:true});
 return {rec:{format:rec.format,version:rec.version,at:typeof rec.at,renderer:rec.renderer,photo:rec.photo,look:rec.look,metrics:rec.metrics,exposure:rec.settings.exposure},changed,again,json:JSON.stringify(rec).length,
  px:[e1.pixels,e2.pixels,typeof e1.image,!!e2.metrics,r1.pixels]};});
assert.equal(r.rec.format,'digilight-record');assert.equal(r.rec.version,1);assert.equal(r.rec.at,'string');assert.ok(r.rec.renderer&&r.rec.renderer.software===true&&r.rec.renderer.name,'renderer '+JSON.stringify(r.rec.renderer));
assert.ok(r.rec.photo.width>0&&r.rec.photo.height>0);assert.equal(r.rec.look,null,'no look applied');assert.deepEqual(r.rec.metrics,{probe:1});assert.equal(r.rec.exposure,0.2);
assert.ok(r.changed&&r.again,'the record\'s settings make the same picture again '+JSON.stringify(r));
// Fingerprints (SHA-256 of the pixels before encoding): the photo's in the record; an export's, the same each time.
assert.match(r.rec.photo.pixelsSha256,/^[0-9a-f]{64}$/);const [p1,p2,ty,hasM,pr]=r.px;
assert.match(p1.sha256,/^[0-9a-f]{64}$/);assert.equal(p1.width,120);assert.deepEqual(p1,p2,'the same export, the same fingerprint');assert.equal(ty,'string');assert.ok(hasM);assert.match(pr.sha256,/^[0-9a-f]{64}$/);
await ctx.close();console.log('PASS record: renderer, photo, look, extras, settings that make the same picture again',r.json+' bytes');}
// Guard (guard.js): a change that blows whites is brought back (exposure, until nothing new blows) in the same undo step and says so;
// with the guard off it stays, the chip says what clips and Fix repairs it as its own step; crushed darks are lifted.
{const ctx=await browser.newContext({viewport:{width:1350,height:900}});const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));
await a.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await a.waitForFunction(()=>window.digilight&&window.__studio);await a.waitForTimeout(300);
const r=await a.evaluate(async()=>{const d=window.digilight,out={},wait=(ms)=>new Promise(r=>setTimeout(r,ms));
 out.start=[d.get('exposure'),d.get('highlightRolloff')];out.clean=await d.guard({fix:false});
 const u0=__studio.history.index;out.set=await d.set('exposure',2.5);out.steps=__studio.history.index-u0;out.g=d.lastGuard();
 out.now=[d.get('exposure'),d.get('highlightRolloff')];
 await d.undo();out.undone=[d.get('exposure'),d.get('highlightRolloff')];
 d.setGuard(false);await d.set('exposure',2.5);out.unguarded=d.get('exposure');out.check=await d.guard({fix:false});
 // Measured on the relit picture whatever the screen shows: Split view gives the same numbers and is left as it was.
 __bench.state.compareSplit=0.5;out.split=await d.guard({fix:false});out.splitKept=__bench.state.compareSplit;__bench.state.compareSplit=-1;
 __bench.render();const chip=document.getElementById('guardChip');for(let t=0;t<50&&chip.hidden;t++)await wait(100);out.chip=[chip.hidden,chip.textContent];
 const u1=__studio.history.index;chip.querySelector('button').click();out.fix=[d.get('exposure'),d.get('highlightRolloff'),__studio.history.index-u1,chip.textContent];
 await d.undo();out.fixUndone=d.get('exposure');
 await d.set({exposure:0,highlightRolloff:out.start[1],ambient:0.3});out.darkBefore=await d.guard({fix:false});
 d.setGuard(true);await d.set({ambient:0,exposure:-1.5});out.dark=d.lastGuard();out.darkNow=[d.get('ambient'),d.get('exposure')];
 // Short of the limit (room light capped at 0.01): it still applies all it may, and says it fell short.
 d.setGuard(false);await d.set({ambient:0,exposure:-1.5});out.short=await d.guard({darks:['ambient'],ambientMax:0.01});out.shortAmbient=d.get('ambient');d.setGuard(true);
 return out;});
assert.ok(r.clean.ok&&!r.clean.fixed,'the synthetic painting starts clean '+JSON.stringify(r.clean));
assert.ok(r.g.fixed&&r.g.ok&&r.g.after.newBlown<=0.003&&r.g.before.newBlown>0.003,'guarded '+JSON.stringify(r.g));assert.equal(r.steps,1,'change and fix: one undo step');
assert.match(r.g.note,/^Guard: exposure \+2\.50 → /);assert.equal(r.g.after.newBlown,0,'whites: exposure down until nothing new blows');assert.ok(r.now[0]<2.5&&r.now[1]===r.start[1],JSON.stringify(r.now));assert.deepEqual(r.set.exposure,r.now[0],'set returns the guarded value');
assert.deepEqual(r.undone,r.start,'one undo takes change and fix back');
assert.equal(r.unguarded,2.5);assert.ok(!r.check.ok&&!r.check.fixed,JSON.stringify(r.check));
assert.deepEqual(r.split.before,r.check.before,'Split view: the relit picture is judged');assert.equal(r.splitKept,0.5,'and the view is left as it was');
assert.ok(!r.chip[0]&&/newly blown/.test(r.chip[1]),'chip shows what clips '+JSON.stringify(r.chip));
assert.ok((r.fix[0]<2.5||r.fix[1]>r.start[1])&&r.fix[2]===1&&/Fixed/.test(r.fix[3]),'Fix: one undo step '+JSON.stringify(r.fix));assert.equal(r.fixUndone,2.5);
assert.ok(r.darkBefore.ok,'clean before the dark change');assert.ok(r.dark.fixed&&r.dark.after.newCrushed<r.dark.before.newCrushed&&r.dark.after.newCrushed<=0.00075&&/^Guard: room light /.test(r.dark.note),'darks lifted to half the limit '+JSON.stringify(r.dark));
assert.ok(!r.short.ok&&r.short.fixed&&r.shortAmbient===0.01&&r.short.after.newCrushed<r.short.before.newCrushed&&/still over the limit/.test(r.short.note),'short of the limit: applied '+JSON.stringify([r.shortAmbient,r.short]));
await ctx.close();console.log('PASS guard: whites and darks brought back in the same undo step, off switch, chip and Fix',JSON.stringify({note:r.g.note,dark:r.dark&&r.dark.note}));}
// Scene (sceneui.js, scene.js, scenedepth.js): a photo of a person is suggested as a portrait, never switched by itself; Relight as
// Portrait reads its space and opens on a light scene in one undo step; the subject stands in front of its backdrop and throws its
// shadow there, to the side away from the light; sun lights, lights for the subject only, relighting the subject only; effects
// (background blur keeps the subject's pixels); a tiled export matches the preview; saved in projects; validated; the API.
{const ctx=await browser.newContext({viewport:{width:1350,height:900}});const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));
await a.goto('http://127.0.0.1:'+(process.env.DIGILIGHT_PORT||8766)+'/?synth');await a.waitForFunction(()=>window.digilight&&window.__studio);await a.waitForTimeout(300);
await a.evaluate(async()=>{__studio.guard.enabled=false;const {SCENES}=await import('/tests/scenes.mjs');const s=SCENES.portrait(240,300);
  const c=document.createElement('canvas');c.width=s.w;c.height=s.h;c.getContext('2d').putImageData(new ImageData(s.rgba,s.w,s.h),0,0);await __bench.setSource(c);});
await a.waitForFunction(()=>__studio.scene.suggestion,null,{timeout:60000});
const px=(sel)=>a.evaluate((sel)=>{__bench.render();const c=__bench.canvas,g=document.createElement('canvas');g.width=c.width;g.height=c.height;const x=g.getContext('2d');x.drawImage(c,0,0);
  const d=x.getImageData(0,0,c.width,c.height).data,at=([u,v])=>{const i=(Math.round(v*(c.height-1))*c.width+Math.round(u*(c.width-1)))*4;return [d[i],d[i+1],d[i+2]];};return sel.map(at);},sel);
const S0=await a.evaluate(()=>({type:__bench.state.scene.type,sug:__studio.scene.suggestion.type,shown:!document.querySelector('#sceneQuick .sceneSuggest').hidden,hist:__studio.history.index}));
assert.deepEqual([S0.type,S0.sug,S0.shown],['artwork','portrait',true],'suggested, not switched '+JSON.stringify(S0));
await a.evaluate(()=>__studio.tools.show('setup'));await a.locator('#sceneQuick .sceneSuggest button').click();await a.waitForTimeout(300);
const S1=await a.evaluate(()=>({type:__bench.state.scene.type,active:__studio.scene.active,steps:__studio.history.index,lights:__bench.state.lights.length,exp:__bench.state.exposure}));
assert.ok(S1.type==='portrait'&&S1.active==='loop'&&S1.steps===S0.hist+1&&S1.lights===2,'Relight as Portrait: soft key, one undo step '+JSON.stringify(S1));
await a.click('#undo');await a.waitForTimeout(200);assert.equal(await a.evaluate(()=>__bench.state.scene.type),'artwork','undo');await a.click('#redo');await a.waitForTimeout(200);assert.equal(await a.evaluate(()=>__bench.state.scene.type),'portrait','redo');
// The space: in the Height view the face stands out of its backdrop.
await a.evaluate(()=>{__bench.state.viewMode=2;});const [hFace,hBack]=await px([[0.5,0.36],[0.08,0.2]]);await a.evaluate(()=>{__bench.state.viewMode=0;});
assert.ok(hFace[0]>hBack[0]+80,'subject in front of the backdrop '+JSON.stringify([hFace,hBack]));
// One hard lamp: its shadow falls on the backdrop away from it (Shadows view: blue where shadowed).
const one=(x,more={})=>a.evaluate(([x,more])=>digilight.setSettings({lights:[{x,y:0.62,z:0.75,power:6,kelvin:5000,useKelvin:true,hex:'#ffffff',cone:0,softness:0.5,size:0.01,falloff:2,aimX:0.5,aimY:0.62,enabled:true,...more}],ambient:0.1,shadow:1}),[x,more]);
const shadowAt=async(pts)=>{await a.evaluate(()=>{__bench.state.viewMode=6;});const v=await px(pts);await a.evaluate(()=>{__bench.state.viewMode=0;});return v.map(([r,,b])=>b-r);};
await one(-0.2);const left=await shadowAt([[0.78,0.4],[0.22,0.4]]);await one(1.2);const right=await shadowAt([[0.78,0.4],[0.22,0.4]]);
assert.ok(left[0]>80&&left[1]<30&&right[1]>80&&right[0]<30,'the subject\'s shadow falls on the far side '+JSON.stringify({left,right}));
// The sun: one direction everywhere, validated; a light for the subject alone leaves the backdrop to the room light.
await one(-0.2,{sun:true});const sun=await shadowAt([[0.78,0.4],[0.22,0.4]]);assert.ok(sun[0]>80&&sun[1]<30,'sun shadow '+JSON.stringify(sun));
await one(-0.2);const [bAll]=await px([[0.12,0.5]]);await one(-0.2,{target:'subject'});const [bSub,fSub]=await px([[0.12,0.5],[0.45,0.36]]);
assert.ok(bSub[1]<bAll[1]-20&&fSub[1]>40,'a light for the subject alone '+JSON.stringify({bAll,bSub,fSub}));
let bad=await a.evaluate(async()=>{const out=[];for(const ch of [{'lights.0.target':'moon'},{'scene.type':'nope'},{'scene.depth':9},{'fx.glow.amount':2}])try{await digilight.set(ch);out.push('accepted');}catch(e){out.push('refused');}return out;});
assert.deepEqual(bad,['refused','refused','refused','refused'],'validated');
// Relight the subject only: the backdrop stays exactly as photographed.
await one(-0.2);await a.evaluate(()=>digilight.set({'scene.apply':'subject'}));const [rel]=await px([[0.1,0.15]]);await a.evaluate(()=>{__bench.state.viewMode=4;});const [orig]=await px([[0.1,0.15]]);await a.evaluate(()=>{__bench.state.viewMode=0;});
assert.ok(rel.every((v,i)=>Math.abs(v-orig[i])<=1),'subject only: backdrop as photographed '+JSON.stringify({rel,orig}));await a.evaluate(()=>digilight.set({'scene.apply':'all'}));
// Background blur: the subject's pixels unchanged, the backdrop's detail softened.
const patch=(u0,v0)=>a.evaluate(([u0,v0])=>{__bench.render();const c=__bench.canvas,g=document.createElement('canvas');g.width=c.width;g.height=c.height;const x=g.getContext('2d');x.drawImage(c,0,0);
  const w=12,X=Math.round(u0*c.width),Y=Math.round(v0*c.height),d=x.getImageData(X,Y,w,w).data;let m=0,q=0;for(let i=0;i<d.length;i+=4){m+=d[i+1];q+=d[i+1]*d[i+1];}m/=w*w;return {sd:Math.sqrt(q/(w*w)-m*m),px:Array.from(d.slice(0,48))};},[u0,v0]);
const f0=await patch(0.47,0.34),b0=await patch(0.05,0.55);await a.evaluate(()=>digilight.set({'fx.blur.on':1,'fx.blur.amount':1,'fx.blur.size':0.02}));const f1=await patch(0.47,0.34),b1=await patch(0.05,0.55);
assert.deepEqual(f1.px,f0.px,'the subject stays sharp');assert.ok(b1.sd<b0.sd*0.8,'the backdrop softened '+JSON.stringify([b0.sd,b1.sd]));
// Every effect on, a light scene: a tiled export is the preview.
const ex=await a.evaluate(async()=>{await digilight.applyLightScene('window-frame');await digilight.set({'fx.glow.on':1,'fx.haze.on':1,'fx.rays.on':1});__bench.render();
  const c=__bench.canvas,pv=document.createElement('canvas');pv.width=c.width;pv.height=c.height;pv.getContext('2d').drawImage(c,0,0);
  __bench.state.maxTile=120;const e=await __bench.exportFullRes();delete __bench.state.maxTile;
  const p=pv.getContext('2d').getImageData(0,0,pv.width,pv.height).data,q=e.getContext('2d').getImageData(0,0,e.width,e.height).data;let s=0,m=0;for(let i=0;i<p.length;i+=4)for(let k=0;k<3;k++){const d=Math.abs(p[i+k]-q[i+k]);s+=d;m=Math.max(m,d);}
  return {mean:s/(p.length*0.75),max:m,size:[e.width,e.height]};});
assert.ok(ex.mean<0.05&&ex.max<=2,'tiled export with scene and effects matches the preview '+JSON.stringify(ex));
// Saved in a project and back: the same picture.
const pr=await a.evaluate(async()=>{const img=await digilight.render(),p=await digilight.getProject();await digilight.set({'scene.type':'artwork','fx.on':0});const off=await digilight.render();await digilight.setProject(p);const back=await digilight.render();return {changed:off!==img,same:back===img,type:__bench.state.scene.type};});
assert.ok(pr.changed&&pr.same&&pr.type==='portrait','scene and effects saved in the project '+JSON.stringify(pr));
// The API: the type with its light scene, the scenes for it, a scene by preset.
const api=await a.evaluate(async()=>{const d=digilight,t=await d.imageType('room'),l=d.lightScenes().map(x=>x.id),c=await d.applyLightScene('candle',{flip:true}),p=await d.applyPreset('scene','gallery');
  const desc=d.describe().filter(x=>/^(scene|fx)\./.test(x.path)).length;return {type:t.type,scene:t.lightScene,l,c:c.id,p:p.name,desc,s:await d.suggestType()};});
assert.ok(api.type==='room'&&api.scene==='gallery'&&api.l.includes('candle')&&!api.l.includes('butterfly')&&api.c==='candle'&&api.p==='gallery'&&api.desc>=20&&api.s.type==='portrait',JSON.stringify(api));
// The Scene tool's light scene tiles come (each rendered for this photo).
await a.evaluate(()=>__studio.tools.show('scene'));await a.waitForFunction(()=>[...document.querySelectorAll('#sceneLooks .autoLook canvas')].filter(c=>c.width>10).length>=2,null,{timeout:240000});
// The user's own pieces (testdata/photos) are suggested as artwork: the lintel's white plaster was once read as an overcast sky.
const own=await a.evaluate(async()=>{const out={};for(const f of ['lintel-flat-crop','door-flat-crop','band-outdoor-crop']){await digilight.load('/testdata/photos/'+f+'.jpg');out[f]=(await digilight.suggestType()).type;}return out;});
assert.deepEqual(own,{'lintel-flat-crop':'artwork','door-flat-crop':'artwork','band-outdoor-crop':'artwork'},'the user\'s pieces read as artwork');
await ctx.close();console.log('PASS scene: portrait suggested, not switched; Relight as Portrait in one undo step; subject forward, its shadow away from the light; sun, subject-only light and relight; blur keeps the subject; tiled export; project; validated; API; the user\'s pieces read as artwork',JSON.stringify({left,right,ex}));}
assert.deepEqual(errors,[]);console.log('PASS no browser or WebGL errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
