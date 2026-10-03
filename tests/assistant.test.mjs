import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/assistant.js';
import { normalizeProposal, validContext } from '../server/assistant.js';

const context={messages:[{role:'user',text:'Focus on Forma'}],projects:[{id:'forma',name:'Forma'}],debtors:[{id:'teacher',name:'TeachersVIP'}],tasks:[]};
async function call(handler,method='POST',payload=context){
  const req={method,headers:{},async *[Symbol.asyncIterator](){yield JSON.stringify(payload);}};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};
  await handler(req,res);return res;
}
test('assistant requires owner before reading messages or calling model',async()=>{
  let called=0;const handler=createHandler({authenticate:async()=>false,ask:async()=>{called++;}});
  assert.equal((await call(handler)).statusCode,401);assert.equal(called,0);
  assert.equal((await call(handler,'GET')).statusCode,405);
});
test('invalid context and model failure never leak provider details',async()=>{
  const handler=createHandler({authenticate:async()=>true,ask:async()=>{throw Error('secret-key');}});
  assert.equal((await call(handler,'POST',{...context,messages:[]})).statusCode,400);
  const result=await call(handler);assert.equal(result.statusCode,503);assert.ok(!JSON.stringify(result.body).includes('secret-key'));
  assert.equal(result.headers['Cache-Control'],'private, no-store');
});
test('Vercel parsed request bodies are accepted',async()=>{
  const handler=createHandler({authenticate:async()=>true,ask:async()=>({question:'What next?',options:[],proposal:null})});
  const req={method:'POST',headers:{},body:context};const res={setHeader(){},end(value){this.body=JSON.parse(value);}};
  await handler(req,res);assert.equal(res.statusCode,200);assert.equal(res.body.question,'What next?');
});
test('only existing targets and valid dates become actions',()=>{
  const checked=validContext(context);
  assert.deepEqual(normalizeProposal({kind:'focus',projectId:'unknown',debtorId:'teacher'},checked),{kind:'focus',projectId:null,debtorId:'teacher'});
  assert.equal(normalizeProposal({kind:'project_update',projectId:'missing',nextAction:'Call'},checked),null);
  assert.equal(normalizeProposal({kind:'delete',projectId:'forma'},checked),null);
  const task=normalizeProposal({kind:'task',title:'Call client',deadline:'2026-02-30',priority:'Urgent',projectId:'forma'},checked);
  assert.equal(task.deadline,null);assert.equal(task.priority,'Medium');assert.equal(task.projectId,'forma');
});
