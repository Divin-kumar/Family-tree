import test from 'node:test';
import assert from 'node:assert/strict';
import { indexFamily } from './public/graph.js';
import { validate } from './validation.mjs';
import {
  addNewPersonRelation,
  addParentToChild,
  addPartner,
  connectExistingPerson,
  createChild,
  deriveConnections,
  removePartner,
  suggestOtherParent,
} from './relationships.mjs';

const person = (id, sex = '') => ({ id, name: id, sex });
const couple = () => ({
  name: 'Family',
  people: [person('father', 'male'), person('mother', 'female')],
  relationships: [{ from: 'father', to: 'mother', type: 'partner' }],
});
const child = id => person(id, id.endsWith('daughter') ? 'female' : 'male');
const parentIds = (family, childId) => family.relationships
  .filter(edge => edge.type === 'parent' && edge.to === childId)
  .map(edge => edge.from).sort();
const relationIds = (family, personId) => deriveConnections(indexFamily(family), personId)
  .map(relation => relation.id);

test('a mother’s sole recorded partner is linked to first, second, and later children', () => {
  let family = createChild(couple(), { child: child('first'), parentId: 'mother' });
  family = createChild(family, { child: child('second'), parentId: 'mother' });
  family = createChild(family, { child: child('third'), parentId: 'father' });
  for (const id of ['first', 'second', 'third']) assert.deepEqual(parentIds(family, id), ['father', 'mother']);
  assert.ok(relationIds(family, 'father').includes('second'));
  assert.ok(relationIds(family, 'mother').includes('second'));
  assert.ok(deriveConnections(indexFamily(family), 'first').some(relation => relation.id === 'second' && relation.label === 'Sibling'));
});

test('adding a mother later creates the direct parent edge and preserves the father edge', () => {
  const family = { name: 'Family', people: [person('father', 'male'), person('mother', 'female'), child('child')], relationships: [{ from: 'father', to: 'child', type: 'parent', role: 'Father' }] };
  const updated = connectExistingPerson(family, { anchorId: 'child', personId: 'mother', relationship: 'Mother' });
  assert.deepEqual(parentIds(updated, 'child'), ['father', 'mother']);
  assert.equal(updated.relationships.some(edge => edge.type === 'partner'), false);
  assert.ok(relationIds(updated, 'father').includes('child'));
  assert.ok(relationIds(updated, 'mother').includes('child'));
});

test('adding a father later works from a mother or child profile without creating a partner-only link', () => {
  const family = { name: 'Family', people: [person('mother', 'female'), person('father', 'male'), child('child')], relationships: [{ from: 'mother', to: 'child', type: 'parent', role: 'Mother' }] };
  const updated = connectExistingPerson(family, { anchorId: 'child', personId: 'father', relationship: 'Father' });
  assert.deepEqual(parentIds(updated, 'child'), ['father', 'mother']);
  assert.ok(relationIds(updated, 'mother').includes('child'));
  assert.ok(relationIds(updated, 'father').includes('child'));
});

test('new parent connections are direct, while an explicitly selected partner link is separate', () => {
  const family = { name: 'Family', people: [person('father', 'male'), person('mother', 'female'), child('child')], relationships: [{ from: 'father', to: 'child', type: 'parent', role: 'Father' }] };
  const updated = addParentToChild(family, { parentId: 'mother', childId: 'child', partnerWith: 'father' });
  assert.deepEqual(parentIds(updated, 'child'), ['father', 'mother']);
  assert.ok(updated.relationships.some(edge => edge.type === 'partner' && [edge.from, edge.to].includes('mother') && [edge.from, edge.to].includes('father')));
});

test('repeating a relationship update is idempotent and does not duplicate edges', () => {
  let family = { name: 'Family', people: [person('father', 'male'), person('mother', 'female'), child('child')], relationships: [] };
  family = addParentToChild(family, { parentId: 'father', childId: 'child' });
  family = addParentToChild(family, { parentId: 'father', childId: 'child' });
  family = addPartner(family, 'father', 'mother');
  assert.equal(family.relationships.filter(edge => edge.type === 'parent' && edge.from === 'father' && edge.to === 'child').length, 1);
  assert.equal(family.relationships.filter(edge => edge.type === 'partner').length, 1);
  assert.ok(!family.relationships.some(edge => edge.type === 'partner' && [edge.from, edge.to].includes('father') && [edge.from, edge.to].includes('child')));
});

test('existing couples with several children keep all links and derive full siblings', () => {
  let family = couple();
  for (const id of ['one', 'two', 'three']) family = createChild(family, { child: child(id), parentId: id === 'two' ? 'father' : 'mother' });
  for (const id of ['one', 'two', 'three']) assert.deepEqual(parentIds(family, id), ['father', 'mother']);
  for (const id of ['one', 'two', 'three']) assert.equal(deriveConnections(indexFamily(family), id).find(relation => relation.id !== 'father' && relation.id !== 'mother')?.label, 'Sibling');
});

