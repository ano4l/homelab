import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AssistantIntake({data,onApply,onSaveThought}) {
  const [input,setInput]=useState(''),[messages,setMessages]=useState([]),[question,setQuestion]=useState(''),[options,setOptions]=useState([]),[proposal,setProposal]=useState(null),[source,setSource]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const reset=()=>{setMessages([]);setQuestion('');setOptions([]);setProposal(null);setSource(null);setInput('');setError('');};
  async function send(answer=input) {
    const value=answer.trim();if(!value||busy)return;
    const previousQuestion=question,previousOptions=options;
    const conversation=[...messages,...(question?[{role:'assistant',text:question}]:[]),{role:'user',text:value}];
    setMessages(conversation);setQuestion('');setOptions([]);setInput('');setBusy(true);setError('');
    try {
      const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Sign in again to use the assistant.');
      const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({messages:conversation,projects:data.projects.map(p=>({id:p.id,name:p.name,nextAction:p.nextAction})),debtors:data.debtors.map(d=>({id:d.id,name:d.name})),tasks:data.tasks.filter(t=>!t.done).slice(0,40).map(t=>({title:t.title,deadline:t.deadline})),currentFocus:data.settings.dashboardFocus||null})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'The assistant is unavailable.');
      setQuestion(result.question||'');setOptions(result.options||[]);setProposal(result.proposal||null);
      if(result.proposal)setSource(result.proposal.kind==='project_update'?data.projects.find(p=>p.id===result.proposal.projectId):null);
    } catch(problem){setMessages(messages);setQuestion(previousQuestion);setOptions(previousOptions);setInput(value);setError(problem.message||'The assistant is unavailable.');}
    finally{setBusy(false);}
  }
  async function apply() {if(!proposal||busy)return;setBusy(true);const ok=await onApply(proposal,source);setBusy(false);if(ok)reset();}
  async function saveThought(){const text=messages.filter(m=>m.role==='user').map(m=>m.text).join(' · ')||input.trim();if(!text)return;setBusy(true);const ok=await onSaveThought(text);setBusy(false);if(ok)reset();}
  const project=data.projects.find(p=>p.id===proposal?.projectId),debtor=data.debtors.find(d=>d.id===proposal?.debtorId);
  const unfinished=data.projects.find(p=>p.status!=='Complete'&&!p.nextAction);
  const promptIdeas=[unfinished?`Help me find the next step for ${unfinished.name}`:'Help me decide what to focus on today',data.debtors.some(d=>d.status==='Outstanding')?'Help me plan my next debtor follow-up':'Help me plan my next move'];
  return <section className="assistant-intake" aria-labelledby="assistant-intake-title">
    <div className="assistant-intake-head"><div><span className="eyebrow">VK / WORK WITH ME</span><h2 id="assistant-intake-title">Tell me what’s happening.</h2></div><Sparkles size={19}/></div>
    <p className="assistant-lede">I’ll ask what matters, then prepare an update for your dashboard. You approve it before anything changes.</p>
    {!messages.length&&!proposal&&<div className="assistant-starts"><span className="eyebrow">A PLACE TO START</span>{promptIdeas.map(idea=><button className="quiet" key={idea} onClick={()=>send(idea)} disabled={busy}>{idea}<ArrowRight size={13}/></button>)}</div>}
    {messages.length>0&&<div className="assistant-thread" aria-live="polite">{messages.map((m,i)=><p key={i} className={m.role==='user'?'assistant-user':'assistant-question'}>{m.text}</p>)}</div>}
    {question&&<div className="assistant-question-block"><strong>{question}</strong>{options.length>0&&<div className="assistant-options">{options.map(option=><button key={option} type="button" className="quiet" disabled={busy} onClick={()=>send(option)}>{option}</button>)}</div>}</div>}
    {proposal&&<div className="assistant-proposal"><span className="eyebrow">SUGGESTED UPDATE / REVIEW BEFORE SAVING</span>
      {proposal.kind==='task'&&<><h3>Make a task</h3><label>Next step<input aria-label="Suggested task title" value={proposal.title} onChange={e=>setProposal({...proposal,title:e.target.value})}/></label><div className="assistant-proposal-fields"><label>Due date<input type="date" aria-label="Suggested due date" value={proposal.deadline||''} onChange={e=>setProposal({...proposal,deadline:e.target.value||null})}/></label><label>Priority<select aria-label="Suggested priority" value={proposal.priority} onChange={e=>setProposal({...proposal,priority:e.target.value})}>{['Low','Medium','High'].map(x=><option key={x}>{x}</option>)}</select></label></div><small>{project?`For ${project.name} · `:''}{proposal.context} · {proposal.notes||'No additional notes'}</small></>}
      {proposal.kind==='project_update'&&<><h3>Update {project?.name||'project'}</h3>{proposal.nextAction&&<label>Next action<input value={proposal.nextAction} onChange={e=>setProposal({...proposal,nextAction:e.target.value})}/></label>}{proposal.blocker&&<label>Blocker<input value={proposal.blocker} onChange={e=>setProposal({...proposal,blocker:e.target.value})}/></label>}</>}
      {proposal.kind==='focus'&&<><h3>Put {project?.name||debtor?.name} in focus</h3><p>This will keep it visible on your main dashboard.</p></>}
      {proposal.kind==='capture'&&<><h3>Keep as a thought</h3><p>{proposal.text}</p></>}
      <div className="assistant-actions"><button type="button" className="primary" disabled={busy||proposal.kind==='task'&&!proposal.title.trim()} onClick={apply}>{busy?'Saving…':'Add to my dashboard'}<ArrowRight size={14}/></button><button type="button" className="text-button" onClick={reset}>Start over</button></div>
    </div>}
    {!proposal&&<form className="assistant-input" onSubmit={e=>{e.preventDefault();send()}}><label htmlFor="assistant-entry">{question?'Your answer':'What should I help you sort out?'}</label><div><textarea id="assistant-entry" rows={2} value={input} onChange={e=>setInput(e.target.value)} placeholder="e.g. Follow up with TeachersVIP this week about payment" maxLength={1000}/><button className="primary" disabled={busy||!input.trim()}>{busy?'Thinking…':question?'Answer':'Ask VK'}<ArrowRight size={15}/></button></div></form>}
    {error&&<p className="danger" role="alert">{error}</p>}
    <div className="assistant-foot"><button type="button" className="text-button" disabled={busy||!messages.length&&!input.trim()} onClick={saveThought}>Save as thought instead</button><small>Sends this conversation and relevant workspace titles to Gemini. You approve every change.</small></div>
  </section>;
}
