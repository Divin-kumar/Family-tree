export function indexFamily(family) {
  const people = new Map(family.people.map(p => [p.id,p]));
  const parents = new Map(), children = new Map(), partners = new Map(), levels = new Map();
  const add=(map,key,value)=>map.set(key,[...(map.get(key)||[]),value]);
  for(const r of family.relationships){
    if(r.type==='parent'){add(parents,r.to,r);add(children,r.from,r);}
    else {add(partners,r.from,r.to);add(partners,r.to,r.from);}
  }
  const pending=new Map(family.people.map(p=>[p.id,(parents.get(p.id)||[]).length]));
  const queue=family.people.filter(p=>!pending.get(p.id)).map(p=>p.id);
  queue.forEach(id=>levels.set(id,0));
  for(let i=0;i<queue.length;i++)for(const r of children.get(queue[i])||[]){
    levels.set(r.to,Math.max(levels.get(r.to)||0,(levels.get(r.from)||0)+1));
    pending.set(r.to,pending.get(r.to)-1);if(!pending.get(r.to))queue.push(r.to);
  }
  for(const [id,mates] of partners)if(!parents.has(id))levels.set(id,Math.max(levels.get(id)||0,...mates.map(m=>levels.get(m)||0)));
  const generations=new Map();
  for(const p of family.people)add(generations,levels.get(p.id)||0,p);
  return {people,parents,children,partners,levels,generations};
}

export function branchPeople(index,root,depth,limit=80){
  const ids=new Set(),seen=new Set();let frontier=[root];
  for(let level=0;level<depth;level++){
    const next=[];
    for(const id of frontier){
      if(!index.people.has(id)||seen.has(id))continue;seen.add(id);
      if(ids.size>=limit)return {people:[...ids].map(id=>index.people.get(id)),limited:true};
      ids.add(id);
      if(level<depth-1)for(const mate of index.partners.get(id)||[]){if(ids.size<limit)ids.add(mate);}
      for(const r of index.children.get(id)||[])next.push(r.to);
    }
    frontier=[...new Set(next)];
  }
  return {people:[...ids].map(id=>index.people.get(id)),limited:ids.size>=limit};
}
