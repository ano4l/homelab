import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('new worker activates and refreshes the page online while preserving offline shell',async()=>{
  const handlers={};let skip=0,claims=0,network=0,offline=false;
  const entries=new Map();
  const cache={addAll:async()=>{},put:async(path,response)=>{entries.set(path,response);},match:async path=>entries.get(typeof path==='string'?path:new URL(path.url).pathname)};
  const caches={open:async()=>cache,keys:async()=>[],delete:async()=>true};
  const self={location:{origin:'https://example.test'},addEventListener:(name,fn)=>{handlers[name]=fn;},skipWaiting:async()=>{skip++;},clients:{claim:async()=>{claims++;}}};
  const source=(await readFile('public/sw.js','utf8')).replace('__VK_BUILD__','test').replace('/* __VK_ASSETS__ */ []','["/index.html","/assets/new.js"]');
  vm.runInNewContext(source,{self,caches,Response,URL,fetch:async()=>{network++;if(offline)throw Error('offline');return new Response('<title>new build</title>',{headers:{'Content-Type':'text/html'}});}});
  let completion;handlers.install({waitUntil:promise=>{completion=promise;}});await completion;assert.equal(skip,1);
  handlers.activate({waitUntil:promise=>{completion=promise;}});await completion;assert.equal(claims,1);
  let response;const navigate={method:'GET',mode:'navigate',url:'https://example.test/'};
  handlers.fetch({request:navigate,respondWith:promise=>{response=promise;}});
  assert.equal(await (await response).text(),'<title>new build</title>');assert.equal(network,1);
  offline=true;handlers.fetch({request:navigate,respondWith:promise=>{response=promise;}});
  assert.equal(await (await response).text(),'<title>new build</title>');assert.equal(network,2);
  response=null;handlers.fetch({request:{method:'GET',mode:'cors',url:'https://example.test/api/assistant'},respondWith:promise=>{response=promise;}});assert.equal(response,null);
});
