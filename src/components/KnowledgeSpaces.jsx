import { useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { debtorTotals, uid } from '../lib/workspace';
import { mergeRecord } from '../lib/workspace-sync';

const money = cents => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:2}).format(cents/100);
export default function KnowledgeSpaces({view,data,save,saving,Dialog,Field}) {
  const [editing,setEditing]=useState(null),[filter,setFilter]=useState(''),[showClosed,setShowClosed]=useState(false);
  const group={Background:'background',Business:'directions',Debtors:'debtors'}[view];
  const debt=group==='debtors',business=group==='directions';
  const totals=debtorTotals(data.debtors);
  const rows=data[group].filter(item=>(!debt||showClosed||!['Paid','Cancelled'].includes(item.status))&&`${item.name||item.title} ${item.notes||''} ${item.content||''}`.toLowerCase().includes(filter.toLowerCase()));
  return <>
    <div className="toolbar"><p className="toolbar-copy">{debt?'What is owed, what has arrived, and what needs confirming.':business?'Your business direction, with room to develop each idea.':'Your background and the context behind your work.'}</p><button className="primary" onClick={()=>setEditing({})}><Plus size={15}/>{debt?'Add debtor':business?'Add direction':'Add background'}</button></div>
    {debt&&<><div className="plan-summary debt-summary"><div><span className="eyebrow">KNOWN OUTSTANDING</span><strong>{money(totals.knownCents)}</strong></div><div><span className="eyebrow">AMOUNTS TO CONFIRM</span><strong>{totals.unknownCount}</strong></div><div><span className="eyebrow">OPEN RECORDS</span><strong>{totals.count}</strong></div></div><p className="fine-print">Unknown amounts are excluded from the total. Payments update this ledger only.</p></>}
    <div className="toolbar"><input type="search" aria-label={`Search ${view.toLowerCase()}`} placeholder={`Search ${view.toLowerCase()}…`} value={filter} onChange={e=>setFilter(e.target.value)}/>{debt&&<button className="quiet" onClick={()=>setShowClosed(!showClosed)}>{showClosed?'Show outstanding only':'Include paid / cancelled'}</button>}</div>
    <div className={debt?'debt-list':'knowledge-grid'}>{rows.map(item=><article key={item.id} className={debt?'debt-card':'knowledge-card'}>
      <div className="section-head"><span className="eyebrow">{item.category||item.status||'Background'}{business&&item.priority?` / ${item.priority}`:''}</span>{debt&&<span className="debt-status">{item.status}</span>}</div>
      <h2>{item.name||item.title}</h2>
      {debt?<><strong className="debt-amount">{item.amountCents===null?'Amount unknown':money(Math.max(0,item.amountCents-item.paidCents))}</strong><small>{item.amountCents===null?'Confirm before adding to the total':`${money(item.amountCents)} original · ${money(item.paidCents)} received`}</small>{item.projectId&&<p className="fine-print">{data.projects.find(p=>p.id===item.projectId)?.name}</p>}</>:<p className="preserve-lines">{item.content||item.notes}</p>}
      {business&&item.nextAction&&<p><b>Next:</b> {item.nextAction}</p>}
      {debt&&item.notes&&<p className="preserve-lines">{item.notes}</p>}
      {item.source&&<small className="source-note">{item.source}</small>}
      <button className="quiet" onClick={()=>setEditing(item)}>Edit {debt?'record':business?'direction':'background'}<ArrowRight size={14}/></button>
    </article>)}</div>
    {!rows.length&&<p className="empty">No matching records. Add one to build on your workspace.</p>}
    {editing&&<KnowledgeEditor key={editing.id||'new'} group={group} record={editing} data={data} save={save} saving={saving} Dialog={Dialog} Field={Field} close={()=>setEditing(null)}/>}
  </>;
}
function KnowledgeEditor({group,record,data,save,saving,Dialog,Field,close}) {
  const debt=group==='debtors',business=group==='directions';
  const [form,setForm]=useState({title:'',name:'',category:'',content:'',notes:'',source:'',nextAction:'',priority:'',status:'Outstanding',projectId:'',...record,amount:record.amountCents==null?'':String(record.amountCents/100),paid:String((record.paidCents||0)/100)}),[error,setError]=useState('');
  const set=(key,value)=>setForm(f=>({...f,[key]:value}));
  const input=(key,required=false)=><input required={required} value={form[key]||''} onChange={e=>set(key,e.target.value)}/>;
  async function submit(event){
    event.preventDefault();setError('');
    const entry={...record,id:record.id||uid(),updatedAt:new Date().toISOString(),source:form.source.trim()};
    if(debt){
      const parse=value=>{if(!/^\d+(\.\d{1,2})?$/.test(value))throw new Error('Use a positive amount with at most two decimal places.');return Math.round(Number(value)*100);};
      try{entry.amountCents=form.amount.trim()===''?null:parse(form.amount);entry.paidCents=parse(form.paid||'0');}catch(problem){setError(problem.message);return;}
      if(entry.amountCents===null&&entry.paidCents>0||entry.amountCents!==null&&entry.paidCents>entry.amountCents){setError('Confirm the original amount first. Received payments cannot exceed it.');return;}
      if(form.status==='Paid'&&(entry.amountCents===null||entry.paidCents!==entry.amountCents)){setError('To mark paid, enter the full known amount as received.');return;}
      Object.assign(entry,{name:form.name.trim(),currency:'ZAR',projectId:form.projectId||null,notes:form.notes.trim(),status:form.status==='Cancelled'?'Cancelled':entry.amountCents!==null&&entry.paidCents===entry.amountCents?'Paid':entry.paidCents>0?'Part paid':'Outstanding'});
    }else Object.assign(entry,{title:form.title.trim(),category:form.category.trim(),...(business?{notes:form.notes.trim(),nextAction:form.nextAction.trim(),priority:form.priority.trim()}:{content:form.content.trim()})});
    if(await save(d=>{const i=d[group].findIndex(item=>item.id===entry.id);if(record.id){if(i<0)throw new Error('This record was removed on another device.');d[group][i]=mergeRecord(d[group][i],record,entry);}else d[group].push(entry);},'Saved. Shared devices update when connected.'))close();
  }
  return <Dialog title={`${record.id?'Edit':'Add'} ${debt?'debtor':business?'business direction':'background'}`} onClose={close}><form className="editor-form" onSubmit={submit}>
    <Field label={debt?'Debtor name':'Title'} wide>{input(debt?'name':'title',true)}</Field>
    {debt?<><Field label="Amount owed (R) — blank if unknown"><input type="text" inputMode="decimal" value={form.amount} onChange={e=>set('amount',e.target.value)}/></Field><Field label="Amount received (R)"><input type="text" inputMode="decimal" value={form.paid} onChange={e=>set('paid',e.target.value)}/></Field><Field label="Status"><select value={form.status} onChange={e=>set('status',e.target.value)}>{['Outstanding','Part paid','Paid','Cancelled'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Project"><select value={form.projectId||''} onChange={e=>set('projectId',e.target.value)}><option value="">No linked project</option>{data.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field></>:<Field label="Category" wide>{input('category')}</Field>}
    <Field label={debt?'Notes':business?'Direction and context':'Details'} wide><textarea rows={7} value={form[debt||business?'notes':'content']} onChange={e=>set(debt||business?'notes':'content',e.target.value)}/></Field>
    {business&&<><Field label="Priority">{input('priority')}</Field><Field label="Next action">{input('nextAction')}</Field></>}
    <Field label="Source / last verified" wide>{input('source')}</Field>
    {error&&<p role="alert" className="danger wide">{error}</p>}
    <div className="form-actions wide"><button className="quiet" type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>Save</button></div>
  </form></Dialog>;
}
