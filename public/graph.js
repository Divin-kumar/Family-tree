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

export function layoutTree(index,people,config={}){
  const cardWidth=config.cardWidth??174,cardHeight=config.cardHeight??108;
  const cardStep=config.cardStep??212,familyGap=config.familyGap??96,rowStep=config.rowStep??222;
  const order=new Map(people.map((person,i)=>[person.id,i]));
  const rows=new Map();
  for(const person of people){
    const level=index.levels.get(person.id)??0;
    if(!rows.has(level))rows.set(level,[]);
    rows.get(level).push(person);
  }
  const positions=new Map();let width=cardWidth,height=cardHeight;
  for(const [level,row] of [...rows].sort((a,b)=>a[0]-b[0])){
    const buckets=new Map();
    for(const person of row){
      const parents=(index.parents.get(person.id)||[]).map(edge=>edge.from).filter(id=>positions.has(id)).sort();
      const mates=(index.partners.get(person.id)||[]).filter(id=>order.has(id)&&!(index.parents.get(id)||[]).length);
      const solePartner=mates.length===1&&(index.partners.get(mates[0])||[]).filter(id=>order.has(id)).length===1;
      const key=parents.length?parents.join('|'):solePartner?'root-couple:'+ [person.id,mates[0]].sort().join('|'):'root:'+person.id;
      if(!buckets.has(key))buckets.set(key,{parents,members:[]});
      buckets.get(key).members.push(person);
    }
    const groups=[...buckets.values()].map(group=>{
      group.members.sort((a,b)=>order.get(a.id)-order.get(b.id));
      const anchors=group.parents.map(id=>positions.get(id)).filter(Boolean);
      group.anchor=anchors.length?anchors.reduce((sum,p)=>sum+p.x+cardWidth/2,0)/anchors.length:null;
      group.firstOrder=Math.min(...group.members.map(person=>order.get(person.id)));
      group.width=cardWidth+Math.max(0,group.members.length-1)*cardStep;
      return group;
    }).sort((a,b)=>a.anchor===null?(b.anchor===null?a.firstOrder-b.firstOrder:1):b.anchor===null?-1:a.anchor-b.anchor||a.firstOrder-b.firstOrder);
    let cursor=0;
    for(const group of groups){
      const left=Math.max(cursor,group.anchor===null?cursor:group.anchor-group.width/2);
      group.members.forEach((person,i)=>positions.set(person.id,{x:left+i*cardStep,y:level*rowStep}));
      cursor=left+group.width+familyGap;
    }
    width=Math.max(width,cursor-familyGap);
    height=Math.max(height,level*rowStep+cardHeight);
  }
  return {pos:positions,width,height};
}
