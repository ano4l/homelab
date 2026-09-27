import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, upgradeWorkspace, validateWorkspace, debtorTotals } from '../src/lib/workspace.js';
import { makePatch, applyPatch, mergeImport, mergeRecord, SyncConflict } from '../src/lib/workspace-sync.js';
const project={id:'project',name:'Example',milestones:[],nextAction:'First',checkpoint:'Initial'};
const base=()=>({...emptyWorkspace(),projects:[structuredClone(project)]});
test('a stale editor preserves unseen fields and refuses to overwrite a conflicting field',()=>{
  const original={name:'Original',checkpoint:'Initial'},current={name:'Remote name',checkpoint:'Initial'},edited={name:'Original',checkpoint:'Local checkpoint'};
  assert.equal(mergeRecord(current,original,edited).name,'Remote name');
  assert.equal(mergeRecord(current,original,edited).checkpoint,'Local checkpoint');
  assert.throws(()=>mergeRecord(current,original,{...edited,name:'Local name'}),/Another device changed name/);
});

test('separate device additions both survive',()=>{
  const initial=base(),a=structuredClone(initial),b=structuredClone(initial);
  a.captures.push({id:'a',text:'First device',kind:'thought'});b.captures.push({id:'b',text:'Second device',kind:'thought'});
  const merged=applyPatch(applyPatch(initial,makePatch(initial,a)),makePatch(initial,b));
  assert.deepEqual(new Set(merged.captures.map(x=>x.id)),new Set(['a','b']));
});
test('different fields on a shared project merge; conflicting fields require review',()=>{
  const initial=base(),a=structuredClone(initial),b=structuredClone(initial);
  a.projects[0].nextAction='Device one';b.projects[0].checkpoint='Device two';
  const cloud=applyPatch(initial,makePatch(initial,a));
  assert.equal(applyPatch(cloud,makePatch(initial,b)).projects[0].nextAction,'Device one');
  b.projects[0].nextAction='Conflicting edit';
  assert.throws(()=>applyPatch(cloud,makePatch(initial,b)),SyncConflict);
  assert.equal(applyPatch(cloud,makePatch(initial,b),true).projects[0].nextAction,'Conflicting edit');
});
test('ambiguous response retries do not duplicate an addition or payment',()=>{
  const initial=base();initial.debtors=[{id:'d',name:'Test',amountCents:50000,paidCents:0,status:'Outstanding',currency:'ZAR'}];
  const next=structuredClone(initial);next.debtors[0].paidCents=10000;next.debtors[0].status='Part paid';
  next.captures.push({id:'stable-id',text:'Only once',kind:'thought'});
  const patch=makePatch(initial,next),once=applyPatch(initial,patch),twice=applyPatch(once,patch);
  assert.equal(twice.debtors[0].paidCents,10000);assert.equal(twice.captures.length,1);
});
test('deleting a remotely edited record conflicts, and deleted records are not silently resurrected',()=>{
  const initial=base(),edited=base(),deleted=base();edited.projects[0].name='Changed';deleted.projects=[];
  assert.throws(()=>applyPatch(edited,makePatch(initial,deleted)),SyncConflict);
  assert.throws(()=>applyPatch(deleted,makePatch(initial,edited)),SyncConflict);
});
test('old backups upgrade, merge is idempotent, and duplicate conflicting IDs are rejected',()=>{
  const old=emptyWorkspace();old.version=1;delete old.debtors;delete old.background;delete old.directions;
  assert.deepEqual(upgradeWorkspace(old).debtors,[]);
  const initial=base(),incoming=emptyWorkspace();incoming.background=[{id:'bio',title:'Skills',content:'Example'}];
  const once=mergeImport(initial,incoming);assert.equal(mergeImport(once,incoming).background.length,1);
  incoming.background[0].content='Conflict';assert.throws(()=>mergeImport(once,incoming),/same ID/);
});
test('unknown debt is excluded; partial payments reduce balance and invalid payments are rejected',()=>{
  const doc=emptyWorkspace();doc.debtors=[{id:'known',name:'Known',amountCents:50000,paidCents:10000,status:'Part paid',currency:'ZAR'},{id:'unknown',name:'Unknown',amountCents:null,paidCents:0,status:'Outstanding',currency:'ZAR'}];
  validateWorkspace(doc);assert.deepEqual(debtorTotals(doc.debtors),{knownCents:40000,unknownCount:1,count:2});
  doc.debtors[0].paidCents=60000;assert.throws(()=>validateWorkspace(doc),/received amount/);
  doc.debtors[0].paidCents=10000;doc.debtors[1].status='Paid';assert.throws(()=>validateWorkspace(doc),/known, fully received/);
});
