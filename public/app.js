import { indexFamily, branchPeople } from './graph.js';
import { validate, normalizeFamily } from '/validation.mjs';
const $ = (s) => document.querySelector(s);
const esc = (s='') => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sampleMode=false, branchRoot=null, graph=null, indexedFamily=null, page=0, generationFilter=null, branchLimited=false, currentLayout=null;
function ensureIndex(){if(indexedFamily!==family){graph=indexFamily(family);indexedFamily=family;}}
const PAGE_SIZE=48;
let family, selected=null, view='tree', editing=null, photo='', scale=1, offset={x:50,y:50}, history=[], busy=false;
const initials = p => p.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
const avatar = p => `<span class="avatar">${p.photo ? `<img alt="" src="${esc(p.photo)}">` : esc(initials(p))}</span>`;
const parentRole = p => p?.sex==='female'?'Mother':p?.sex==='male'?'Father':'Parent';
const dates = p => p.born ? p.born.slice(0,4) : 'A story to discover';
function toast(message){ $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').hidden=true,4500); }
async function save(next){
  if(busy) return false; busy=true; $('#saveState').textContent='Saving…';
  try{next=normalizeFamily(next).value;validate(next);if(history.length>=10)history.shift();if(sampleMode){localStorage.setItem('kinfolk-ten-generation-sample',JSON.stringify(next));history.push(structuredClone(family));family=next;render();$('#saveState').textContent='Sample saved in browser';return true;}const r=await fetch('/api/family',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});const result=await r.json();if(!r.ok)throw Error(result.error);history.push(structuredClone(family));family=next;$('#saveState').textContent='All changes saved';render();return true;}
  catch(e){try{localStorage.setItem('kinfolk-family',JSON.stringify(next));history.push(structuredClone(family));family=next;$('#saveState').textContent='Saved in this browser';render();return true;}catch(storageError){$('#saveState').textContent='Not saved';if($('#editor').open)$('#formError').textContent='Browser storage is full. Export a backup and remove some photos.';toast('Could not save in this browser. '+storageError.message);return false;}}finally{busy=false;}
}
function connected(id){ensureIndex();return [
 ...(graph.parents.get(id)||[]).map(r=>({id:r.from,label:parentRole(graph.people.get(r.from))})),
 ...(graph.partners.get(id)||[]).map(id=>({id,label:'Partner'})),
 ...(graph.children.get(id)||[]).map(r=>({id:r.to,label:'Child'}))];}
