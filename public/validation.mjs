export function validate(f) {
  if (!f || typeof f.name !== 'string' || !Array.isArray(f.people) || !Array.isArray(f.relationships)) throw Error('Invalid family file');
  const ids = new Set();
  for (const p of f.people) {
    if (!p.id || typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim()) throw Error('Each person needs a unique ID and a name');
    ids.add(p.id);
    if (p.sex !== undefined && !['', 'female', 'male'].includes(p.sex)) throw Error('Choose female or male, or leave gender unspecified');
    for (const key of ['born','place','notes','photo']) if (p[key] !== undefined && typeof p[key] !== 'string') throw Error('Invalid profile details');
    if (p.photo && !/^data:image\/(png|jpeg|webp);base64,/.test(p.photo)) throw Error('Photo must be a PNG, JPEG, or WebP image');
  }
  const edges = new Set(); const parents = new Map();
  for (const r of f.relationships) {
    if (r.role !== undefined && !['Parent', 'Mother', 'Father'].includes(r.role)) throw Error('Invalid relationship role');
    if (!ids.has(r.from) || !ids.has(r.to) || r.from === r.to || !['parent','partner'].includes(r.type)) throw Error('Invalid relationship');
    const key = r.type + ':' + (r.type === 'partner' ? [r.from,r.to].sort().join(':') : `${r.from}:${r.to}`);
    if (edges.has(key)) throw Error('This relationship already exists'); edges.add(key);
    if (r.type === 'parent') parents.set(r.from, [...(parents.get(r.from)||[]), r.to]);
  }
  const done = new Set(), visiting = new Set();
  function visit(id) { if (visiting.has(id)) throw Error('A person cannot be their own ancestor'); if (done.has(id)) return; visiting.add(id); for (const child of parents.get(id)||[]) visit(child); visiting.delete(id); done.add(id); }
  ids.forEach(visit);
  const people = new Map(f.people.map(p=>[p.id,p]));
  for (const r of f.relationships) if(r.type==='parent') {
    const parent=people.get(r.from),child=people.get(r.to);
    const expected=parent.sex==='female'?'Mother':parent.sex==='male'?'Father':'Parent';
    if(r.role!==undefined&&r.role!==expected)throw Error('A parent label must match the person’s gender');
    if(parent.born && child.born && parent.born>=child.born) throw Error('A parent must be born before their child. Check the birth dates.');
  }
  const ancestors=(from,to)=>{const todo=[from],seen=new Set();for(let i=0;i<todo.length;i++){const id=todo[i];if(id===to)return true;if(seen.has(id))continue;seen.add(id);todo.push(...(parents.get(id)||[]));}return false;};
  for(const r of f.relationships)if(r.type==='partner'&&(ancestors(r.from,r.to)||ancestors(r.to,r.from)))throw Error('A person cannot be both a partner and an ancestor of the same person.');
}

export function normalizeFamily(input) {
  const value=structuredClone(input);let changed=false;
  for(const p of value.people||[]) {
    if(!p.sex&&['Mother','Father'].includes(p.parentRole)){p.sex=p.parentRole==='Mother'?'female':'male';changed=true;}
    if('died'in p){delete p.died;changed=true;}
    if('parentRole'in p){delete p.parentRole;changed=true;}
  }
  const people=new Map((value.people||[]).map(p=>[p.id,p]));
  const seen=new Set();
  value.relationships=(value.relationships||[]).filter(r=>{
    const key=r.type==='partner'?`partner:${[r.from,r.to].sort().join(':')}`:`${r.type}:${r.from}:${r.to}`;
    if(seen.has(key)){changed=true;return false;}seen.add(key);return true;
  });
  for(const r of value.relationships||[])if(r.type==='parent'){
    const p=people.get(r.from),role=p?.sex==='female'?'Mother':p?.sex==='male'?'Father':'Parent';
    if(r.role!==role){r.role=role;changed=true;}
  }
  return {value,changed};
}