test('multiple partners and prior co-parents require an explicit choice', () => {
  let family = couple();
  family.people.push(person('former', 'male'));
  family = addPartner(family, 'mother', 'former');
  assert.equal(suggestOtherParent(family, 'mother').status, 'confirm');
  assert.throws(() => createChild(family, { child: child('ambiguous'), parentId: 'mother' }), /Choose the child’s other parent/);
  const chosen = createChild(family, { child: child('confirmed'), parentId: 'mother', otherParent: 'father' });
  assert.deepEqual(parentIds(chosen, 'confirmed'), ['father', 'mother']);

  let prior = createChild(couple(), { child: child('earlier'), parentId: 'mother' });
  prior.people.push(person('new-partner', 'male'));
  prior = addPartner(prior, 'mother', 'new-partner');
  assert.equal(suggestOtherParent(prior, 'mother').status, 'confirm');
});

test('stepchildren and stepparents are derived without adding false parent edges', () => {
  const family = {
    name: 'Blended family',
    people: [person('mother', 'female'), person('partner', 'male'), person('stepchild', 'female')],
    relationships: [
      { from: 'mother', to: 'partner', type: 'partner' },
      { from: 'partner', to: 'stepchild', type: 'parent', role: 'Father' },
    ],
  };
  assert.ok(deriveConnections(indexFamily(family), 'mother').some(relation => relation.id === 'stepchild' && relation.label === 'Stepchild'));
  assert.ok(deriveConnections(indexFamily(family), 'stepchild').some(relation => relation.id === 'mother' && relation.label === 'Stepparent'));
  assert.deepEqual(parentIds(family, 'stepchild'), ['partner']);
});

test('new partner and unknown-parent choices are atomic and valid', () => {
  const withNew = addNewPersonRelation(couple(), {
    person: child('new-child'), relativeId: 'mother', relationship: 'child',
    otherParent: { kind: 'new', person: { ...person('new-father', 'male'), name: 'New Father' } },
  });
  assert.deepEqual(parentIds(withNew, 'new-child'), ['mother', 'new-father']);
  assert.ok(withNew.relationships.some(edge => edge.type === 'partner' && [edge.from, edge.to].includes('mother') && [edge.from, edge.to].includes('new-father')));

  const unknown = createChild(couple(), { child: child('unknown-parent'), parentId: 'mother', otherParent: 'unknown' });
  assert.deepEqual(parentIds(unknown, 'unknown-parent'), ['mother']);
  assert.throws(() => createChild(couple(), { child: child('bad'), parentId: 'mother', otherParent: 'missing' }), /Choose a person/);
});

test('removing a partner edge preserves parent links and derived grandparents, grandchildren, and half-siblings', () => {
  let family = couple();
  family.people.push(person('grandfather', 'male'), person('grandmother', 'female'), person('step-parent', 'female'));
  family.relationships.push(
    { from: 'grandfather', to: 'father', type: 'parent', role: 'Father' },
    { from: 'grandmother', to: 'father', type: 'parent', role: 'Mother' },
  );
  family = createChild(family, { child: child('child-one'), parentId: 'mother' });
  family = createChild(family, { child: child('child-two'), parentId: 'father', otherParent: 'unknown' });
  family = addParentToChild(family, { parentId: 'step-parent', childId: 'child-two' });
  assert.ok(deriveConnections(indexFamily(family), 'child-one').some(relation => relation.id === 'child-two' && relation.label === 'Half-sibling'));
  assert.ok(relationIds(family, 'grandfather').includes('child-one'));
  assert.ok(relationIds(family, 'child-one').includes('grandfather'));
  const withoutPartner = removePartner(family, 'mother', 'father');
  assert.deepEqual(parentIds(withoutPartner, 'child-one'), ['father', 'mother']);
  assert.ok(!withoutPartner.relationships.some(edge => edge.type === 'partner' && [edge.from, edge.to].includes('mother') && [edge.from, edge.to].includes('father')));
  assert.ok(relationIds(withoutPartner, 'father').includes('child-one'));
  assert.ok(relationIds(withoutPartner, 'mother').includes('child-one'));
  const reloaded = JSON.parse(JSON.stringify(withoutPartner));
  validate(reloaded);
  assert.deepEqual(parentIds(reloaded, 'child-one'), ['father', 'mother']);
});

test('self-parenting and circular ancestry roll back without changing existing family data', () => {
  const family = { name: 'Family', people: [person('mother', 'female'), child('child')], relationships: [{ from: 'mother', to: 'child', type: 'parent', role: 'Mother' }] };
  const snapshot = JSON.stringify(family);
  assert.throws(() => addParentToChild(family, { parentId: 'child', childId: 'mother' }), /ancestor/);
  assert.equal(JSON.stringify(family), snapshot);
});