function filteredPeople(){ensureIndex();const q=$('#search').value.toLowerCase().trim();return family.people.filter(p=>(generationFilter===null||graph.levels.get(p.id)===generationFilter)&&(!q||p.name.toLowerCase().includes(q)||p.place?.toLowerCase().includes(q)));}
function isOverview(){return view==='tree'&&$('#scope').value==='all'&&family.people.length>80&&!$('#search').value.trim();}
function visiblePeople(){ensureIndex();branchLimited=false;
 const q=$('#search').value.trim();
 if(view==='people'||q){const matches=filteredPeople();page=Math.min(page,Math.max(0,Math.ceil(matches.length/PAGE_SIZE)-1));return matches.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);}
 if(isOverview())return [];
 if($('#scope').value==='close'&&selected){const ids=new Set([selected,...connected(selected).map(r=>r.id)]);return [...ids].map(id=>graph.people.get(id)).filter(Boolean).slice(0,80);}
 if($('#scope').value==='branch'){
 const root=branchRoot&&graph.people.has(branchRoot)?branchRoot:family.people.find(p=>!graph.parents.has(p.id))?.id;
 const result=branchPeople(graph,root,Number($('#depth').value));branchLimited=result.limited;return result.people;
 }
 return family.people.slice(0,80);
}
function layout(people){
  ensureIndex();const levels=graph.levels;
  const rows=new Map();for(const p of people){const l=levels.get(p.id)||0;if(!rows.has(l))rows.set(l,[]);rows.get(l).push(p);}
  const rowGroups=[];
  for(const [level,row] of [...rows].sort((a,b)=>a[0]-b[0])){
    const used=new Set(),groups=[];
    for(const p of row){if(used.has(p.id))continue;const group=[p];used.add(p.id);
      const partners=graph.partners.get(p.id)||[];
      for(const id of partners){const partner=row.find(x=>x.id===id);if(partner&&!used.has(id)){group.push(partner);used.add(id);}}
      groups.push(group);
    }
    rowGroups.push(groups);
  }
  const groupWidth=g=>g.length*174+(g.length-1)*38;
  const widths=rowGroups.map(gs=>gs.reduce((n,g)=>n+groupWidth(g),0)+Math.max(0,gs.length-1)*72);
  const width=Math.max(174,...widths),pos=new Map();
  rowGroups.forEach((groups,index)=>{let x=(width-widths[index])/2;groups.forEach(group=>{group.forEach((p,i)=>pos.set(p.id,{x:x+i*212,y:index*190}));x+=groupWidth(group)+72;});});
  return {pos,width,height:Math.max(0,rowGroups.length-1)*190+108};
}
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
  let lane=0;
  for(const {parents,children} of groups.values()){
    const ps=parents.map(id=>pos.get(id)),cs=children.map(id=>pos.get(id));
    const paired=parents.length===2&&ps[0].y===ps[1].y&&partnerKeys.has(key(parents));
    const sx=paired?(Math.min(...ps.map(p=>p.x))+174+Math.max(...ps.map(p=>p.x)))/2:ps.reduce((n,p)=>n+p.x+87,0)/ps.length;
    const sy=paired?ps[0].y+54:Math.max(...ps.map(p=>p.y))+108;
    const cy=Math.min(...cs.map(p=>p.y)),bus=cy-32-(lane++%2)*8,ids=[...parents,...children];
    if(!paired&&parents.length>1){const py=Math.max(...ps.map(p=>p.y))+122;for(const p of ps)path('M '+(p.x+87)+' '+(p.y+108)+' V '+py+' H '+sx,'parent',ids);path('M '+sx+' '+py+' V '+bus,'parent',ids);}
    else path('M '+sx+' '+sy+' V '+bus,'parent',ids);
    const xs=cs.map(p=>p.x+87);path('M '+Math.min(sx,...xs)+' '+bus+' H '+Math.max(sx,...xs),'parent',ids);
    for(let i=0;i<cs.length;i++)path('M '+xs[i]+' '+bus+' V '+cs[i].y,'parent',[...parents,children[i]]);
  }
  return paths.join('');
}
function render(){
  ensureIndex();const overview=isOverview(),listMode=view==='people'||!!$('#search').value.trim();
  $('#familyLabel').textContent=family.name;$('#peopleCount').textContent=family.people.length;
  $('#empty').hidden=family.people.length>0;$('#canvas').hidden=listMode||overview;$('#directory').hidden=!listMode;$('#overview').hidden=!overview;$('#scope').hidden=view!=='tree';$('#depth').hidden=view!=='tree'||$('#scope').value!=='branch';$('#rootBtn').hidden=view!=='tree';document.querySelector('.zoom').hidden=listMode||overview;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#viewLabel').textContent=view==='tree'?'Family tree':'People';
  const people=visiblePeople();currentLayout=layout(people);const {pos}=currentLayout;const related=new Set(selected?connected(selected).map(r=>r.id):[]);
  const card=p=>`<button class="person-card ${p.id===selected?'selected':selected&&!related.has(p.id)?'muted':''}" data-person="${esc(p.id)}" ${!listMode?`style="left:${pos.get(p.id).x}px;top:${pos.get(p.id).y}px"`:''}>${avatar(p)}<strong>${esc(p.name)}</strong><small>${esc(dates(p))}${p.sex?' · '+(p.sex==='female'?'Female':'Male'):''}${p.generation?' · G'+p.generation:''}</small></button>`;
  $('#nodes').innerHTML=listMode?'':people.map(card).join('');$('#directory').innerHTML=listMode?(people.map(card).join('')||'<p>No matching people. Try another name.</p>'):'';
  $('#edges').innerHTML=listMode||overview?'':drawConnections(pos);
  renderNavigation(overview,listMode);
  $('#treeStats').textContent=`${people.length} shown / ${family.people.length} people${sampleMode?' · 10 generations · Fictional sample':''}`;
  if(overview)$('#treeStats').textContent='All '+family.people.length.toLocaleString()+' people included · choose a generation above';document.querySelector('.legend').hidden=overview||listMode;
  document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{selected=b.dataset.person;render();});transform();renderProfile();requestAnimationFrame(fit);
}
function transform(){ $('#world').style.transform=`translate(${offset.x}px,${offset.y}px) scale(${scale})`;$('#zoomLevel').textContent=Math.round(scale*100)+'%'; }
function fit(){ if($('#canvas').hidden)return;const {width,height}=currentLayout||layout(visiblePeople());const box=$('#canvas').getBoundingClientRect();scale=Math.min(1.15,Math.max(.18,Math.min((box.width-70)/width,(box.height-85)/height)));offset={x:(box.width-width*scale)/2+22*scale,y:Math.max(35,(box.height-75-height*scale)/2)};transform(); }
function renderProfile(){const p=graph.people.get(selected);$('#profile').hidden=!p;if(!p)return;
  $('#profile').innerHTML=`<div class="profile-top">FAMILY MEMBER<button class="icon-btn" id="closeProfile" aria-label="Close profile">×</button></div><div class="profile-hero">${avatar(p)}<h2>${esc(p.name)}</h2><p>${esc(dates(p))}</p></div><div class="profile-actions"><button class="button" id="editBtn">Edit profile</button><button class="button" id="focusBtn">Explore branch</button></div><div class="detail"><h3>About</h3><p>${p.place?'Location · '+esc(p.place)+'<br>':''}${p.born?'Born · '+esc(p.born):''}</p><p>${esc(p.notes||'A lifetime of stories, waiting to be added.')}</p></div><div class="detail"><h3>Family connections</h3>${connected(p.id).map(r=>{const other=graph.people.get(r.id);return `<button class="relative" data-relative="${esc(other.id)}">${avatar(other)}<div><strong>${esc(other.name)}</strong><small>${r.label}</small></div><span>→</span></button>`;}).join('')||'<p>No connections yet.</p>'}<div class="add-relative"><button class="button" data-add="Mother">＋ Mother</button><button class="button" data-add="Father">＋ Father</button><button class="button" data-add="partner">＋ Partner</button><button class="button" data-add="child">＋ Child</button></div><button class="text-button" id="linkBtn">Connect an existing person</button></div><button class="danger" id="deleteBtn">Delete person</button>`;
  $('#closeProfile').onclick=()=>{selected=null;render();};$('#editBtn').onclick=()=>openEditor(p);$('#focusBtn').onclick=()=>{branchRoot=p.id;$('#scope').value='branch';$('#search').value='';generationFilter=null;page=0;view='tree';selected=null;render();fit();};
  document.querySelectorAll('[data-relative]').forEach(b=>b.onclick=()=>{selected=b.dataset.relative;render();});document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openEditor(null,p.id,b.dataset.add));
  $('#deleteBtn').onclick=async()=>{if(!confirm(`Delete ${p.name} and their connections? Other family members will remain.`))return;const next=structuredClone(family);next.people=next.people.filter(x=>x.id!==p.id);next.relationships=next.relationships.filter(r=>r.from!==p.id&&r.to!==p.id);if(await save(next)){selected=null;render();toast('Person deleted. Press Ctrl+Z to undo.');}};
  $('#linkBtn').onclick=()=>openLink(p);
}
function openLink(p){const others=family.people.filter(x=>x.id!==p.id);if(!others.length)return toast('Add another person first.');openEditor(null,p.id,'parent');$('#editorTitle').textContent='Connect an existing person';const form=$('#personForm');form.dataset.link='true';form.querySelector('[name=name]').required=false;form.querySelector('[name=name]').closest('label').hidden=true;form.querySelector('.form-row').hidden=true;for(const key of ['place','notes'])form.elements[key].closest('label').hidden=true;$('#photoInput').closest('label').hidden=true;form.elements.relative.innerHTML='<option value="">Choose a person</option>'+others.slice(0,30).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');form.elements.relative.closest('label').firstChild.textContent='Choose person';form.elements.relation.closest('label').firstChild.textContent=`${p.name} is their`;form.dataset.linkFrom=p.id;updateChildParents();}
function openEditor(p=null,relative='',relation='none'){
  editing=p?.id||null;photo=p?.photo||'';const f=$('#personForm');f.reset();$('#relativeSearch').value='';f.elements.coName.required=false;$('#childParents').hidden=true;delete f.dataset.link;delete f.dataset.linkFrom;
  f.querySelectorAll('label').forEach(l=>l.hidden=false);f.querySelector('.form-row').hidden=false;f.elements.name.required=true;f.elements.relative.closest('label').firstChild.textContent='Connect to';f.elements.relation.closest('label').firstChild.textContent='They are this person’s';
  $('#editorTitle').textContent=p?'Edit profile':relative?'Add a relative':'Add a person';$('#formError').textContent='';
  for(const key of ['name','born','place','notes','sex'])f.elements[key].value=p?.[key]||'';
  if(!p&&relation==='Mother')f.elements.sex.value='female';if(!p&&relation==='Father')f.elements.sex.value='male';
  f.elements.relative.innerHTML='<option value="">Choose a family member</option>'+family.people.filter((x,i)=>x.id!==p?.id&&(x.id===relative||i<30)).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');f.elements.relative.value=relative;f.elements.relation.value=relation;$('#relationshipFields').hidden=!!p||!family.people.length;
  updateChildParents();$('#editor').showModal();f.elements.name.focus();
}
$('#personForm').onsubmit=async e=>{e.preventDefault();const f=e.target;const next=structuredClone(family);let id;
  try{
    if(f.dataset.link) id=f.dataset.linkFrom;else{ id=editing||crypto.randomUUID();const p={id,photo};for(const key of ['name','born','place','notes'])p[key]=f.elements[key].value.trim();p.sex=f.elements.sex.value;if(!p.name)throw Error('Please enter a name');const file=$('#photoInput').files[0];if(file){if(file.size>2e6)throw Error('Choose a photo smaller than 2 MB');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG, or WebP photo');p.photo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read photo'));reader.readAsDataURL(file);});}if(['Mother','Father'].includes(f.elements.relation.value))p.sex=f.elements.relation.value==='Mother'?'female':'male';if(editing)for(const r of next.relationships)if(r.type==='parent'&&r.from===id)r.role=parentRole(p);if(editing)next.people=next.people.map(x=>x.id===id?p:x);else next.people.push(p);}
    const relative=f.elements.relative.value,relation=f.elements.relation.value;if(!editing&&relation!=='none'){if(!relative)throw Error('Choose a person to connect to');next.relationships.push({from:relation==='child'?relative:id,to:relation==='child'?id:relative,type:relation==='partner'?'partner':'parent',role:relation==='child'?parentRole(next.people.find(p=>p.id===relative)):['Mother','Father'].includes(relation)?relation:'Parent'});}else if(f.dataset.link)throw Error('Choose a relationship');
    if(!editing&&relation==='child'){
      const choice=f.elements.coParent.value;
      if(!choice)throw Error('Choose the second parent, add a partner, or select Unknown / not recorded.');
      const primary=next.people.find(p=>p.id===relative);
      const firstEdge=next.relationships.find(r=>r.type==='parent'&&r.from===relative&&r.to===id);firstEdge.role=parentRole(primary);
      let secondId=choice;
      if(choice==='new'){
        const name=f.elements.coName.value.trim();if(!name)throw Error('Enter the new partner’s name.');
        secondId=crypto.randomUUID();const sex=f.elements.coSex.value;next.people.push({id:secondId,name,sex,born:'',place:'',notes:'',photo:''});
        next.relationships.push({from:relative,to:secondId,type:'partner'});
      }
      if(choice!=='unknown'){
        const second=next.people.find(p=>p.id===secondId);if(!second)throw Error('Choose an existing second parent.');
        next.relationships.push({from:secondId,to:id,type:'parent',role:parentRole(second)});
      }
    }
    if(await save(next)){$('#editor').close();selected=id;if(view==='tree'&&$('#scope').value==='branch')branchRoot=relative||id;render();fit();toast(editing?'Profile updated':'Person and family connections saved');}
  }catch(error){$('#formError').textContent=error.message;}
};
for(const id of ['closeEditor','cancelEditor'])$('#'+id).onclick=()=>$('#editor').close();
for(const id of ['addBtn','firstBtn'])$('#'+id).onclick=()=>openEditor();
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;page=0;generationFilter=null;render();if(view==='tree')fit();});
let searchTimer;$('#search').oninput=()=>{page=0;clearTimeout(searchTimer);searchTimer=setTimeout(render,150);};$('#scope').onchange=()=>{if($('#scope').value==='close'&&!selected){$('#scope').value='branch';toast('Select a person first to focus on their family.');}render();fit();};
$('#zoomIn').onclick=()=>zoom(1.2);$('#zoomOut').onclick=()=>zoom(1/1.2);$('#fitBtn').onclick=fit;
function zoom(factor,x=$('#canvas').clientWidth/2,y=$('#canvas').clientHeight/2){const next=Math.max(.15,Math.min(2.5,scale*factor));offset={x:x-(x-offset.x)*next/scale,y:y-(y-offset.y)*next/scale};scale=next;transform();}
$('#canvas').addEventListener('wheel',e=>{e.preventDefault();const r=$('#canvas').getBoundingClientRect();zoom(e.deltaY<0?1.08:1/1.08,e.clientX-r.left,e.clientY-r.top);},{passive:false});
let drag=null;$('#canvas').onpointerdown=e=>{if(e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};$('#canvas').setPointerCapture(e.pointerId);};$('#canvas').onpointermove=e=>{if(!drag)return;offset={x:drag.ox+e.clientX-drag.x,y:drag.oy+e.clientY-drag.y};transform();};$('#canvas').onpointerup=()=>drag=null;$('#canvas').onpointercancel=()=>drag=null;
$('#canvas').onkeydown=e=>{const moves={ArrowLeft:[30,0],ArrowRight:[-30,0],ArrowUp:[0,30],ArrowDown:[0,-30]};if(moves[e.key]){e.preventDefault();offset.x+=moves[e.key][0];offset.y+=moves[e.key][1];transform();}};
$('#renameBtn').onclick=async()=>{const name=prompt('What would you like to call your family?',family.name);if(name?.trim())await save({...family,name:name.trim().slice(0,100)});};
$('#exportBtn').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(family,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='kinfolk-family.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Family backup exported');};
$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const imported=JSON.parse(await file.text());if(!confirm('Replace the current family with this backup? Export your current family first if you want to keep it.'))return;if(await save(imported)){selected=null;render();fit();toast('Family imported. Press Ctrl+Z to undo.');}}catch{toast('Could not read this backup. Choose a valid JSON family file.');}finally{e.target.value='';}};
document.addEventListener('keydown',async e=>{if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!['INPUT','TEXTAREA'].includes(e.target.tagName)&&!$('#editor').open){e.preventDefault();const previous=history.pop();if(previous){if(await save(previous)){history.pop();selected=null;render();fit();toast('Last change undone');}else history.push(previous);}}});
$('#demoBtn').onclick=async()=>{const people=[['1','Raman Kumar','1948-03-12','Chennai','male'],['2','Lakshmi Kumar','1952-06-08','Chennai','female'],['3','Arun Kumar','1975-08-23','Bengaluru','male'],['4','Meena Kumar','1978-02-14','Bengaluru','female'],['5','Priya Kumar','1980-10-05','Chennai','female'],['6','Aditya Kumar','2003-04-19','Bengaluru','male'],['7','Ananya Kumar','2007-09-02','Bengaluru','female']].map(([id,name,born,place,sex])=>({id,name,born,place,sex,notes:'Example person — edit this profile or replace the example with your own family.',photo:''}));const relationships=[['1','2','partner'],['1','3','parent'],['2','3','parent'],['1','5','parent'],['2','5','parent'],['3','4','partner'],['3','6','parent'],['4','6','parent'],['3','7','parent'],['4','7','parent']].map(([from,to,type])=>({from,to,type}));if(await save({name:'The Kumar family · Example',people,relationships})){fit();toast('Example family loaded. All profiles are editable.');}};
window.addEventListener('resize',fit);
try{let response;try{response=await fetch('/api/family');}catch{}let needsMigration=false;if(response?.ok){const normalized=normalizeFamily(await response.json());family=normalized.value;needsMigration=normalized.changed;}else{const normalized=normalizeFamily(JSON.parse(localStorage.getItem('kinfolk-family'))||{name:'My family',people:[],relationships:[]});family=normalized.value;needsMigration=normalized.changed;if(needsMigration)localStorage.setItem('kinfolk-family',JSON.stringify(family));}if(needsMigration&&response?.ok)await fetch('/api/family',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(family)});if(new URLSearchParams(location.search).has('sample'))loadSample();render();requestAnimationFrame(fit);}catch(e){toast('Could not connect to the local server. Please reload.');$('#saveState').textContent='Connection failed';}

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
function loadSample(){window.history.replaceState({},'',location.pathname+'?sample=10');sampleMode=true;try{const normalized=normalizeFamily(JSON.parse(localStorage.getItem('kinfolk-ten-generation-sample'))||makeSample());family=normalized.value;if(normalized.changed)localStorage.setItem('kinfolk-ten-generation-sample',JSON.stringify(family));}catch{family=makeSample();}branchRoot=family.people[0].id;selected=null;history=[];$('#scope').value='branch';$('#depth').value='2';$('#sampleBtn').textContent='Return to my family';$('#saveState').textContent='Fictional sample · your family is safe';}
$('#sampleBtn').onclick=async()=>{if(sampleMode){let response;try{response=await fetch('/api/family');}catch{}family=normalizeFamily(response?.ok?await response.json():JSON.parse(localStorage.getItem('kinfolk-family'))||{name:'My family',people:[],relationships:[]}).value;sampleMode=false;branchRoot=null;selected=null;history=[];$('#scope').value='all';$('#sampleBtn').textContent='10-generation sample';window.history.replaceState({},'',location.pathname);}else loadSample();render();fit();};
$('#depth').onchange=()=>{render();fit();};
$('#rootBtn').onclick=()=>{branchRoot=null;selected=null;$('#scope').value='branch';render();fit();};

