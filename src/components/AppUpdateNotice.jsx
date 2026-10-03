import { useEffect, useState } from 'react';

export default function AppUpdateNotice() {
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    if(!('serviceWorker' in navigator)||!import.meta.env.PROD)return;
    let active=true,registration,controller=navigator.serviceWorker.controller;
    const onChange=()=>{if(active&&controller)setReady(true);controller=navigator.serviceWorker.controller;};
    const check=()=>{if(document.visibilityState==='visible')registration?.update().catch(()=>{});};
    navigator.serviceWorker.addEventListener('controllerchange',onChange);
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
      if(!active)return;
      registration=reg;
      if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
      check();
    }).catch(()=>{});
    window.addEventListener('focus',check);
    document.addEventListener('visibilitychange',check);
    const timer=setInterval(check,30*60*1000);
    return()=>{active=false;clearInterval(timer);navigator.serviceWorker.removeEventListener('controllerchange',onChange);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
  },[]);
  return ready?<aside className="app-update-notice" role="status"><span>A new version is ready.</span><button onClick={()=>window.location.reload()}>Reload app</button></aside>:null;
}
