import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { emptyWorkspace } from '../src/lib/workspace.js';

test('Postgres enforces private bootstrap, one owner, RLS, immutable ownership, and revision checks',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.exec(await readFile('supabase/migrations/20260927075055_shared_personal_workspace.sql','utf8'));
    const first='10000000-0000-4000-8000-000000000001',second='20000000-0000-4000-8000-000000000002';
    const doc=emptyWorkspace();doc.background=[{id:'secret',title:'Private data',content:'Must remain private'}];
    await db.query('insert into vk_private.bootstrap(id,setup_hash,document) values(true,$1,$2)',[createHash('sha256').update('test-only-setup').digest('hex'),JSON.stringify(doc)]);
    await db.exec('set role anon');
    assert.equal((await db.query('select is_open from public.vk_registration')).rows[0].is_open,true);
    await assert.rejects(db.query('select * from public.vk_workspace'),/permission denied/);
    await assert.rejects(db.query('select * from vk_private.bootstrap'),/permission denied/);
    await db.exec('reset role');
    await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[first,'owner@example.test']),/private setup link/);
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[first,'owner@example.test',JSON.stringify({vk_setup_code:'test-only-setup'})]);
    assert.equal((await db.query('select is_open from public.vk_registration')).rows[0].is_open,false);
    assert.equal((await db.query('select raw_user_meta_data from auth.users')).rows[0].raw_user_meta_data.vk_setup_code,undefined);
    await assert.rejects(db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[second,'second@example.test',JSON.stringify({vk_setup_code:'test-only-setup'})]),/registration is closed/);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${second}'`);
    assert.equal((await db.query('select * from public.vk_workspace')).rows.length,0);
    assert.equal((await db.query('update public.vk_workspace set revision=revision+1 returning id')).rows.length,0);
    await db.exec(`set request.jwt.claim.sub='${first}'`);
    assert.equal((await db.query('select document from public.vk_workspace')).rows[0].document.background[0].content,'Must remain private');
    await assert.rejects(db.query('update public.vk_workspace set owner_id=$1',[second]),/permission denied/);
    await assert.rejects(db.query('delete from public.vk_workspace'),/permission denied/);
    await assert.rejects(db.query('update public.vk_workspace set revision=revision'),/increment the revision/);
    assert.equal((await db.query('update public.vk_workspace set revision=2 where revision=1 returning revision')).rows.length,1);
    assert.equal((await db.query('update public.vk_workspace set revision=2 where revision=1 returning revision')).rows.length,0);
  }finally{await db.close();}
});
