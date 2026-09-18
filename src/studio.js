import { surfaces, materials, lighting, History } from './presets.js';

export function initStudio(api) {
  const { state, refresh, render, applyColor } = api;
  const $ = id => document.getElementById(id);
  const toolbar = document.createElement('div');
  toolbar.id = 'studioToolbar';
  toolbar.innerHTML = `<strong>DigiLight <small>Creative studio</small></strong>
    <button id="undo" title="Undo · Ctrl/Cmd Z">↶ Undo</button><button id="redo" title="Redo · Ctrl/Cmd Shift Z">↷ Redo</button>
    <button id="compare">Before / After</button><button id="splitView">Split view</button>
    <button id="showHandles" class="on">Light guides</button><span id="compareLabel">AFTER · RELIT</span>`;
  document.body.prepend(toolbar);
  const panel = document.createElement('div');
  panel.id = 'creative';
  panel.innerHTML = `<h2>Start a look</h2><div class="grp">
    <label class="selectRow">Surface<select id="surfacePreset"><option value="">Choose texture…</option></select></label>
    <label class="selectRow">Material<select id="materialPreset"><option value="">Choose finish…</option></select></label>
    <label class="selectRow">Lighting<select id="lightingPreset"><option value="">Choose lighting…</option></select></label>
    <button id="autoSetup">Auto setup</button><button id="resetLighting">Reset lighting</button>
    <p class="note" id="autoStatus">A restrained starting look. Adjust texture to suit your painting.</p>
    </div><h2>Texture & shadows</h2><div class="grp" id="creativeSliders"></div>
    <h2>Local texture correction</h2><div class="grp">
    <div class="views"><button id="brushOff" class="on">Move lights</button><button id="brushAdd">Add relief</button><button id="brushRemove">Remove relief</button></div>
    <label class="selectRow">Brush size<input id="brushSize" type="range" min="5" max="160" value="45"></label>
    <button id="clearMask">Clear corrections</button><p class="note">Brush to strengthen or suppress estimated texture. This does not repaint the artwork. Undo works per stroke.</p></div>
    <h2>Projects & variations</h2><div class="grp">
    <input id="projectName" class="full" aria-label="Project name" value="Untitled painting" maxlength="120">
    <div class="views"><button id="saveProject">Save project</button><button id="saveVariation">Save variation</button></div>
    <label class="selectRow">Saved<select id="projectList"><option value="">Choose project…</option></select></label>
    <button id="loadProject">Open saved</button><button id="downloadProject">Download project</button><button id="importProject">Import project</button>
    <input id="projectFile" type="file" accept=".json,application/json" hidden>
    <p class="note" id="projectStatus">Projects include the photo, lighting and corrections. Local saves stay in this browser. Download a project for backup.</p></div>`;
  $('panel').insertBefore(panel, $('surfaceControls').previousElementSibling);
  // Keep routine lighting controls near the presets; specialist capture stays available.
  const sourceGroup = $('src').closest('.grp'), sourceHeading = sourceGroup.previousElementSibling;
  const capture = document.createElement('details'); capture.className='sectionDetails';capture.innerHTML='<summary>Demo & multi-photo capture</summary>';
  sourceHeading.replaceWith(capture);capture.append(sourceGroup);
  const lights = document.createElement('details');lights.className='sectionDetails';lights.open=true;lights.innerHTML='<summary>Lights · drag dots on the painting</summary>';
  const tabs=$('tabs'), lightPanel=$('lightPanel');tabs.previousElementSibling.remove();lights.append(tabs,lightPanel);
  panel.insertBefore(lights,panel.querySelectorAll('h2')[1]);
  for (const [id,title] of [['brushOff','Local texture correction'],['projectName','Projects & variations']]) {
    const group=$(id).closest('.grp'), heading=group.previousElementSibling;
    const details=document.createElement('details');details.className='sectionDetails';details.innerHTML=`<summary>${title}</summary>`;
    heading.replaceWith(details);details.append(group);
  }
  for (const [id, data] of [['surfacePreset', surfaces], ['materialPreset', materials], ['lightingPreset', lighting]]) {
    for (const name of Object.keys(data)) $(id).add(new Option(name, name));
  }
  const defaults = { fineRelief: 0.65, mediumRelief: 0.8, broadRelief: 0.15, neutralize: 0, metallic: 0, shadowSoftness: 0.4, highlightRolloff: 0.7, meanLuma: 0.25, strokes: [] };
  Object.assign(state, defaults);
  const extraKeys = Object.keys(defaults);
  const baseMap = { reliefScale:'reliefScale', azimuth:'azimuthDeg', taps:'integrateTaps', reliefStrength:'reliefStrength', chromaReject:'chromaReject', albedoSuppress:'albedoSuppress', reliefAmount:'reliefAmount', heightScale:'heightScale', roughness:'roughness', specular:'specular', shadow:'shadow', shadowSpread:'shadowSpread', ao:'ao', ambient:'ambient', exposure:'exposure' };
  const keys = [...new Set([...Object.values(baseMap), ...extraKeys, 'lights', 'selected'])];
  const snapshot = () => Object.fromEntries(keys.map(k => [k, structuredClone(state[k])]));
  const history = new History();
  let before = false, split = false, brush = '', restoring = false, loading = false, projectId = null;
  let sourceRevision = 0;
  const mask = document.createElement('canvas'); mask.width = mask.height = 768;
  state.maskCanvas = mask; state.maskVersion = 0;
  const ctx = mask.getContext('2d');
  const beam = document.createElementNS('http://www.w3.org/2000/svg','svg');
  beam.id='beamGuide';beam.setAttribute('viewBox','0 0 100 100');beam.setAttribute('preserveAspectRatio','none');
  beam.innerHTML='<title>Approximate beam footprint and aim</title><ellipse fill="none" stroke="white" stroke-opacity=".3" stroke-width=".3" stroke-dasharray="1 1"/><line stroke="white" stroke-opacity=".45" stroke-width=".3" stroke-dasharray="1 1"/>';
  $('wrap').append(beam);
  function updateBeam(){const l=state.lights[state.selected];beam.style.display=l?.enabled?'':'none';if(!l)return;const x=(l.aimX??l.x)*100,y=(1-(l.aimY??l.y))*100;const cos=.02+.965*l.cone;const radius=Math.min(180,l.z*Math.sqrt(1-cos*cos)/cos*100);const ell=beam.querySelector('ellipse');for(const [k,v] of Object.entries({cx:x,cy:y,rx:radius,ry:radius/(api.canvas.height/api.canvas.width)}))ell.setAttribute(k,v);const line=beam.querySelector('line');for(const [k,v] of Object.entries({x1:l.x*100,y1:(1-l.y)*100,x2:x,y2:y}))line.setAttribute(k,v);}
  document.addEventListener('digilight:render',updateBeam); updateBeam();
  function stamp(point, mode, radius, aspect) {
    const x = point[0]*768, y = point[1]*768;
    ctx.save(); ctx.translate(x,y); ctx.scale(1,1/aspect);
    const g = ctx.createRadialGradient(0,0,0,0,0,radius*768);
    const rgb = mode === 'add' ? '255,255,255' : '0,0,0';
    g.addColorStop(0,`rgba(${rgb},0.22)`); g.addColorStop(1,`rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(-radius*768,-radius*768,radius*1536,radius*1536); ctx.restore();
  }
  function rebuildMask() {
    ctx.fillStyle = '#808080'; ctx.fillRect(0,0,768,768);
    for (const stroke of state.strokes) for (const point of stroke.points) stamp(point,stroke.mode,stroke.radius,stroke.aspect);
    state.maskVersion++; render();
  }
  function historyUI() { $('undo').disabled = history.index <= 0; $('redo').disabled = history.index >= history.entries.length-1; }
  function checkpoint() { if (!restoring && !loading && !state.exporting) { history.push(snapshot()); historyUI(); } }
  function sync() {
    for (const [id,k] of Object.entries(baseMap)) if ($(id)) $(id).value = state[k];
    for (const k of extraKeys) if ($(k)) $(k).value = state[k];
    document.querySelectorAll('#creativeSliders .row').forEach(row => { row.querySelector('output').textContent = Number(row.querySelector('input').value).toFixed(2); });
    refresh(); rebuildMask(); historyUI();
  }
  function restore(value) { if (!value || state.exporting) return; restoring = true; Object.assign(state,value); sync(); restoring = false; }
  $('undo').onclick = () => { if (!state.exporting) restore(history.undo()); };
  $('redo').onclick = () => { if (!state.exporting) restore(history.redo()); };
  document.addEventListener('keydown', e => {
    if (e.target.matches('input:not([type=range]),textarea,select') || state.exporting) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('redo') : $('undo')).click(); }
    if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) $('compare').click();
  });
  // Capture one final snapshot per gesture; input events only redraw.
  document.addEventListener('change', () => setTimeout(checkpoint,0));
  document.addEventListener('pointerup', () => setTimeout(checkpoint,0));
  document.addEventListener('pointercancel', () => setTimeout(checkpoint,0));
  document.addEventListener('click', e => { if (!e.target.closest('#undo,#redo,#exportBtn')) setTimeout(checkpoint,0); });
  const newControls = [
    ['fineRelief','Fine texture',0,2,0.05,true], ['mediumRelief','Medium relief',0,2,0.05,true], ['broadRelief','Broad relief',0,2,0.05,true],
    ['neutralize','Neutralize light',0,1,0.02,true], ['shadowSoftness','Shadow softness',0,1,0.02,false],
    ['metallic','Metallic',0,1,0.02,false], ['highlightRolloff','Highlight rolloff',0,1,0.02,false],
  ];
  for (const [key,label,min,max,step,surface] of newControls) {
    const row = document.createElement('div'); row.className='row';
    row.innerHTML=`<label for="${key}">${label}</label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state[key]}"><output>${state[key]}</output>`;
    row.querySelector('input').oninput=e=>{state[key]=+e.target.value; row.querySelector('output').textContent=state[key].toFixed(2); if(surface) api.dirty(); render();};
    $('creativeSliders').append(row);
  }
  const warning = document.createElement('p'); warning.className='note'; warning.textContent='Neutralize light reduces local brightness variation and may alter tonal details. Start low; compare often.'; $('creativeSliders').append(warning);
  for (const [id,label] of Object.entries({chromaReject:'Protect color edges', reliefStrength:'Texture strength',reliefScale:'Texture size',shadow:'Shadow depth',ao:'Contact shadow',specular:'Highlight strength',heightScale:'Relief depth',albedoSuppress:'Reduce baked detail'})) $(id).closest('.row').querySelector('label').textContent=label;
  const advanced = document.createElement('details'); advanced.innerHTML='<summary>Advanced surface recovery</summary>';
  for (const id of ['azimuth','taps','albedoSuppress']) advanced.append($(id).closest('.row'));
  $('surfaceControls').append(advanced);
  function makeLight(values) {
    const [x,y,z,power,kelvin,cone,softness]=values;
    const l={x,y,z,power,kelvin,cone,softness,falloff:2,aimX:0.5,aimY:0.5,useKelvin:true,hex:'#ffffff',enabled:true}; applyColor(l); return l;
  }
  function useLighting(name) { state.lights=lighting[name].map(makeLight); state.selected=0; state.ambient=0.22; refresh(); }
  $('lightingPreset').onchange=e=>{if(e.target.value) {useLighting(e.target.value); sync();}};
  $('surfacePreset').onchange=e=>{const v=surfaces[e.target.value]; if(!v)return; [state.fineRelief,state.mediumRelief,state.broadRelief,state.reliefStrength]=v; state.reliefAmount=v[3]?1:0; sync();};
  $('materialPreset').onchange=e=>{const v=materials[e.target.value]; if(!v)return; [state.roughness,state.specular,state.metallic]=v; sync();};
  $('resetLighting').onclick=()=>{useLighting('Gallery track'); state.exposure=0; sync();};
  function autoSetup() {
    if (state.mode !== 'single') { $('autoStatus').textContent='Auto setup is for single photographs; capture mode uses measured light directions.'; return; }
    const source=api.source(); if(!source)return;
    const sample=document.createElement('canvas'); sample.width=128; sample.height=128;
    const c=sample.getContext('2d',{willReadFrequently:true}); c.drawImage(source,0,0,128,128);
    const d=c.getImageData(0,0,128,128).data; let sum=0,detail=0;
    const linear = x => x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4;
    const gray = i => 0.2126*linear(d[i]/255)+0.7152*linear(d[i+1]/255)+0.0722*linear(d[i+2]/255);
    for(let i=0;i<d.length;i+=4){ const v=gray(i);sum+=v; if((i/4)%128)detail+=Math.abs(v-gray(i-4)); }
    state.meanLuma=sum/(128*128); const busy=detail/(128*128);
    state.reliefStrength=busy>0.08?5:8; state.reliefScale=busy>0.08?2:3;
    state.fineRelief=0.65;state.mediumRelief=0.8;state.broadRelief=0.12;
    state.chromaReject=0.85;state.albedoSuppress=0.2;state.neutralize=0;state.reliefAmount=1;
    state.roughness=0.72;state.specular=0.45;state.metallic=0;state.exposure=0;
    useLighting('Gallery track'); sync();
    $('autoStatus').textContent=`Auto setup applied ${busy>0.08?'gentle relief for detailed colour':'moderate relief'}. Original light direction and material cannot be reliably identified from one photo.`;
  }
  $('autoSetup').onclick=()=>{autoSetup();checkpoint();};
  const splitRow=document.createElement('div'); splitRow.id='splitControl'; splitRow.hidden=true;
  splitRow.innerHTML='<span>BEFORE</span><input type="range" min="0" max="100" value="50" aria-label="Before after split"><span>AFTER</span>';
  $('stage').append(splitRow);
  function comparison() {
    state.viewMode=before?4:0; state.compareSplit=split ? +splitRow.querySelector('input').value/100 : -1;
    $('compare').classList.toggle('on',before); $('splitView').classList.toggle('on',split); splitRow.hidden=!split;
    $('compareLabel').textContent=split?'BEFORE ← → AFTER':before?'BEFORE · ORIGINAL':'AFTER · RELIT';
    $('wrap').classList.toggle('comparing',before||split); render();
  }
  $('compare').onclick=()=>{if(state.exporting)return; before=!before;split=false;comparison();};
  $('splitView').onclick=()=>{if(state.exporting)return;split=!split;before=false;comparison();};
  splitRow.querySelector('input').oninput=comparison;
  $('showHandles').onclick=()=>{const off=$('wrap').classList.toggle('hideGuides'); $('showHandles').classList.toggle('on',!off);};
  $('views').addEventListener('click',()=>{before=false;split=false;state.compareSplit=-1;splitRow.hidden=true;$('wrap').classList.remove('comparing');$('compare').classList.remove('on');$('splitView').classList.remove('on');$('compareLabel').textContent='DIAGNOSTIC VIEW';render();});
  function setBrush(value){brush=value;$('wrap').classList.toggle('brushing',!!brush);for(const [id,v] of [['brushOff',''],['brushAdd','add'],['brushRemove','remove']])$(id).classList.toggle('on',value===v);}
  $('brushOff').onclick=()=>setBrush('');$('brushAdd').onclick=()=>setBrush('add');$('brushRemove').onclick=()=>setBrush('remove');
  $('clearMask').onclick=()=>{state.strokes=[];rebuildMask();};
  api.canvas.addEventListener('pointerdown',e=>{
    if(!brush||state.exporting||before||split||state.mode!=='single')return;
    e.preventDefault();api.canvas.setPointerCapture(e.pointerId);
    const r=api.canvas.getBoundingClientRect();
    const stroke={mode:brush,radius:+$('brushSize').value/r.width,aspect:r.height/r.width,points:[]};
    const add=ev=>{
      const p=[Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(ev.clientY-r.top)/r.height))];
      const prev=stroke.points.at(-1)||p;const n=Math.max(1,Math.ceil(Math.hypot(p[0]-prev[0],(p[1]-prev[1])*stroke.aspect)/(stroke.radius*0.25)));
      for(let i=1;i<=n;i++){const q=[prev[0]+(p[0]-prev[0])*i/n,prev[1]+(p[1]-prev[1])*i/n];stroke.points.push(q);stamp(q,brush,stroke.radius,stroke.aspect);}
      state.maskVersion++;render();
    };
    state.strokes.push(stroke);add(e);
    const end=()=>{api.canvas.removeEventListener('pointermove',add);api.canvas.removeEventListener('pointerup',end);api.canvas.removeEventListener('pointercancel',end);checkpoint();};
    api.canvas.addEventListener('pointermove',add);api.canvas.addEventListener('pointerup',end);api.canvas.addEventListener('pointercancel',end);
  });
  let dbPromise;
  function db(){ return dbPromise ||= new Promise((resolve,reject)=>{const r=indexedDB.open('digilight-projects',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
  async function storage(mode,action){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('projects',mode);const r=action(t.objectStore('projects'));t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Save aborted'));});}
  async function list(){const rows=await storage('readonly',s=>s.getAll());$('projectList').replaceChildren(new Option('Choose project…',''));for(const p of rows.sort((a,b)=>b.updated-a.updated))$('projectList').add(new Option(p.name,p.id));if(projectId)$('projectList').value=projectId;}
  function status(message){$('projectStatus').textContent=message;}
  async function project(){
    if(state.mode!=='single')throw new Error('Project saving currently supports single photographs. Export capture results as PNG.');
    const source=api.source();const c=document.createElement('canvas');c.width=source.naturalWidth||source.width;c.height=source.naturalHeight||source.height;c.getContext('2d').drawImage(source,0,0);
    const image=await new Promise((resolve,reject)=>c.toBlob(b=>{if(!b)return reject(new Error('Image too large to save.'));const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(b);},'image/png'));
    return {format:'digilight',version:1,id:projectId||crypto.randomUUID(),name:$('projectName').value.trim()||'Untitled painting',updated:Date.now(),image,settings:snapshot()};
  }
  async function busy(fn){if(loading||state.exporting)return;loading=true;try{await fn();}catch(e){status(e.message);}finally{loading=false;}}
  async function save(variation){await busy(async()=>{const p=await project();if(variation){p.id=crypto.randomUUID();p.name+=' — variation';}await storage('readwrite',s=>s.put(p));projectId=p.id;$('projectName').value=p.name;await list();status('Saved in this browser. Download project for a portable backup.');});}
  $('saveProject').onclick=()=>save(false);$('saveVariation').onclick=()=>save(true);
  function validate(p){
    if(p?.format!=='digilight'||p.version!==1||!/^data:image\/(png|jpeg|webp);base64,/.test(p.image||''))throw new Error('Not a supported DigiLight project.');
    if(!p.settings||!Array.isArray(p.settings.lights)||p.settings.lights.length<1||p.settings.lights.length>8)throw new Error('Invalid project lights.');
    const settings={};
    for(const k of keys)if(!['lights','strokes'].includes(k)){const v=p.settings[k];if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>10000)throw new Error('Invalid project settings.');settings[k]=v;}
    for(const [id,k] of Object.entries(baseMap)){const el=$(id);if(settings[k]<+el.min||settings[k]>+el.max)throw new Error(`Invalid ${k}.`);}
    for(const [k,,min,max] of newControls)if(settings[k]<min||settings[k]>max)throw new Error(`Invalid ${k}.`);
    settings.lights=p.settings.lights.map(l=>{const light={};for(const [k,min,max] of [['x',-0.4,1.4],['y',-0.4,1.4],['z',0.08,2.5],['power',0,8],['kelvin',1800,10000],['cone',0,1],['softness',0,1],['falloff',0,2],['aimX',-0.4,1.4],['aimY',-0.4,1.4]]){const v=l[k]??({softness:0.5,falloff:2,aimX:l.x,aimY:l.y}[k]);if(!Number.isFinite(v)||v<min||v>max)throw new Error('Invalid light values.');light[k]=v;}if(!/^#[0-9a-f]{6}$/i.test(l.hex))throw new Error('Invalid light colour.');light.hex=l.hex;light.useKelvin=!!l.useKelvin;light.enabled=!!l.enabled;applyColor(light);return light;});
    settings.selected=Math.max(0,Math.min(settings.lights.length-1,Math.trunc(settings.selected)));
    const strokes=p.settings.strokes||[];let points=0;if(!Array.isArray(strokes)||strokes.length>2000)throw new Error('Too many corrections.');
    settings.strokes=strokes.map(s=>{if(!['add','remove'].includes(s.mode)||!Number.isFinite(s.radius)||s.radius<=0||s.radius>10||!Number.isFinite(s.aspect)||s.aspect<=0||s.aspect>100||!Array.isArray(s.points))throw new Error('Invalid brush stroke.');points+=s.points.length;if(points>200000)throw new Error('Too many brush points.');return {mode:s.mode,radius:s.radius,aspect:s.aspect,points:s.points.map(q=>{if(!Array.isArray(q)||q.length!==2||q.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('Invalid brush point.');return q;})};});
    return settings;
  }
  async function open(p){const settings=validate(p);const im=new Image();await new Promise((res,rej)=>{im.onload=res;im.onerror=()=>rej(new Error('Project image could not be opened.'));im.src=p.image;});await api.openSource(im);Object.assign(state,settings);projectId=p.id||null;$('projectName').value=String(p.name||'Untitled painting').slice(0,120);before=false;split=false;comparison();sync();history.reset(snapshot());historyUI();status('Project opened.');}
  $('loadProject').onclick=()=>busy(async()=>{const p=await storage('readonly',s=>s.get($('projectList').value));if(!p)throw new Error('Choose a saved project.');await open(p);});
  $('downloadProject').onclick=()=>busy(async()=>{const p=await project();const blob=new Blob([JSON.stringify(p)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${p.name.replace(/[^a-z0-9_-]/gi,'_')}.digilight.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);status('Project downloaded.');});
  $('importProject').onclick=()=>$('projectFile').click();
  $('projectFile').onchange=()=>busy(async()=>{const f=$('projectFile').files[0];if(!f)return;if(f.size>150*1024*1024)throw new Error('Project exceeds the 150 MB import limit.');await open(JSON.parse(await f.text()));$('projectFile').value='';});
  list().catch(()=>status('Browser storage unavailable. Download project still works.'));
  const onSource=()=>{sourceRevision++;state.strokes=[];projectId=null;before=false;split=false;setBrush('');comparison();if(state.mode==='single'&&!loading)autoSetup();sync();history.reset(snapshot());historyUI();};
  document.addEventListener('digilight:source',onSource);
  rebuildMask();history.reset(snapshot());historyUI();
  window.__studio={snapshot,history,checkpoint,restore,autoSetup,validate,get sourceRevision(){return sourceRevision;}};
}
