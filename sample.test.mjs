import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from './validation.mjs';
test('ten-generation sample has valid mother/father pairs and two or three children per family',()=>{
 const f=JSON.parse(readFileSync(new URL('./sample-10-generations.json',import.meta.url)));
 validate(f);
 assert.equal(new Set(f.people.map(p=>p.generation)).size,10);
 const children=new Map(),parents=new Map();
 for(const r of f.relationships.filter(r=>r.type==='parent')){
  children.set(r.from,[...(children.get(r.from)||[]),r.to]);
  parents.set(r.to,[...(parents.get(r.to)||[]),r.role]);
 }
 for(const p of f.people){if(p.generation<10)assert.ok([2,3].includes(children.get(p.id)?.length));else assert.equal(children.has(p.id),false);}
 for(const roles of parents.values())assert.deepEqual(roles.sort(),['Father','Mother']);
});
