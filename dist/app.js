import { indexFamily, layoutTree } from './graph.js';
import { validate, normalizeFamily } from '/validation.mjs';
import { addNewPersonRelation, connectExistingPerson, deriveConnections, removePartner, suggestOtherParent } from '/relationships.mjs';
const $ = (s) => document.querySelector(s);
const esc = (s='') => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sampleMode=false, graph=null, indexedFamily=null, page=0, currentLayout=null;
function ensureIndex(){if(indexedFamily!==family){graph=indexFamily(family);indexedFamily=family;}}
const PAGE_SIZE=48;
let family, selected=null, view='tree', editing=null, photo='', scale=1, offset={x:50,y:50}, history=[], busy=false, storageMode='browser', familyWarning='';
const initials = p => p.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
const avatar = p => `<span class="avatar">${p.photo ? `<img alt="" src="${esc(p.photo)}">` : esc(initials(p))}</span>`;
const parentRole = p => p?.sex==='female'?'Mother':p?.sex==='male'?'Father':'Parent';
const dates = p => p.born ? p.born.slice(0,4) : 'A story to discover';
function toast(message){ $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').hidden=true,4500); }
async function save(next){
  if(busy) return false; busy=true; $('#saveState').textContent='Saving…';
  try{
    next=normalizeFamily(next).value;validate(next);
    if(sampleMode||storageMode==='browser')localStorage.setItem(sampleMode?'kinfolk-ten-generation-sample':'kinfolk-family',JSON.stringify(next));
    else{const response=await fetch('/api/family',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});const result=await response.json();if(!response.ok)throw Error(result.error||'The family could not be saved.');}
    if(history.length>=10)history.shift();history.push(structuredClone(family));family=next;familyWarning='';render();$('#saveState').textContent=sampleMode?'Sample saved in browser':storageMode==='browser'?'Saved in this browser':'All changes saved';return true;
  }catch(e){$('#saveState').textContent='Not saved';if($('#editor').open)$('#formError').textContent=e.message;toast('Could not save this change. '+e.message);return false;}finally{busy=false;}
}
function connected(id){ensureIndex();return deriveConnections(graph,id);}
function filteredPeople(){const q=$('#search').value.toLowerCase().trim();return family.people.filter(p=>!q||p.name.toLowerCase().includes(q)||p.place?.toLowerCase().includes(q));}
function visiblePeople(){
  if(view==='people'){
    const matches=filteredPeople();page=Math.min(page,Math.max(0,Math.ceil(matches.length/PAGE_SIZE)-1));
    return matches.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  }
  // Keep the large fictional stress sample responsive; a real family tree is never silently truncated.
  return sampleMode?family.people.slice(0,120):family.people;
}
function layout(people){ensureIndex();return layoutTree(graph,people);}
function drawConnections(pos){
  const paths=[],groups=new Map(),partnerKeys=new Set();
  const key=ids=>[...ids].sort().join('|');
  const path=(d,type,ids)=>{const active=!selected||ids.includes(selected);paths.push('<path class="'+type+(selected?(active?' emphasized':' faded'):'')+'" d="'+d+'"/>');};
  for(const r of family.relationships.filter(r=>r.type==='partner'&&pos.has(r.from)&&pos.has(r.to))){
    const a=pos.get(r.from),b=pos.get(r.to);partnerKeys.add(key([r.from,r.to]));
    if(a.y===b.y){const left=a.x<b.x?a:b,right=a.x<b.x?b:a;path('M '+(left.x+174)+' '+(left.y+54)+' H '+right.x,'partner',[r.from,r.to]);}
    else path('M '+(a.x+174)+' '+(a.y+54)+' H '+(Math.max(a.x,b.x)+200)+' V '+(b.y+54)+' H '+(b.x+174),'partner',[r.from,r.to]);
  }
  for(const id of pos.keys()){const child=graph.people.get(id);const parents=(graph.parents.get(id)||[]).filter(r=>pos.has(r.from)).map(r=>r.from);if(!parents.length)continue;const k=key(parents)+'@'+pos.get(child.id).y;if(!groups.has(k))groups.set(k,{parents,children:[]});groups.get(k).children.push(child.id);}
  const routes=[...groups.values()].map(({parents,children})=>{
    const ps=parents.map(id=>pos.get(id)),cs=children.map(id=>pos.get(id));
    const paired=parents.length===2&&ps[0].y===ps[1].y&&partnerKeys.has(key(parents));
    const sx=paired?(Math.min(...ps.map(p=>p.x))+174+Math.max(...ps.map(p=>p.x)))/2:ps.reduce((n,p)=>n+p.x+87,0)/ps.length;
    const sy=paired?ps[0].y+54:Math.max(...ps.map(p=>p.y))+108;
    const xs=cs.map(p=>p.x+87),cy=Math.min(...cs.map(p=>p.y));
    return {parents,children,ps,cs,paired,sx,sy,xs,cy,start:Math.min(sx,...xs),end:Math.max(sx,...xs),ids:[...parents,...children]};
  }).sort((a,b)=>a.cy-b.cy||a.start-b.start);
  const occupied=[];
  for(const route of routes){
    let lane=0;
    while(occupied.some(other=>other.cy===route.cy&&other.lane===lane&&other.start<=route.end&&route.start<=other.end))lane++;
    route.lane=lane;occupied.push(route);
  }
  for(const {parents,children,ps,cs,paired,sx,sy,xs,cy,lane,ids} of routes){
    const bus=cy-30-lane*15;
    if(!paired&&parents.length>1){const py=Math.max(...ps.map(p=>p.y))+122;for(const p of ps)path('M '+(p.x+87)+' '+(p.y+108)+' V '+py+' H '+sx,'parent',ids);path('M '+sx+' '+py+' V '+bus,'parent',ids);}
    else path('M '+sx+' '+sy+' V '+bus,'parent',ids);
    path('M '+Math.min(sx,...xs)+' '+bus+' H '+Math.max(sx,...xs),'parent',ids);
    for(let i=0;i<cs.length;i++)path('M '+xs[i]+' '+bus+' V '+cs[i].y,'parent',[...parents,children[i]]);
  }
  return paths.join('');
}
function render(){
  ensureIndex();const listMode=view==='people';
  $('#familyLabel').textContent=family.name;
  $('#empty').hidden=family.people.length>0;$('#canvas').hidden=listMode;$('#directory').hidden=!listMode;$('#search').closest('label').hidden=!listMode;document.querySelector('.zoom').hidden=listMode;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#viewLabel').textContent=view==='tree'?'Family tree':'People';
  const people=visiblePeople();currentLayout=listMode?{pos:new Map(),width:174,height:108}:layout(people);const {pos}=currentLayout;const related=new Set(selected?connected(selected).map(r=>r.id):[]);
  const card=p=>`<button class="person-card ${p.id===selected?'selected':selected&&!related.has(p.id)?'muted':''}" data-person="${esc(p.id)}" ${!listMode?`style="left:${pos.get(p.id).x}px;top:${pos.get(p.id).y}px"`:''}>${avatar(p)}<strong>${esc(p.name)}</strong><small>${esc(dates(p))}${p.sex?' · '+(p.sex==='female'?'Female':'Male'):''}${p.generation?' · G'+p.generation:''}</small></button>`;
  $('#nodes').innerHTML=listMode?'':people.map(card).join('');$('#directory').innerHTML=listMode?(people.map(card).join('')||'<p>No matching people. Try another name.</p>'):'';
  $('#edges').innerHTML=listMode?'':drawConnections(pos);
  renderNavigation(listMode);
  $('#treeStats').textContent=sampleMode?`Example tree · ${people.length} shown${family.people.length>people.length?' of '+family.people.length:''}`:`${family.people.length} people · ${new Set(graph.levels.values()).size} generations`;
  document.querySelector('.legend').hidden=listMode;
  document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{selected=b.dataset.person;render();});transform();renderProfile();
}
function transform(){ $('#world').style.transform=`translate(${offset.x}px,${offset.y}px) scale(${scale})`;$('#zoomLevel').textContent=Math.round(scale*100)+'%'; }
function fit(){ if($('#canvas').hidden)return;const {width,height}=currentLayout||layout(visiblePeople());const box=$('#canvas').getBoundingClientRect();scale=Math.min(1.15,Math.max(.18,Math.min((box.width-70)/width,(box.height-85)/height)));offset={x:(box.width-width*scale)/2+22*scale,y:Math.max(35,(box.height-75-height*scale)/2)};transform(); }
function centerOnPerson(id){const point=currentLayout?.pos.get(id);if(!point)return;const box=$('#canvas').getBoundingClientRect();offset={x:box.width/2-(point.x+87)*scale,y:box.height/2-(point.y+54)*scale};transform();}
function renderProfile(){const p=graph.people.get(selected);$('#profile').hidden=!p;if(!p)return;
  const relations=connected(p.id);
  $('#profile').innerHTML=`<div class="profile-top">FAMILY MEMBER<button class="icon-btn" id="closeProfile" aria-label="Close profile">×</button></div><div class="profile-hero">${avatar(p)}<h2>${esc(p.name)}</h2><p>${esc(dates(p))}</p></div><div class="profile-actions"><button class="button" id="editBtn">Edit profile</button><button class="button" id="focusBtn">View in tree</button></div><div class="detail"><h3>About</h3><p>${p.place?'Location · '+esc(p.place)+'<br>':''}${p.born?'Born · '+esc(p.born):''}</p><p>${esc(p.notes||'A lifetime of stories, waiting to be added.')}</p></div><div class="detail"><h3>Family connections</h3>${relations.map(r=>{const other=graph.people.get(r.id);return `<div class="relative-row"><button class="relative" data-relative="${esc(other.id)}">${avatar(other)}<div><strong>${esc(other.name)}</strong><small>${esc(r.label)}</small></div><span>→</span></button>${r.kinds.includes('partner')?`<button class="unlink" data-remove-partner="${esc(other.id)}">Remove partner link</button>`:''}</div>`;}).join('')||'<p>No connections yet.</p>'}<div class="add-relative"><button class="button" data-add="Mother">＋ Mother</button><button class="button" data-add="Father">＋ Father</button><button class="button" data-add="partner">＋ Partner</button><button class="button" data-add="child">＋ Child</button></div><button class="text-button" id="linkBtn">Connect an existing person</button></div><button class="danger" id="deleteBtn">Delete person</button>`;
  $('#closeProfile').onclick=()=>{selected=null;render();};$('#editBtn').onclick=()=>openEditor(p);$('#focusBtn').hidden=view==='tree';$('#focusBtn').onclick=()=>{page=0;view='tree';$('#search').value='';render();requestAnimationFrame(()=>centerOnPerson(p.id));};
  document.querySelectorAll('[data-relative]').forEach(b=>b.onclick=()=>{selected=b.dataset.relative;render();});document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openEditor(null,p.id,b.dataset.add));
  document.querySelectorAll('[data-remove-partner]').forEach(button=>button.onclick=async()=>{const partnerId=button.dataset.removePartner;if(!confirm(`Remove the partner connection between ${p.name} and ${graph.people.get(partnerId).name}? Parent and child links will remain.`))return;if(await save(removePartner(family,p.id,partnerId)))toast('Partner connection removed. Parent and child links were kept.');});
  $('#deleteBtn').onclick=async()=>{if(!confirm(`Delete ${p.name} and their connections? Other family members will remain.`))return;const next=structuredClone(family);next.people=next.people.filter(x=>x.id!==p.id);next.relationships=next.relationships.filter(r=>r.from!==p.id&&r.to!==p.id);if(await save(next)){selected=null;render();fit();toast('Person deleted. Press Ctrl+Z to undo.');}};
  $('#linkBtn').onclick=()=>openLink(p);
}
function openLink(p){const others=family.people.filter(x=>x.id!==p.id);if(!others.length)return toast('Add another person first.');openEditor(null,p.id,'parent');$('#editorTitle').textContent='Connect an existing person';const form=$('#personForm');form.dataset.link='true';form.querySelector('[name=name]').required=false;form.querySelector('[name=name]').closest('label').hidden=true;form.querySelector('.form-row').hidden=true;for(const key of ['place','notes'])form.elements[key].closest('label').hidden=true;$('#photoInput').closest('label').hidden=true;form.elements.relative.innerHTML='<option value="">Choose a person</option>'+others.slice(0,30).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');form.elements.relative.closest('label').firstChild.textContent='Choose person';form.elements.relation.closest('label').firstChild.textContent=`Relationship to ${p.name}`;form.dataset.linkFrom=p.id;updateChildParents();}
function openEditor(p=null,relative='',relation='none'){
  editing=p?.id||null;photo=p?.photo||'';const f=$('#personForm');f.reset();$('#relativeSearch').value='';f.elements.coName.required=false;$('#childParents').hidden=true;delete f.dataset.link;delete f.dataset.linkFrom;
  f.querySelectorAll('label').forEach(l=>l.hidden=false);f.querySelector('.form-row').hidden=false;f.elements.name.required=true;f.elements.relative.closest('label').firstChild.textContent='Connect to';f.elements.relation.closest('label').firstChild.textContent='They are this person’s';
  $('#editorTitle').textContent=p?'Edit profile':relative?'Add a relative':'Add a person';$('#formError').textContent='';
  for(const key of ['name','born','place','notes','sex'])f.elements[key].value=p?.[key]||'';
  if(!p&&relation==='Mother')f.elements.sex.value='female';if(!p&&relation==='Father')f.elements.sex.value='male';
  f.elements.relative.innerHTML='<option value="">Choose a family member</option>'+family.people.filter((x,i)=>x.id!==p?.id&&(x.id===relative||i<30)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');f.elements.relative.value=relative;f.elements.relation.value=relation;$('#relationshipFields').hidden=!!p||!family.people.length;
  updateChildParents();$('#editor').showModal();f.elements.name.focus();
}
$('#personForm').onsubmit=async e=>{e.preventDefault();const f=e.target;let next,id;
  try{
    const relative=f.elements.relative.value,relation=f.elements.relation.value;
    if(f.dataset.link){if(!relative)throw Error('Choose a person to connect.');id=f.dataset.linkFrom;next=connectExistingPerson(family,{anchorId:id,personId:relative,relationship:relation});}
    else{
      id=editing||crypto.randomUUID();const p={id,photo};
      for(const key of ['name','born','place','notes'])p[key]=f.elements[key].value.trim();p.sex=f.elements.sex.value;
      if(!p.name)throw Error('Please enter a name.');
      const file=$('#photoInput').files[0];if(file){if(file.size>2e6)throw Error('Choose a photo smaller than 2 MB');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG, or WebP photo');p.photo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read photo'));reader.readAsDataURL(file);});}
      if(editing){next=structuredClone(family);next.people=next.people.map(person=>person.id===id?p:person);}
      else{
        if(relation!=='none'&&!relative)throw Error('Choose a family member to connect.');
        let otherParent=f.elements.coParent.value;
        if(relation==='child'){
          if(!otherParent)throw Error('Choose or confirm the child’s other parent.');
          if(otherParent==='new'){
            const name=f.elements.coName.value.trim();if(!name)throw Error('Enter the other parent’s name.');
            otherParent={kind:'new',person:{id:crypto.randomUUID(),name,sex:f.elements.coSex.value,born:'',place:'',notes:'',photo:''}};
          }
        }
        next=addNewPersonRelation(family,{person:p,relativeId:relative,relationship:relation,otherParent});
      }
    }
    if(await save(next)){$('#editor').close();selected=id;render();fit();toast(editing?'Profile updated':f.dataset.link?'Family connection saved':'Person and family connections saved');}
  }catch(error){$('#formError').textContent=error.message;}
};
for(const id of ['closeEditor','cancelEditor'])$('#'+id).onclick=()=>$('#editor').close();
for(const id of ['addBtn','firstBtn'])$('#'+id).onclick=()=>openEditor();
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;page=0;render();if(view==='tree')fit();});
let searchTimer;$('#search').oninput=()=>{page=0;clearTimeout(searchTimer);searchTimer=setTimeout(render,150);};
$('#zoomIn').onclick=()=>zoom(1.2);$('#zoomOut').onclick=()=>zoom(1/1.2);$('#fitBtn').onclick=fit;
function zoom(factor,x=$('#canvas').clientWidth/2,y=$('#canvas').clientHeight/2){const next=Math.max(.15,Math.min(2.5,scale*factor));offset={x:x-(x-offset.x)*next/scale,y:y-(y-offset.y)*next/scale};scale=next;transform();}
$('#canvas').addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey||e.metaKey){const r=$('#canvas').getBoundingClientRect();zoom(e.deltaY<0?1.08:1/1.08,e.clientX-r.left,e.clientY-r.top);return;}const dx=e.shiftKey?e.deltaY:e.deltaX,dy=e.shiftKey?0:e.deltaY;offset={x:offset.x-dx,y:offset.y-dy};transform();},{passive:false});
let drag=null;$('#canvas').onpointerdown=e=>{if(e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};$('#canvas').setPointerCapture(e.pointerId);};$('#canvas').onpointermove=e=>{if(!drag)return;offset={x:drag.ox+e.clientX-drag.x,y:drag.oy+e.clientY-drag.y};transform();};$('#canvas').onpointerup=()=>drag=null;$('#canvas').onpointercancel=()=>drag=null;
$('#canvas').onkeydown=e=>{const moves={ArrowLeft:[30,0],ArrowRight:[-30,0],ArrowUp:[0,30],ArrowDown:[0,-30]};if(moves[e.key]){e.preventDefault();offset.x+=moves[e.key][0];offset.y+=moves[e.key][1];transform();}};
$('#renameBtn').onclick=async()=>{const name=prompt('What would you like to call your family?',family.name);if(name?.trim())await save({...family,name:name.trim().slice(0,100)});};
$('#exportBtn').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(family,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='kinfolk-family.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Family backup exported');};
$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const imported=JSON.parse(await file.text());if(!confirm('Replace the current family with this backup? Export your current family first if you want to keep it.'))return;if(await save(imported)){selected=null;render();fit();toast('Family imported. Press Ctrl+Z to undo.');}}catch{toast('Could not read this backup. Choose a valid JSON family file.');}finally{e.target.value='';}};
document.addEventListener('keydown',async e=>{if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!['INPUT','TEXTAREA'].includes(e.target.tagName)&&!$('#editor').open){e.preventDefault();const previous=history.pop();if(previous){if(await save(previous)){history.pop();selected=null;render();fit();toast('Last change undone');}else history.push(previous);}}});
$('#demoBtn').onclick=async()=>{const people=[['1','Raman Kumar','1948-03-12','Chennai','male'],['2','Lakshmi Kumar','1952-06-08','Chennai','female'],['3','Arun Kumar','1975-08-23','Bengaluru','male'],['4','Meena Kumar','1978-02-14','Bengaluru','female'],['5','Priya Kumar','1980-10-05','Chennai','female'],['6','Aditya Kumar','2003-04-19','Bengaluru','male'],['7','Ananya Kumar','2007-09-02','Bengaluru','female']].map(([id,name,born,place,sex])=>({id,name,born,place,sex,notes:'Example person — edit this profile or replace the example with your own family.',photo:''}));const relationships=[['1','2','partner'],['1','3','parent'],['2','3','parent'],['1','5','parent'],['2','5','parent'],['3','4','partner'],['3','6','parent'],['4','6','parent'],['3','7','parent'],['4','7','parent']].map(([from,to,type])=>({from,to,type}));if(await save({name:'The Kumar family · Example',people,relationships})){fit();toast('Example family loaded. All profiles are editable.');}};
window.addEventListener('resize',fit);
try{let response;try{response=await fetch('/api/family');}catch{}if(response&&response.status>=400&&response.status!==404)throw Error('The family service returned '+response.status+'.');let needsMigration=false;if(response?.ok&&response.headers.get('content-type')?.includes('application/json')){const loaded=normalizeFamily(await response.json());if(Array.isArray(loaded.value.people)&&Array.isArray(loaded.value.relationships)){family=loaded.value;storageMode='server';needsMigration=loaded.changed;}}if(!family){const loaded=normalizeFamily(JSON.parse(localStorage.getItem('kinfolk-family'))||{name:'My family',people:[],relationships:[]});family=loaded.value;storageMode='browser';needsMigration=loaded.changed;if(needsMigration)localStorage.setItem('kinfolk-family',JSON.stringify(family));}if(needsMigration&&storageMode==='server'){const migrated=await fetch('/api/family',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(family)});if(!migrated.ok)throw Error('Could not save the family data migration.');}if(new URLSearchParams(location.search).has('sample'))loadSample();else{try{validate(family);}catch(error){familyWarning=error.message;$('#saveState').textContent='Review family connections';toast('Some saved relationships need manual review. '+familyWarning);}}render();requestAnimationFrame(fit);}catch(e){toast('Could not load the saved family. '+e.message);$('#saveState').textContent='Connection failed';}

