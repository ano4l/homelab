import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { upgradeWorkspace, migrateLegacy } from './workspace.js';
import { applyPatch, makePatch, mergeImport, SyncConflict } from './workspace-sync.js';
import { accountLock, readCache, writeCache } from './cloud-storage.js';

export function useCloudWorkspace(user) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[status,setStatus]=useState('Connecting'),[pending,setPending]=useState(0),[conflict,setConflict]=useState(false),[lastSync,setLastSync]=useState(null);
  const alive=useRef(true), queue=useRef(Promise.resolve()), channel=useRef(null);
  const publish=useCallback(cache=>{if(!alive.current)return;setData(cache.document);setPending(cache.pending.length);channel.current?.postMessage({changed:true});},[]);
  const serial=useCallback(action=>{const job=()=>accountLock(user.id,action);const result=queue.current.then(job,job);queue.current=result.catch(()=>{});return result;},[user.id]);
  async function remote() {
    const {data:row,error:problem}=await supabase.from('vk_workspace').select('document,revision').eq('id',true).single();
    if(problem)throw new Error(problem.code==='PGRST116'?'This account has no VK workspace. Sign in with the owner account.':problem.message);
    return {...row,document:upgradeWorkspace(row.document)};
  }
  const sync=useCallback(()=>serial(async()=>{
    let cache=await readCache(user.id);
    if(cache)publish(cache);
    if(!navigator.onLine){if(alive.current)setStatus('Offline · changes saved here');return;}
    if(alive.current)setStatus('Syncing');
    try{
      let row=await remote();
      cache ||= {document:row.document,pending:[],revision:row.revision};
      while(cache.pending.length){
        const patch=cache.pending[0];let saved=false;
        for(let attempt=0;attempt<4;attempt++){
          const merged=applyPatch(row.document,patch);
          const result=await supabase.from('vk_workspace').update({document:merged,revision:row.revision+1}).eq('id',true).eq('revision',row.revision).select('document,revision').maybeSingle();
          if(result.error)throw new Error(result.error.message);
          if(result.data){row={...result.data,document:upgradeWorkspace(result.data.document)};saved=true;break;}
          row=await remote();
        }
        if(!saved)throw new Error('Other devices are saving right now. Your changes are queued; retry shortly.');
        cache.pending.shift();cache.revision=row.revision;
        // Keep the visible local document until the whole outbox is reconciled.
        await writeCache(user.id,cache);
      }
      cache={document:row.document,pending:[],revision:row.revision};await writeCache(user.id,cache);publish(cache);
      if(alive.current){setStatus('Up to date');setError('');setConflict(false);setLastSync(new Date().toISOString());}
    }catch(problem){
      if(alive.current){setStatus(problem instanceof SyncConflict?'Needs review':cache?.pending.length?'Changes queued':'Connection unavailable');setError(problem.message);setConflict(problem instanceof SyncConflict);}
    }
  }),[user.id,serial,publish]);
  useEffect(()=>{
    alive.current=true;sync();
    channel.current=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(`vk-shared-${user.id}`);
    if(channel.current)channel.current.onmessage=async()=>{const cache=await readCache(user.id);if(cache&&alive.current){setData(cache.document);setPending(cache.pending.length);}};
    const onVisible=()=>{if(document.visibilityState==='visible')sync();};
    window.addEventListener('online',sync);window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisible);
    const timer=setInterval(onVisible,15000);
    const realtime=supabase.channel(`vk-workspace-${user.id}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'vk_workspace',filter:`owner_id=eq.${user.id}`},()=>sync()).subscribe();
    return()=>{alive.current=false;clearInterval(timer);channel.current?.close();supabase.removeChannel(realtime);window.removeEventListener('online',sync);window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible);};
  },[user.id,sync]);
  const update=useCallback(mutator=>serial(async()=>{
    if(alive.current)setSaving(true);
    try{
      const cache=await readCache(user.id);if(!cache)throw new Error('Connect once to load your shared workspace before editing.');
      const next=structuredClone(cache.document);mutator(next);next.updatedAt=new Date().toISOString();
      const patch=makePatch(cache.document,next);
      cache.document=next;if(patch.records.length||Object.keys(patch.settings).length)cache.pending.push(patch);
      await writeCache(user.id,cache);publish(cache);if(alive.current){setStatus('Changes queued');setError('');}
      // Start after releasing this account's storage lock.
      setTimeout(()=>sync(),0);return true;
    }catch(problem){if(alive.current)setError(`Not saved. ${problem.message}`);return false;}
    finally{if(alive.current)setSaving(false);}
  }),[user.id,serial,publish,sync]);
  const importData=useCallback(async text=>{
    try{if(text.length>20*1024*1024)throw new Error('Backup exceeds 20 MB.');const imported=upgradeWorkspace(JSON.parse(text));return update(draft=>Object.assign(draft,mergeImport(draft,imported)));}
    catch(problem){setError(problem.message);return false;}
  },[update]);
  const exportData=useCallback(()=>{
    if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`vk-backup-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },[data]);
  const resolveConflict=useCallback(keepLocal=>serial(async()=>{
    try{
      const cache=await readCache(user.id),row=await remote();
      let next=row.document;
      if(keepLocal)for(const patch of cache.pending)next=applyPatch(next,patch,true);
      // Rebase local intent explicitly; the next save still uses revision checks.
      const patch=makePatch(row.document,next);const rebased={document:next,pending:keepLocal?[patch]:[],revision:row.revision};
      await writeCache(user.id,rebased);publish(rebased);setConflict(false);setError('');setTimeout(()=>sync(),0);
    }catch(problem){setError(problem.message);}
  }),[user.id,serial,publish,sync]);
  const importDevice=useCallback(async()=>{
    try{
      const legacy=await new Promise((resolve,reject)=>{const request=indexedDB.open('vk-personal-workspace',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspace','readonly'),read=tx.objectStore('workspace').get('current');read.onsuccess=()=>{resolve(read.result||migrateLegacy(localStorage));db.close();};read.onerror=()=>reject(read.error);};});
      return await importData(JSON.stringify(legacy));
    }catch(problem){setError(problem.message);return false;}
  },[importData]);
  return {data,ready:!!data,error,saving,update,retry:sync,exportData,importData,importDevice,status,pending,conflict,resolveConflict,lastSync};
}
