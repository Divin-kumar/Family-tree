import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {indexFamily,branchPeople} from './public/graph.js';
import {validate} from './validation.mjs';
const sample=JSON.parse(readFileSync(new URL('./sample-10-generations.json',import.meta.url)));
test('large-family index and bounded branches preserve all generations',()=>{
 const graph=indexFamily(sample);
 assert.equal(graph.people.size,6992);
 assert.equal(graph.generations.size,10);
 assert.equal(branchPeople(graph,sample.people[0].id,2).people.length,5);
 const wide=branchPeople(graph,sample.people[0].id,10);
 assert.ok(wide.people.length<=80);assert.equal(wide.limited,true);
});
test('rejects invalid chronology and ancestor partnerships',()=>{
 const f={name:'Family',people:[{id:'a',name:'A',born:'2000-01-01'},{id:'b',name:'B',born:'1990-01-01'}],relationships:[{from:'a',to:'b',type:'parent'}]};
 assert.throws(()=>validate(f),/born before/);
 f.people[0].born='1960-01-01';f.relationships.push({from:'a',to:'b',type:'partner'});
 assert.throws(()=>validate(f),/partner and an ancestor/);
});