$('#newFamilyBtn').onclick=async()=>{if(!confirm('Start a new empty family? Export your current family first to keep a backup.'))return;if(await save({name:'My family',people:[],relationships:[]})){selected=null;render();fit();toast('New family ready. Press Ctrl+Z to undo.');}};

function makeSample(){
 const result={name:'Ten generations · Fictional sample',people:[],relationships:[]};let serial=0;
 const male=['Raman','Arun','Karthik','Vijay','Aditya','Nikhil','Dev','Surya','Arjun','Ravi'];
 const female=['Lakshmi','Meena','Priya','Ananya','Kavya','Divya','Nila','Maya','Tara','Isha'];
 function person(g,sex){const n=serial++,names=sex==='male'?male:female;const p={id:'sample-'+n,name:names[n%10]+' Kumar '+String(n+1).padStart(4,'0'),born:String(1760+(g-1)*28)+'-04-12',sex,place:'Chennai',notes:'Fictional sample, generation '+g+'.',generation:g};result.people.push(p);return p;}
 let current=[person(1,'male')];
 for(let g=1;g<10;g++){const next=[];current.forEach((p,i)=>{const mate=person(g,p.sex==='male'?'female':'male');result.relationships.push({from:p.id,to:mate.id,type:'partner'});const count=i%3===0?3:2;for(let c=0;c<count;c++){const child=person(g+1,c%2===0?'male':'female');for(const parent of [p,mate])result.relationships.push({from:parent.id,to:child.id,type:'parent',role:parentRole(parent)});next.push(child);}});current=next;}
 return result;
}
function loadSample(){window.history.replaceState({},'',location.pathname+'?sample=10');sampleMode=true;try{const normalized=normalizeFamily(JSON.parse(localStorage.getItem('kinfolk-ten-generation-sample'))||makeSample());family=normalized.value;if(normalized.changed)localStorage.setItem('kinfolk-ten-generation-sample',JSON.stringify(family));}catch{family=makeSample();}selected=null;history=[];$('#sampleBtn').textContent='Return to my family';$('#saveState').textContent='Fictional sample · your family is safe';}
$('#sampleBtn').onclick=async()=>{if(sampleMode){if(storageMode==='server'){const response=await fetch('/api/family');if(!response.ok)throw Error('Could not reload the saved family.');family=normalizeFamily(await response.json()).value;}else family=normalizeFamily(JSON.parse(localStorage.getItem('kinfolk-family'))||{name:'My family',people:[],relationships:[]}).value;sampleMode=false;selected=null;history=[];$('#sampleBtn').textContent='10-generation sample';window.history.replaceState({},'',location.pathname);}else loadSample();render();fit();};

