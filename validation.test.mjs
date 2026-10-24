import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './validation.mjs';
const base=()=>({name:'Family',people:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}],relationships:[]});
test('allows shared parents and multiple partners',()=>{const f=base();f.relationships=[{from:'a',to:'c',type:'parent'},{from:'b',to:'c',type:'parent'},{from:'a',to:'b',type:'partner'}];assert.doesNotThrow(()=>validate(f));});
test('rejects ancestor cycles',()=>{const f=base();f.relationships=[{from:'a',to:'b',type:'parent'},{from:'b',to:'c',type:'parent'},{from:'c',to:'a',type:'parent'}];assert.throws(()=>validate(f),/ancestor/);});
test('rejects missing people and duplicate partners',()=>{const f=base();f.relationships=[{from:'a',to:'missing',type:'parent'}];assert.throws(()=>validate(f),/Invalid relationship/);f.relationships=[{from:'a',to:'b',type:'partner'},{from:'b',to:'a',type:'partner'}];assert.throws(()=>validate(f),/already exists/);});
test('rejects unsafe photo URLs, invalid gender, and impossible parent dates',()=>{const f=base();f.people[0].photo='javascript:alert(1)';assert.throws(()=>validate(f),/Photo/);delete f.people[0].photo;f.people[0].sex='other';assert.throws(()=>validate(f),/gender/);f.people[0].sex='male';f.people[0].born='2020-01-01';f.people[1].born='2010-01-01';f.relationships=[{from:'a',to:'b',type:'parent',role:'Father'}];assert.throws(()=>validate(f),/born before/);});
