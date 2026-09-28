import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { debtorTotals, safeUrl, todayKey } from '../lib/workspace';
const money=(value,currency='ZAR',digits=currency==='ZAR'?0:2)=>new Intl.NumberFormat('en-ZA',{style:'currency',currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
const dateLabel=value=>value?new Date(value).toLocaleString('en-ZA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Update time unavailable';
const names=['TeachersVIP','NovaLens','Kganya'];
export function priorityDebtors(debtors) {
  return names.map(name=>debtors.find(d=>{
    const normalized=d.name.toLowerCase().replace(/[^a-z]/g,'');
    return name==='NovaLens'?normalized.includes('novalens')||normalized==='cris':normalized===name.toLowerCase();
  })).filter(Boolean);
}
function SourceLink({url,children}){const href=safeUrl(url);return href?<a href={href} target="_blank" rel="noreferrer">{children}<ArrowRight size={13}/></a>:<span>{children}</span>;}
export default function DashboardBriefing({data,now,onEditDebtor,onOpenDebtors}) {
  const [report,setReport]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const refresh=useCallback(async signal=>{
    setBusy(true);setError('');
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error('Sign in again to load the daily report.');
      const response=await fetch('/api/daily-report',{headers:{Authorization:`Bearer ${session.access_token}`},signal});
      if(!response.ok)throw new Error(response.status===401?'Sign in again to load the daily report.':'The report is unavailable right now. Your workspace is still available.');
      const next=await response.json();
      if(!signal?.aborted)setReport(next);
    } catch(problem){if(!signal?.aborted)setError(problem.message);}
    finally {if(!signal?.aborted)setBusy(false);}
  },[]);
  useEffect(()=>{
    const controller=new AbortController();refresh(controller.signal);
    const interval=setInterval(()=>refresh(controller.signal),10*60*1000);
    return()=>{controller.abort();clearInterval(interval);};
  },[refresh]);
  const priority=priorityDebtors(data.debtors),totals=debtorTotals(priority);
  const today=todayKey(now),overdue=data.tasks.filter(t=>!t.done&&t.deadline&&t.deadline<today).length;
  const blocked=data.projects.filter(p=>p.blocker?.trim()).length;
  const markets=['XAU/USD','BTC','ETH','USD/ZAR'].map(symbol=>report?.markets.find(m=>m.symbol===symbol)||{symbol,name:{'XAU/USD':'Gold',BTC:'Bitcoin',ETH:'Ethereum','USD/ZAR':'USD / ZAR'}[symbol],usd:null});
  return <div className="dashboard-briefing">
    <section className="priority-debtors" aria-labelledby="priority-debtors-title">
      <div className="section-head"><div><span className="eyebrow">COLLECTIONS / PRIORITY</span><h2 id="priority-debtors-title">Follow up first.</h2></div><button className="text-button" onClick={onOpenDebtors}>All debtors<ArrowRight size={14}/></button></div>
      <div className="priority-debtor-grid">{priority.map(debtor=>{
        const closed=['Paid','Cancelled'].includes(debtor.status),remaining=closed?0:debtor.amountCents===null?null:Math.max(0,debtor.amountCents-(debtor.paidCents||0));
        return <button className="priority-debtor" key={debtor.id} onClick={()=>onEditDebtor(debtor)} aria-label={`Review ${debtor.name} debtor`}><span>{debtor.name}</span><strong>{remaining===null?'Amount unknown':money(remaining/100)}</strong><small>{closed?debtor.status:debtor.paidCents?'Part paid · remaining balance':'Outstanding · follow up'}<ArrowRight size={15}/></small></button>;
      })}</div>
      <p className="fine-print">{money(totals.knownCents/100)} known outstanding across these priority records{totals.unknownCount?` · ${totals.unknownCount} amounts to confirm`:''}. {priority.length?'Tap a record to update payments or notes.':'Add these debtors to your ledger to see their balances here.'}</p>
    </section>
    <section className="daily-report" aria-labelledby="daily-report-title">
      <div className="section-head"><div><span className="eyebrow">YOUR DAILY REPORT</span><h2 id="daily-report-title">The day, at a glance.</h2></div><button className="quiet" onClick={()=>refresh()} disabled={busy}><RefreshCw size={14} className={busy?'report-spinning':''}/>{busy?'Updating…':'Refresh report'}</button></div>
      <div className="report-work-summary"><div><strong>{overdue}</strong><span>overdue tasks</span></div><div><strong>{blocked}</strong><span>blocked projects</span></div><div><strong>{data.tasks.filter(t=>!t.done).length}</strong><span>open tasks</span></div><div><strong>{data.captures.filter(c=>!c.archived&&!c.convertedTaskId).length}</strong><span>thoughts to sort</span></div></div>
      <div className="market-grid">{markets.map(m=><article className="market-quote" key={m.symbol}>
        <div><span className="eyebrow">{m.symbol}</span><h3>{m.name}</h3></div>
        <strong>{m.usd===null?busy?'Loading…':'Unavailable':money(m.usd,m.symbol==='USD/ZAR'?'ZAR':'USD',2)}</strong>
        <small>{m.unit||'USD'}{m.zar!=null?` · ${money(m.zar)} in ZAR`:''}</small>
        {m.change!=null&&<span className={`market-change ${m.change<0?'market-change--down':''}`}>{m.change>0?'+':''}{m.change.toFixed(2)}% <small>{m.source==='CoinGecko'?'24h':'provider session'}</small></span>}
        <small className="quote-source">{m.source||'Waiting for feed'} · {dateLabel(m.updatedAt)}{m.updatedAt&&now-new Date(m.updatedAt)>30*60*1000?' · Older quote':''}</small>
      </article>)}</div>
      {error&&<p className="danger" role="alert">{error}</p>}
      {report?.summary&&<div className="report-summary"><span className="eyebrow">DAILY BRIEF / GEMINI</span><p>{report.summary}</p><small>AI summary of the retrieved feeds. Check the source figures and linked headlines.</small></div>}
      <div className="report-columns">
        <section><span className="eyebrow">TECHNOLOGY / HEADLINES</span>{report?.news.data?.length?report.news.data.slice(0,4).map(a=><article className="report-row" key={a.url}><SourceLink url={a.url}>{a.title}</SourceLink><small>{a.source} · {dateLabel(a.publishedAt)}</small></article>):<p>{busy?'Fetching headlines…':report?.news.status==='Connected'?'No headlines returned.':'News feed unavailable.'}</p>}</section>
        <section><span className="eyebrow">SPORTS / TODAY</span>{[['NBA',report?.nba],['Football',report?.football]].map(([label,feed])=><div key={label} className="report-sports"><h3>{label}</h3>{feed?.data?.length?feed.data.slice(0,3).map(g=><div className="report-row" key={g.id}><strong>{g.away} · {g.home}</strong><small>{g.awayScore!=null&&g.homeScore!=null?`${g.awayScore} – ${g.homeScore} · `:''}{g.status}</small></div>):<p>{busy?'Checking today’s games…':feed?.status==='Connected'?'No games scheduled today.':feed?.status==='Not configured'?'Connect your football source to see fixtures.':'Sports feed unavailable.'}</p>}</div>)}</section>
        <section><span className="eyebrow">PROJECTS / RECENT ACTIVITY</span>{report?.github.data?.map(r=><article className="report-row" key={r.url}><SourceLink url={r.url}>{r.name}</SourceLink><small>GitHub · pushed {dateLabel(r.updatedAt)}</small></article>)}{report?.deployments.data?.map(d=><article className="report-row" key={d.url}><SourceLink url={d.url}>{d.name}</SourceLink><small>Vercel · {d.state} · {dateLabel(d.createdAt)}</small></article>)}{!busy&&!report?.github.data&&!report?.deployments.data&&<p>Project activity unavailable.</p>}</section>
      </div>
      <div className="report-footer"><small>{report?`Report fetched ${dateLabel(report.fetchedAt)} · Refreshes every 10 minutes`:'Connecting your daily report…'}</small><details><summary>Feed status</summary><div className="report-source-list">{report?.sources.map(s=><span key={s.name}>{s.name}<b>{s.status}{s.fallback==='Connected'?' · Gold API fallback':''}</b></span>)}</div></details></div>
    </section>
  </div>;
}