function renderNavigation(listMode){
 $('#pager').hidden=!listMode;
 if(listMode){const total=filteredPeople().length;$('#pageInfo').textContent=(total?page*PAGE_SIZE+1:0)+'–'+Math.min((page+1)*PAGE_SIZE,total)+' of '+total;$('#prevPage').disabled=page===0;$('#nextPage').disabled=(page+1)*PAGE_SIZE>=total;}
}
$('#prevPage').onclick=()=>{page=Math.max(0,page-1);render();};$('#nextPage').onclick=()=>{page++;render();};

function updateChildParents(){
 const f=$('#personForm'),show=!editing&&!f.dataset.link&&f.elements.relation.value==='child'&&!!f.elements.relative.value;
 $('#childParents').hidden=!show;if(!show)return;
 const parent=graph.people.get(f.elements.relative.value),mates=graph.partners.get(parent?.id)||[];
 const childIds=(graph.children.get(parent?.id)||[]).map(edge=>edge.to);
 const knownCoParents=family.relationships.filter(edge=>edge.type==='parent'&&childIds.includes(edge.to)&&edge.from!==parent?.id).map(edge=>edge.from);
 const candidates=[...new Set([...mates,...knownCoParents])];
 const suggestion=suggestOtherParent(family,parent.id);
 f.elements.coParent.innerHTML='<option value="">'+(candidates.length?'Choose or confirm the child’s other parent…':'Choose what to do…')+'</option>'+candidates.map(id=>'<option value="'+esc(id)+'">'+esc(graph.people.get(id).name)+(mates.includes(id)?' · partner':' · known co-parent')+'</option>').join('')+'<option value="new">＋ Add a new partner as parent</option><option value="unknown">Unknown / not recorded</option>';
 f.elements.coParent.value=suggestion.status==='automatic'?suggestion.personId:'';
 $('#newCoParent').hidden=true;f.elements.coName.required=false;
 $('#parentSummary').textContent=suggestion.status==='automatic'?'Their only partner, '+graph.people.get(suggestion.personId).name+', will be linked as the other parent.':candidates.length?'There are multiple partners or earlier co-parent links. Confirm the correct other parent before saving.':'No other parent is recorded. Add a partner or leave the other parent unknown.';
}
$('#personForm').elements.relation.onchange=updateChildParents;
$('#personForm').elements.relative.onchange=updateChildParents;
$('#personForm').elements.coParent.onchange=()=>{const f=$('#personForm');$('#newCoParent').hidden=f.elements.coParent.value!=='new';f.elements.coName.required=f.elements.coParent.value==='new';};

$('#relativeSearch').oninput=()=>{
 const f=$('#personForm'),q=$('#relativeSearch').value.toLowerCase().trim(),current=f.elements.relative.value;
 const matches=family.people.filter(p=>p.id!==(editing||f.dataset.linkFrom)&&p.name.toLowerCase().includes(q)).slice(0,30);
 const chosen=graph.people.get(current);if(chosen&&!matches.some(p=>p.id===current))matches.unshift(chosen);
 f.elements.relative.innerHTML='<option value="">Choose a person</option>'+matches.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');f.elements.relative.value=current;
};
const nameLabel=$('#personForm').elements.name.closest('label');
nameLabel.after($('#relationshipFields'));$('#relationshipFields').after($('#childParents'));
