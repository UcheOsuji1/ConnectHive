import { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Panel, Button, Status, Notice, ConfirmDialog, MonetizationForm, emptyConfig, configPayload, money, day } from '../../components/billing/BillingUI.jsx';
export default function HiveBillingPage() {
  const { hiveId } = useOutletContext();
  const [data,setData] = useState(null), [error,setError] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false), [config,setConfig] = useState({...emptyConfig,mode:'paid'}), [closing,setClosing] = useState(false), [confirmation,setConfirmation] = useState('');
  const [refundResponses,setRefundResponses]=useState({});
  async function load() {
    try { const d = await api.get(`/api/billing/hives/${hiveId}/owner`); setData(d); if (d.offering) setConfig({mode:'paid',monthlyPrice:(d.offering.monthly_price_cents/100).toFixed(2),benefits:d.offering.benefits,description:d.offering.description,cancellationPolicy:d.offering.cancellation_policy}); }
    catch(e) {setError(e.message);}
  }
  useEffect(() => { void load(); }, [hiveId]);
  async function act(action, body) {
    setBusy(true);setError('');setNotice('');
    try { if (action==='configuration') await api.put(`/api/billing/hives/${hiveId}/${action}`,body); else await api.post(`/api/billing/hives/${hiveId}/${action}`,body); setClosing(false);setNotice(action==='close' ? 'New subscriptions are disabled. Cancellation tasks will retry until renewals stop. Paid-through access is retained.' : 'Your monetization settings have been updated.'); await load(); }
    catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  return <div className="bill-root"><Panel><span className="bill-eyebrow">Owner workspace</span><h2>Monetization</h2><p>Offer ongoing value. Build a community with clear expectations.</p><Notice error>{error}</Notice><Notice>{notice}</Notice>
    {!data && !error && <p role="status">Loading monetization…</p>}
    {data && <>
      <div className="bill-row"><Status value={data.offering?.state || 'draft'}/><Status value={data.connection?.status}/></div>
      <p><Link to="/settings#billing">Connect or manage your Stripe payout account</Link></p>
      {data.offering?.review_note && <Notice>TrueHive review: {data.offering.review_note}</Notice>}
      <div className="bill-stats"><div><span>Active subscribers</span><strong>{data.subscribers.active}</strong></div><div><span>Gross collected</span><strong>{money(data.totals.gross_cents)}</strong></div><div><span>TrueHive fees collected</span><strong>{data.totals.unknown_platform_fee_count>0 ? 'Pending reconciliation' : money(data.totals.platform_fee_cents)}</strong></div><div><span>Recorded processing costs</span><strong>{data.totals.processing_fee_cents===null ? 'Not available' : money(data.totals.processing_fee_cents)}</strong></div><div><span>Refunds</span><strong>{money(data.totals.refunds_cents)}</strong></div><div><span>Disputes</span><strong>{data.disputes.length}</strong></div></div>
      <p className="bill-muted">Collected revenue is historical, not a payout promise. Stripe balances and payout adjustments are available in <Link to="/settings#billing">Owner earnings</Link>. {data.totals.unknown_processing_count>0 && 'Some processing costs are not yet available.'}</p>
      {['closing','closed'].includes(data.offering?.state) ? <Panel><h3>{data.offering.state==='closed' ? 'Hive closed to new memberships' : 'Closing your paid Hive'}</h3><p>{data.subscribers.active} members retain paid access. Latest paid-through date: {day(data.subscribers.latest_paid_through)}.</p><p>{data.subscribers.renewals_pending} renewals still awaiting cancellation confirmation. Retry tasks run automatically. Continue providing benefits through each member’s paid period and resolve refunds, disputes, and payouts.</p></Panel> : <>
        <MonetizationForm value={config} onChange={setConfig} plus={data.plus} showMode={false}/>
        <div className="bill-actions"><Button disabled={busy || !data.plus} onClick={() => act('configuration',configPayload(config))}>Submit for TrueHive review</Button>
        {['approved','paused'].includes(data.offering?.state) && <Button disabled={busy || !data.plus} onClick={() => act('publish')}>Publish paid membership</Button>}
        {data.offering?.state==='active' && <Button disabled={busy} className="bill-secondary" onClick={() => act('pause')}>Pause new subscriptions</Button>}
        {data.offering && <Button disabled={busy} className="bill-secondary" onClick={() => setClosing(true)}>Close paid Hive</Button>}</div>
      </>}
      {(data.refunds||[]).map(r=><p key={r.stripe_refund_id}>Refund ? {money(r.amount_cents)} ? <Status value={r.status}/></p>)}
      {(data.refundRequests||[]).map(r=><Panel key={r.id}><h3>Member refund request</h3><Status value={r.state}/><p>{r.reason}</p>{r.owner_response&&<p>Your response: {r.owner_response}</p>}{r.state==='requested'&&<><label>Final response to member<textarea value={refundResponses[r.id]||''} onChange={e=>setRefundResponses({...refundResponses,[r.id]:e.target.value})} maxLength={2000}/></label><p className="bill-muted">Process any appropriate refund in Stripe first. Recording a response does not move money or waive the member?s legal rights.</p><Button disabled={busy} onClick={()=>act(`refund-requests/${r.id}/respond`,{response:refundResponses[r.id]||''})}>Record final response</Button></>}</Panel>)}
      {data.disputes.map(d => <div key={d.stripe_dispute_id}><p>Dispute ? {money(d.amount_cents)} ? <Status value={d.status}/></p><p className="bill-muted">{d.balance_fee_cents == null ? 'Dispute fees awaiting reconciliation' : `Recorded dispute fees: ${money(d.balance_fee_cents)}`}</p>{d.balance_net_cents != null && <p className="bill-muted">Dispute balance impact: {money(d.balance_net_cents)}</p>}</div>)}
      <p className="bill-muted">Owners handle member refund requests through Stripe, subject to law and platform procedures. Use the Stripe Dashboard to issue appropriate partial or full refunds; TrueHive synchronizes their status. Immediate safety closure requires staff review.</p>
    </>}
  </Panel><ConfirmDialog open={closing} title="Close this paid Hive?" cancelLabel="Keep Hive open" busy={busy} onClose={() => setClosing(false)} confirmLabel="Close Hive" onConfirm={() => act('close',{confirm:confirmation})}><p>New subscriptions stop. Existing renewals will be canceled at each member’s period end. Members retain paid-through access, and financial records are preserved.</p><label>Type CLOSE to confirm<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"/></label></ConfirmDialog></div>;
}
