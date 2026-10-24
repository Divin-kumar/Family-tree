import { normalizeFamily, validate } from './validation.mjs';

const parentRole = person => person?.sex === 'female' ? 'Mother' : person?.sex === 'male' ? 'Father' : 'Parent';
const partnerKey = (a, b) => [a, b].sort().join('\u0000');

function commitChange(family, change) {
  const next = structuredClone(family);
  change(next);
  const normalized = normalizeFamily(next).value;
  validate(normalized);
  return normalized;
}

function personMap(family) {
  return new Map(family.people.map(person => [person.id, person]));
}

function requirePerson(people, id) {
  const person = people.get(id);
  if (!person) throw Error('Choose a person who is in this family.');
  return person;
}

function addParentEdge(family, parentId, childId) {
  if (!family.relationships.some(edge => edge.type === 'parent' && edge.from === parentId && edge.to === childId)) {
    family.relationships.push({ from: parentId, to: childId, type: 'parent', role: parentRole(family.people.find(person => person.id === parentId)) });
  }
}

function addPartnerEdge(family, firstId, secondId) {
  const key = partnerKey(firstId, secondId);
  if (!family.relationships.some(edge => edge.type === 'partner' && partnerKey(edge.from, edge.to) === key)) {
    family.relationships.push({ from: firstId, to: secondId, type: 'partner' });
  }
}

export function suggestOtherParent(family, parentId) {
  const people = personMap(family);
  requirePerson(people, parentId);
  const partners = family.relationships
    .filter(edge => edge.type === 'partner' && (edge.from === parentId || edge.to === parentId))
    .map(edge => edge.from === parentId ? edge.to : edge.from);
  if (partners.length !== 1) return { status: partners.length ? 'confirm' : 'none', personId: null, partnerIds: partners };

  const candidate = partners[0];
  const children = family.relationships.filter(edge => edge.type === 'parent' && edge.from === parentId).map(edge => edge.to);
  const otherParentIds = new Set(family.relationships
    .filter(edge => edge.type === 'parent' && children.includes(edge.to) && edge.from !== parentId)
    .map(edge => edge.from));
  if ([...otherParentIds].some(id => id !== candidate)) {
    return { status: 'confirm', personId: null, partnerIds: partners };
  }
  return { status: 'automatic', personId: candidate, partnerIds: partners };
}

export function createChild(family, { child, parentId, otherParent = 'auto' }) {
  if (!child || typeof child.id !== 'string' || !child.id || typeof child.name !== 'string' || !child.name.trim()) {
    throw Error('A child needs a unique ID and a name.');
  }
  return commitChange(family, next => {
    const people = personMap(next);
    requirePerson(people, parentId);
    if (people.has(child.id)) throw Error('This person is already in the family.');
    next.people.push(structuredClone(child));

    let secondParentId = otherParent;
    if (otherParent === 'auto') {
      const suggestion = suggestOtherParent(next, parentId);
      if (suggestion.status !== 'automatic') throw Error('Choose the child’s other parent to confirm this family relationship.');
      secondParentId = suggestion.personId;
    } else if (otherParent?.kind === 'new') {
      const partner = otherParent.person;
      if (!partner || !partner.id || !partner.name?.trim() || people.has(partner.id)) throw Error('Enter a unique name for the other parent.');
      next.people.push(structuredClone(partner));
      addPartnerEdge(next, parentId, partner.id);
      secondParentId = partner.id;
    } else if (otherParent && otherParent !== 'unknown') {
      requirePerson(people, otherParent);
    }

    addParentEdge(next, parentId, child.id);
    if (secondParentId && secondParentId !== 'unknown') addParentEdge(next, secondParentId, child.id);
  });
}

export function addParentToChild(family, { parentId, childId, partnerWith = null }) {
  return commitChange(family, next => {
    const people = personMap(next);
    const parent = requirePerson(people, parentId);
    requirePerson(people, childId);
    if (parentId === childId) throw Error('A person cannot be their own parent.');
    addParentEdge(next, parentId, childId);
    if (partnerWith) {
      requirePerson(people, partnerWith);
      if (partnerWith === parentId || !next.relationships.some(edge => edge.type === 'parent' && edge.from === partnerWith && edge.to === childId)) {
        throw Error('A partner link can only be added to another recorded parent of this child.');
      }
      addPartnerEdge(next, parentId, partnerWith);
    }
  });
}

export function addPartner(family, firstId, secondId) {
  return commitChange(family, next => {
    const people = personMap(next);
    requirePerson(people, firstId);
    requirePerson(people, secondId);
    if (firstId === secondId) throw Error('A person cannot be their own partner.');
    addPartnerEdge(next, firstId, secondId);
  });
}

export function removePartner(family, firstId, secondId) {
  return commitChange(family, next => {
    const key = partnerKey(firstId, secondId);
    next.relationships = next.relationships.filter(edge => edge.type !== 'partner' || partnerKey(edge.from, edge.to) !== key);
  });
}

