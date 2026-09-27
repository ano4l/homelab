import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export default function AccountGate({children}) {
  const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[open,setOpen]=useState(false),[checked,setChecked]=useState(false),[problem,setProblem]=useState('');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[recovering,setRecovering]=useState(false);
  const [setupCode,setSetupCode]=useState(()=>{
    const code=new URLSearchParams(location.hash.slice(1)).get('setup');
    if(code){sessionStorage.setItem('vk-setup',code);history.replaceState(null,'',location.pathname+location.search);}
    return code||sessionStorage.getItem('vk-setup')||'';
  });
  useEffect(()=>{
    // Opening a setup link in an already-open tab changes only the fragment;
    // React stays mounted, so consume it on hashchange as well as first load.
    const consumeSetupLink=()=>{
      const code=new URLSearchParams(location.hash.slice(1)).get('setup');
      if(!code)return;
      sessionStorage.setItem('vk-setup',code);setSetupCode(code);
      history.replaceState(null,'',location.pathname+location.search);
    };
    window.addEventListener('hashchange',consumeSetupLink);
    return()=>window.removeEventListener('hashchange',consumeSetupLink);
  },[]);
  async function check(){
    if(!supabase)return;
    const {data,error}=await supabase.from('vk_registration').select('is_open').eq('id',true).single();
    if(error){setProblem('Shared workspace setup is not available yet. The database must be connected and prepared.');setChecked(false);}
    else{setOpen(data.is_open);setChecked(true);setProblem('');}
  }
  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    let active=true;
    supabase.auth.getSession().then(({data,error})=>{if(active){setUser(data.session?.user||null);setLoading(false);if(error)setProblem(error.message);}});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{if(active){setUser(session?.user||null);setLoading(false);if(event==='PASSWORD_RECOVERY')setRecovering(true);}});
    check();return()=>{active=false;subscription.unsubscribe();};
  },[]);
  async function submit(event){
    event.preventDefault();setBusy(true);setProblem('');setNotice('');
    try{
      if(recovering){const {error}=await supabase.auth.updateUser({password});if(error)throw error;setRecovering(false);setPassword('');return;}
      const signup=open&&checked;
      if(signup&&!/^[a-f0-9]{64}$/i.test(setupCode.trim()))throw new Error('Open your private setup link or enter its setup key to create the owner account.');
      const result=signup?await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:location.origin,data:{vk_setup_code:setupCode.trim()}}}):await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(result.error)throw result.error;
      if(signup){sessionStorage.removeItem('vk-setup');setOpen(false);if(!result.data.session)setNotice('Account created. Check your email to verify it, then sign in here. New signups are now closed.');}
      setPassword('');
    }catch(error){setProblem(error.message);}finally{setBusy(false);}
  }
  if(loading)return <main className="loading"><strong>VK</strong><p>Opening your workspace…</p></main>;
  if(user&&!recovering)return children(user);
  const signup=open&&checked;
  return <main className="account-gate"><section><img src="/icons/vk-app-icon-192.png" width="112" height="112" alt="VK particle sphere"/><span className="eyebrow">YOUR PERSONAL CONTROL POINT</span><h1>{recovering?'Choose a new password':signup?'Make this space yours.':'Welcome back.'}</h1><p>{signup?'Create your owner account. Signup closes after this account is created. Use the same sign-in on every device.':'Your background, projects, and plans. Shared securely across your devices.'}</p>
    {!isSupabaseConfigured?<p role="alert">The shared database has not been configured.</p>:<form onSubmit={submit} className="account-form">
      {signup&&!sessionStorage.getItem('vk-setup')&&<label>Private setup key<input required type="password" autoComplete="off" spellCheck={false} value={setupCode} onChange={e=>setSetupCode(e.target.value)} placeholder="Paste the key from your private setup link"/><small>Your private link fills this automatically. This protects your workspace before your first signup.</small></label>}
      {!recovering&&<label>Email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>}
      <label>Password<input required type="password" minLength={signup||recovering?12:1} maxLength={128} autoComplete={signup||recovering?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
      {signup&&<small>Use at least 12 characters. Your setup link can only create one account.</small>}
      <button className="primary" disabled={busy||!checked}>{busy?'Please wait…':recovering?'Update password':signup?'Create owner account':'Sign in'}</button>
      {!signup&&!recovering&&<button className="text-button" type="button" disabled={busy||!email} onClick={async()=>{setBusy(true);const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});setProblem(error?.message||'');setNotice(error?'':'If this is your account, a recovery email is on its way.');setBusy(false);}}>Forgot password?</button>}
    </form>}
    {!checked&&<button className="quiet" onClick={check}>Retry connection</button>}
    {problem&&<p className="danger" role="alert">{problem}</p>}{notice&&<p role="status">{notice}</p>}
  </section></main>;
}
