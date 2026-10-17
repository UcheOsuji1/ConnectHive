import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { api } from '../lib/api.js';
import { Panel, Button, Notice, Status, money } from '../components/billing/BillingUI.jsx';
export default function AdminMonetizationPage() {
  const [reviews,setReviews]=useState([]),[error,setError]=useState(''),[notes,setNotes]=useState({}),[busy,setBusy]=useState(false);
  async function load(){try{setReviews((await api.get('/api/billing/admin/reviews')).reviews);}catch(e){setError(e.message);}}
  useEffect(()=>{void load();},[]);
  async function review(id,decision){setBusy(true);setError('');try{await api.post(`/api/billing/admin/hives/${id}/review`,{decision,note:notes[id]||''});await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <><Navbar/><main className="bill-page bill-root"><h1>Paid Hive review</h1><p>Staff approval is required before owners can publish. Check ongoing value, pricing, cancellation terms, safety, and Stripe verification.</p><Notice error>{error}</Notice>{reviews.map(r=><Panel key={r.hive_id}><div className="bill-row"><h2>{r.hive_name}</h2><Status value={r.state}/></div><p>{money(r.monthly_price_cents)} / month · Revision {r.revision}</p><h3>Benefits</h3><p>{r.benefits}</p><h3>Description</h3><p>{r.description}</p><h3>Cancellation</h3><p>{r.cancellation_policy}</p><label>Review reason<textarea value={notes[r.hive_id]||''} onChange={e=>setNotes({...notes,[r.hive_id]:e.target.value})}/></label><div className="bill-actions">{[['approve','Approve'],['request_changes','Request changes'],['decline','Decline']].map(([key,title])=><Button disabled={busy} key={key} onClick={()=>review(r.hive_id,key)}>{title}</Button>)}</div></Panel>)}{!reviews.length&&!error&&<p>No paid Hives awaiting review.</p>}</main></>;
}