// relationship describes the selected existing person's relationship to anchorId.
export function connectExistingPerson(family, { anchorId, personId, relationship }) {
  const people = personMap(family);
  requirePerson(people, anchorId);
  const person = requirePerson(people, personId);
  if (anchorId === personId) throw Error('A person cannot be connected to themselves.');
  if (relationship === 'partner') return addPartner(family, anchorId, personId);
  if (relationship === 'child') return addParentToChild(family, { parentId: anchorId, childId: personId });
  if (!['parent', 'Mother', 'Father'].includes(relationship)) throw Error('Choose a valid family relationship.');
  if (relationship === 'Mother' && person.sex !== 'female') throw Error('Choose a person marked female to add them as Mother.');
  if (relationship === 'Father' && person.sex !== 'male') throw Error('Choose a person marked male to add them as Father.');
  return addParentToChild(family, { parentId: personId, childId: anchorId });
}

export function addNewPersonRelation(family, { person, relativeId, relationship, otherParent = 'auto' }) {
  if (!person || typeof person.id !== 'string' || !person.id || typeof person.name !== 'string' || !person.name.trim()) {
    throw Error('Enter a name for this person.');
  }
  const normalizedPerson = structuredClone(person);
  if (relationship === 'Mother') normalizedPerson.sex = 'female';
  if (relationship === 'Father') normalizedPerson.sex = 'male';

  if (relationship === 'none') {
    return commitChange(family, next => {
      if (next.people.some(existing => existing.id === normalizedPerson.id)) throw Error('This person is already in the family.');
      next.people.push(normalizedPerson);
    });
  }
  if (relationship === 'child') return createChild(family, { child: normalizedPerson, parentId: relativeId, otherParent });
  return commitChange(family, next => {
    const people = personMap(next);
    const relative = requirePerson(people, relativeId);
    if (people.has(normalizedPerson.id)) throw Error('This person is already in the family.');
    next.people.push(normalizedPerson);
    if (relationship === 'partner') addPartnerEdge(next, normalizedPerson.id, relativeId);
    else if (['parent', 'Mother', 'Father'].includes(relationship)) addParentEdge(next, normalizedPerson.id, relativeId);
    else if (relationship !== 'none') throw Error('Choose a valid family relationship.');
  });
}

export function deriveConnections(index, personId) {
  const person = index.people.get(personId);
  if (!person) return [];
  const results = new Map();
  const add = (id, label, kind) => {
    if (id === personId || !index.people.has(id)) return;
    const entry = results.get(id) || { id, labels: [], kinds: new Set() };
    if (!entry.labels.includes(label)) entry.labels.push(label);
    entry.kinds.add(kind);
    results.set(id, entry);
  };
  const parents = index.parents.get(personId) || [];
  const parentIds = parents.map(edge => edge.from);
  for (const parentId of parentIds) add(parentId, parentRole(index.people.get(parentId)), 'parent');
  for (const partnerId of index.partners.get(personId) || []) add(partnerId, 'Partner', 'partner');
  for (const edge of index.children.get(personId) || []) add(edge.to, 'Child', 'child');

  const ownParentSet = new Set(parentIds);
  const sharedParents = new Map();
  for (const parentId of parentIds) {
    for (const edge of index.children.get(parentId) || []) {
      if (edge.to === personId) continue;
      const set = sharedParents.get(edge.to) || new Set();
      set.add(parentId);
      sharedParents.set(edge.to, set);
    }
  }
  for (const [siblingId, shared] of sharedParents) {
    const siblingParents = new Set((index.parents.get(siblingId) || []).map(edge => edge.from));
    const full = ownParentSet.size > 0 && ownParentSet.size === siblingParents.size && [...ownParentSet].every(id => siblingParents.has(id));
    add(siblingId, full ? 'Sibling' : 'Half-sibling', 'sibling');
  }

  const grandparents = new Set();
  for (const parentId of parentIds) for (const edge of index.parents.get(parentId) || []) grandparents.add(edge.from);
  for (const grandparentId of grandparents) {
    const sex = index.people.get(grandparentId)?.sex;
    add(grandparentId, sex === 'female' ? 'Grandmother' : sex === 'male' ? 'Grandfather' : 'Grandparent', 'grandparent');
  }
  const partnerIds = index.partners.get(personId) || [];
  for (const partnerId of partnerIds) {
    for (const edge of index.children.get(partnerId) || []) {
      if (!(index.children.get(personId) || []).some(ownEdge => ownEdge.to === edge.to)) add(edge.to, 'Stepchild', 'stepchild');
    }
  }
  for (const parentId of parentIds) for (const parentPartner of index.partners.get(parentId) || []) {
    if (!ownParentSet.has(parentPartner)) add(parentPartner, 'Stepparent', 'stepparent');
  }
  for (const childEdge of index.children.get(personId) || []) {
    const childId = childEdge.to;
    for (const grandchildEdge of index.children.get(childId) || []) add(grandchildEdge.to, 'Grandchild', 'grandchild');
  }
  return [...results.values()].map(entry => ({ id: entry.id, label: entry.labels.join(' · '), kinds: [...entry.kinds] }));
}