function renderNavigation(overview,listMode){
 $('#branchTrail').hidden=view!=='tree'||overview||listMode;
 const root=graph.people.get(branchRoot);
 $('#branchName').textContent=root?root.name+' · descendants':'Family roots';
 $('#branchHint').textContent=branchLimited?'Showing up to 80 people. Select a person and explore their branch.':'Select a person to explore their branch or add a relative.';
 if(overview){
 const groups=[...graph.generations].sort((a,b)=>a[0]-b[0]);
 $('#overview').innerHTML='<div class="overview-head"><div class="eyebrow">THE BIG PICTURE</div><h2>'+family.people.length.toLocaleString()+' people. '+groups.length+' generations.</h2><p>Choose a generation to find a person, then explore their branch.</p></div><div class="generation-grid">'+groups.map(([level,people])=>'<button class="generation-card" data-generation="'+level+'"><span>GENERATION '+(level+1)+'</span><strong>'+people.length.toLocaleString()+'</strong><small>people <span>Browse →</span></small><div class="generation-bar" style="width:'+Math.max(5,people.length/family.people.length*100)+'%"></div></button>').join('')+'</div>';
 document.querySelectorAll('[data-generation]').forEach(b=>b.onclick=()=>{generationFilter=Number(b.dataset.generation);view='people';page=0;selected=null;render();});
 }
 $('#pager').hidden=!listMode;
 if(listMode){const total=filteredPeople().length;$('#pageInfo').textContent=(generationFilter===null?'All people':'Generation '+(generationFilter+1))+' · '+(total?page*PAGE_SIZE+1:0)+'–'+Math.min((page+1)*PAGE_SIZE,total)+' of '+total;$('#prevPage').disabled=page===0;$('#nextPage').disabled=(page+1)*PAGE_SIZE>=total;}
}
$('#prevPage').onclick=()=>{page=Math.max(0,page-1);render();};$('#nextPage').onclick=()=>{page++;render();};
$('#allPeople').onclick=()=>{generationFilter=null;page=0;$('#search').value='';render();};
$('#upBranch').onclick=()=>{const parent=graph.parents.get(branchRoot)?.[0];branchRoot=parent?.from||null;selected=null;render();};

function updateChildParents(){
 const f=$('#personForm'),show=!editing&&f.elements.relation.value==='child'&&!!f.elements.relative.value;
 $('#childParents').hidden=!show;if(!show)return;
 const parent=graph.people.get(f.elements.relative.value),mates=graph.partners.get(parent?.id)||[];
 f.elements.coParent.innerHTML=(mates.length===1?'':'<option value="">'+(mates.length?'Choose the child’s other parent…':'Choose what to do…')+'</option>')+mates.map(id=>'<option value="'+esc(id)+'">'+esc(graph.people.get(id).name)+' · partner</option>').join('')+'<option value="new">＋ Add a new partner as parent</option><option value="unknown">Unknown / not recorded</option>';
 f.elements.coParent.value=mates.length===1?mates[0]:'';
 $('#newCoParent').hidden=true;f.elements.coName.required=false;
 $('#parentSummary').textContent=mates.length===1?'Their partner '+graph.people.get(mates[0]).name+' will be linked automatically as the other parent.':mates.length>1?'This person has multiple partners. Choose the one who is this child’s other parent.':'No partner is recorded for '+(parent?.name||'this person')+'. Add a partner or leave the other parent unrecorded.';
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
