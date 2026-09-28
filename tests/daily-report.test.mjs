import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/daily-report.js';
import { authorize, buildReport } from '../server/daily-report.js';

async function call(handler, method='GET') {
  const response={headers:{},setHeader(key,value){this.headers[key]=value;},end(body){this.body=JSON.parse(body);}};
  await handler({method,headers:{}},response); return response;
}
test('unauthorized callers cannot trigger provider requests',async()=>{
  let calls=0;
  const result=await call(createHandler({authenticate:async()=>false,load:async()=>{calls++;}}));
  assert.equal(result.statusCode,401);assert.equal(calls,0);assert.equal(result.headers['Cache-Control'],'private, no-store');
});
test('methods and server failures return safe responses',async()=>{
  const handler=createHandler({authenticate:async()=>true,load:async()=>{throw new Error('secret-provider-key');}});
  assert.equal((await call(handler,'POST')).statusCode,405);
  const result=await call(handler);assert.equal(result.statusCode,503);assert.ok(!JSON.stringify(result.body).includes('secret-provider-key'));
});
test('owner authentication also requires workspace access through RLS',async()=>{
  const original=globalThis.fetch;
  const req={headers:{authorization:'Bearer '+'a'.repeat(30)}},env={VITE_SUPABASE_URL:'https://example.test',VITE_SUPABASE_PUBLISHABLE_KEY:'public'};
  try {
    globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/user')?{id:'owner'}:[]});
    assert.equal(await authorize(req,env),false);
    globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/user')?{id:'owner'}:[{id:true}]});
    assert.equal(await authorize(req,env),true);
    globalThis.fetch=async()=>({ok:true,json:async()=>({id:'anonymous',is_anonymous:true})});
    assert.equal(await authorize(req,env),false);
  } finally {globalThis.fetch=original;}
});
test('one failing feed preserves other quotes and missing keys remain explicit',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async url=>({ok:!url.includes('gnews'),status:429,json:async()=>url.includes('coingecko')?{bitcoin:{usd:100,zar:1600,usd_24h_change:-2,last_updated_at:1000},ethereum:{usd:20}}:url.includes('gold-api')?{price:3000,updatedAt:'2026-09-28T10:00:00Z'}:[]});
    const report=await buildReport({COINGECKO_DEMO_API_KEY:'test',GNEWS_API_KEY:'test'},new Date('2026-09-28T10:00:00Z'));
    assert.equal(report.markets.find(m=>m.symbol==='BTC').usd,100);
    assert.equal(report.markets.find(m=>m.symbol==='XAU/USD').usd,3000);
    assert.equal(report.news.status,'Unavailable');assert.equal(report.football.status,'Not configured');
    assert.equal(report.summary,null);
  } finally {globalThis.fetch=original;}
});
