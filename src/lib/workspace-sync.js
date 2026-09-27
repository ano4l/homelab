import { upgradeWorkspace, validateWorkspace } from './workspace.js';

export const COLLECTIONS = ['tasks','captures','projects','events','alerts','connections','background','directions','debtors'];
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const withoutStamp = record => Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'updatedAt'));
export class SyncConflict extends Error {
  constructor(path) { super(`Another device changed ${path}. Your edit is kept on this device. Review the conflict in Settings.`); this.name = 'SyncConflict'; }
}
export function mergeRecord(current, original, edited) {
  if (!current) throw new Error('This record was removed on another device. Reopen it before editing.');
  const next=structuredClone(current);
  for (const key of new Set([...Object.keys(original),...Object.keys(edited)])) {
    if (key==='updatedAt' || same(original[key],edited[key])) continue;
    if (!same(current[key],original[key]) && !same(current[key],edited[key])) throw new Error(`Another device changed ${key}. Your form is kept; reopen the record to review the latest version.`);
    if (edited[key]===undefined) delete next[key];else next[key]=structuredClone(edited[key]);
  }
  next.updatedAt=edited.updatedAt||new Date().toISOString();
  return next;
}
// Capture intent once. Replaying a UI callback could generate fresh IDs,
// toggle state twice, or reapply a payment after an ambiguous response.
export function makePatch(before, after) {
  validateWorkspace(after);
  const records = [];
  for (const group of COLLECTIONS) {
    const a = new Map(before[group].map(item => [item.id,item]));
    const b = new Map(after[group].map(item => [item.id,item]));
    for (const [id,record] of a) if (!b.has(id)) records.push({group,id,before:record,after:null});
    for (const [id,record] of b) if (!same(record,a.get(id))) records.push({group,id,before:a.get(id)||null,after:record});
  }
  const settings = {};
  for (const key of new Set([...Object.keys(before.settings),...Object.keys(after.settings)])) if (!same(before.settings[key],after.settings[key])) settings[key] = {before:before.settings[key],after:after.settings[key]};
  return {id:crypto.randomUUID(),records,settings,createdAt:new Date().toISOString()};
}
export function applyPatch(document, patch, force = false) {
  const next = structuredClone(document);
  for (const change of patch.records) {
    const {group,id,before,after} = change;
    const index = next[group].findIndex(item => item.id === id), current = next[group][index];
    if (!before) {
      if (!current) next[group].unshift(structuredClone(after));
      else if (!same(withoutStamp(current),withoutStamp(after)) && !force) throw new SyncConflict(`${group} / ${after.title||after.name||id}`);
      else if (force) next[group][index] = structuredClone(after);
    } else if (!after) {
      if (current && !same(withoutStamp(current),withoutStamp(before)) && !force) throw new SyncConflict(`${group} / ${before.title||before.name||id}`);
      if (current) next[group].splice(index,1);
    } else {
      if (!current) { if (!force) throw new SyncConflict(`${group} / deleted record`); next[group].push(structuredClone(after)); continue; }
      for (const key of new Set([...Object.keys(before),...Object.keys(after)])) {
        if (key === 'updatedAt' || same(before[key],after[key])) continue;
        if (!same(current[key],before[key]) && !same(current[key],after[key]) && !force) throw new SyncConflict(`${group} / ${current.title||current.name||id} / ${key}`);
        if (after[key] === undefined) delete current[key]; else current[key] = structuredClone(after[key]);
      }
      current.updatedAt = after.updatedAt || patch.createdAt;
    }
  }
  for (const [key,value] of Object.entries(patch.settings)) {
    if (!same(next.settings[key],value.before) && !same(next.settings[key],value.after) && !force) throw new SyncConflict(`settings / ${key}`);
    next.settings[key] = value.after;
  }
  next.updatedAt = patch.createdAt;
  return validateWorkspace(next);
}
export function mergeImport(current, incoming) {
  const next = structuredClone(current), imported = upgradeWorkspace(incoming);
  for (const group of COLLECTIONS) for (const record of imported[group]) {
    const existing = next[group].find(item => item.id === record.id);
    if (!existing) next[group].push(record);
    else if (!same(withoutStamp(existing),withoutStamp(record))) throw new Error(`Import contains a different ${group} record with the same ID. Edit it or use a separate ID before importing.`);
  }
  return validateWorkspace(next);
}
