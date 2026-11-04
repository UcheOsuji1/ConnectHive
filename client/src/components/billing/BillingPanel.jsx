import { redirectToStripe, trustedStripeURL } from '../../lib/billingLinks.js';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Panel, Button, Status, Notice, ConfirmDialog, ExpandableDetails, money, day } from './BillingUI.jsx';

export default function BillingPanel() {
  const [data,setData] = useState(null), [error,setError] = useState(''), [busy,setBusy] = useState(false), [tab,setTab] = useState('memberships'), [cancel,setCancel] = useState(null), [finances,setFinances] = useState(null);
  const [refund,setRefund]=useState(null),[refundReason,setRefundReason]=useState('');
  const reduce = useReducedMotion();
  const activating = new URLSearchParams(window.location.search).get('billing') === 'activating';
  const canceled = new URLSearchParams(window.location.search).get('billing') === 'canceled';
  const load = useCallback(async () => { try { setData(await api.get('/api/billing/summary')); } catch(e) { setError(e.message); } }, []);
  const pending = data?.subscriptions?.some(s => s.status === 'processing');
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = activating && (!data || pending) ? setInterval(load,4000) : null; return () => clearInterval(timer); }, [load,activating,Boolean(data),pending]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('billing') === 'connect') api.post('/api/billing/connect/refresh').then(load).catch(e => setError(e.message)); }, [load]);
  async function act(path, body, redirect = false) {
    setBusy(true); setError('');
    try { const result = await api.post(path,body); if (redirect) redirectToStripe(result?.url,path.includes('/connect/')?'connect':path.endsWith('/portal')?'portal':'checkout'); else { setCancel(null); setRefund(null); await load(); } }
    catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <div id="billing" className="bill-root">
    <Panel><span className="bill-eyebrow">Your membership, your choice</span><h2>Billing &amp; Subscriptions</h2><p>One place for Plus, your paid communities, and owner earnings.</p>
      <Notice error>{error}</Notice>
      {activating && <Notice>{pending || !data ? 'Activating membership — waiting for verified payment confirmation. Returning from Checkout does not grant access.' : 'Check the verified subscription statuses below. Access is available only for confirmed memberships.'}</Notice>}
      {canceled && <Notice>Checkout canceled. No membership has been activated from this redirect.</Notice>}
      {!data && !error && <p role="status">Loading your billing details…</p>}
      {data && <><div className="bill-tabs" role="tablist" aria-label="Billing views" onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'memberships':e.key==='End'?'owner':tab==='owner'?'memberships':'owner';setTab(next);document.getElementById(`bill-tab-${next}`)?.focus();}}}>{[['memberships','My subscriptions'],['owner','Owner earnings']].map(([key,title]) => <Button key={key} role="tab" id={`bill-tab-${key}`} aria-controls={`bill-panel-${key}`} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={() => setTab(key)} className={tab===key ? '' : 'bill-secondary'}>{title}</Button>)}</div>
      <AnimatePresence mode="wait"><motion.div key={tab} role="tabpanel" id={`bill-panel-${tab}`} aria-labelledby={`bill-tab-${tab}`} initial={{opacity: reduce ? 1 : 0}} animate={{opacity:1}} exit={{opacity:reduce ? 1 : 0}} transition={{duration:reduce ? 0 : .18}}>
      {tab==='memberships' ? <>
        <div className="bill-plus"><div><span className="bill-eyebrow">TrueHive Plus</span><h3>{data.plus ? 'A little more room to belong' : 'Make more of your community'}</h3><p>Unlimited free-Hive memberships. Create up to three active Hives. Verified owners can offer paid memberships.</p></div><Status value={data.plus ? 'active' : 'free'} /></div>
        {!data.plus && !data.subscriptions.some(s => s.kind==='plus' && !['canceled','expired','refunded'].includes(s.status)) && <div className="bill-actions"><Button disabled={busy} onClick={() => act('/api/billing/checkout',{interval:'month'},true)}>Plus · $7.99 / month</Button><Button disabled={busy} className="bill-secondary" onClick={() => act('/api/billing/checkout',{interval:'year'},true)}>Plus · $69.99 / year</Button></div>}
        <p className="bill-muted">Plus renews automatically at the selected interval. Cancel at period end. Paid Hive memberships are separate and do not require Plus or use free-Hive slots.</p>
        <div className="bill-subscriptions">{data.subscriptions.map(sub => <Panel key={sub.id}>
          <div className="bill-row"><h3>{sub.kind==='plus' ? 'TrueHive Plus' : sub.hive_name}</h3><Status value={sub.status} /></div>
          <p className="bill-price">{money(sub.price_cents)} <small>/ {sub.interval}</small></p>
          {sub.cancellation_requested_at&&!sub.cancel_at_period_end&&<Notice>Cancellation requested. Waiting for Stripe confirmation; retries continue automatically.</Notice>}
          <p>{sub.cancel_at_period_end ? 'Cancellation scheduled · paid through' : 'Paid through'} {day(sub.paid_through)}</p>
          {sub.access_until && <p className="bill-muted">Access through {day(sub.access_until)}</p>}
          {['past_due','unpaid'].includes(sub.status) && <Notice error>Payment needs attention. Update your payment method. Failed renewals retain paid access with a three-day grace period.</Notice>}
          {sub.disputed && <Notice>Payment dispute under review. Contact the owner; access decisions are reviewed separately.</Notice>}
          {Number(sub.refunded_cents)>0 && <p>Refunds recorded: {money(sub.refunded_cents)}</p>}
          <div className="bill-actions"><Button className="bill-secondary" disabled={busy || sub.status==='processing'} onClick={() => act(`/api/billing/subscriptions/${sub.id}/portal`,{},true)}>Payment methods &amp; invoices</Button>
          {!sub.cancel_at_period_end && !['processing','canceled','expired','refunded','incomplete_expired'].includes(sub.status) && <Button className="bill-secondary" disabled={busy} onClick={() => setCancel(sub)}>Cancel subscription</Button>}
          {sub.hive_id && <Button className="bill-secondary" disabled={busy || sub.status==='processing'} onClick={()=>{setRefundReason('');setRefund(sub);}}>Request a refund</Button>}</div>
        </Panel>)}</div>
        {!data.subscriptions.length && <p>No subscriptions yet. Free membership remains $0.</p>}
        {(data.refunds||[]).map(r=><div className="bill-row" key={r.stripe_refund_id}><span>Refund ? {r.hive_name||'TrueHive Plus'} ? {money(r.amount_cents)}</span><Status value={r.status}/></div>)}
        {(data.refundRequests||[]).map(r=><Panel key={r.id}><h3>Refund request ? {r.hive_name}</h3><Status value={r.state}/><p>{r.reason}</p>{r.owner_response&&<p>Owner response: {r.owner_response}</p>}</Panel>)}
        <ExpandableDetails title="Invoice history">{data.invoices.map(i => <div className="bill-row" key={i.stripe_invoice_id}><span>{i.hive_name || 'TrueHive Plus'} · {day(i.created_at)}</span><span>{money(i.amount_paid_cents)} {trustedStripeURL(i.hosted_invoice_url,'invoice') && <a href={trustedStripeURL(i.hosted_invoice_url,'invoice')} target="_blank" rel="noreferrer">View invoice</a>}</span></div>)}{!data.invoices.length && <p>No invoices yet.</p>}</ExpandableDetails>
      </> : <>
        <div className="bill-row"><h3>Your Stripe connection</h3><Status value={data.connection?.status} /></div><p>Stripe handles identity verification and payout details. Keep your paid members informed about benefits, cancellations, and refund requests.</p>
        <div className="bill-actions"><Button disabled={busy || !data.plus} onClick={() => act('/api/billing/connect/onboard',{},true)}>{data.connection ? 'Resume Stripe onboarding' : 'Connect with Stripe'}</Button><Button className="bill-secondary" disabled={busy || !data.connection} onClick={() => act('/api/billing/connect/refresh')}>Refresh verification</Button><Button className="bill-secondary" disabled={busy || !data.connection} onClick={async () => { setBusy(true); try { setFinances(await api.get('/api/billing/connect/finances')); } catch(e) { setError(e.message); } finally {setBusy(false);} }}>View balances &amp; payouts</Button></div>
        {data.ownedHives.map(h => <div className="bill-row" key={h.hive_id}><Link to={`/hive/${h.hive_id}/billing`}>{h.hive_name} · Monetization</Link><Status value={h.state} /></div>)}
        {!data.ownedHives.length && <p>Your paid Hives will appear here after configuration.</p>}
        {finances && <><h3>Stripe account balances</h3><p className="bill-muted">Account-wide balances across your Hives. Pending balances are not guaranteed payouts.</p>{finances.available.map((b,i) => <p key={`a${i}`}>Available: {money(b.amount,b.currency)} {b.currency.toUpperCase()}</p>)}{finances.pending.map((b,i) => <p key={`p${i}`}>Pending: {money(b.amount,b.currency)} {b.currency.toUpperCase()}</p>)}{finances.payouts.map(p => <div className="bill-row" key={p.id}><span>{money(p.amount,p.currency)} · {day(p.arrival_date*1000)}</span><Status value={p.status}/></div>)}</>}
      </>}
      </motion.div></AnimatePresence></>}
    </Panel>
    <ConfirmDialog open={Boolean(cancel)} title="Cancel subscription?" busy={busy} onClose={() => setCancel(null)} onConfirm={() => act(`/api/billing/subscriptions/${cancel.id}/cancel`)} confirmLabel="Cancel at period end">
      <p>{cancel?.kind==='plus' ? 'TrueHive Plus' : cancel?.hive_name} · {money(cancel?.price_cents)} / {cancel?.interval}</p><p>Access continues through {day(cancel?.paid_through)}. Future renewals stop. If you operate paid Hives, losing Plus pauses new subscriptions and schedules existing memberships to end at their paid-period boundaries.</p>
    </ConfirmDialog>
    <ConfirmDialog open={Boolean(refund)} title="Request a refund" busy={busy} cancelLabel="Back to billing" confirmLabel="Send refund request" onClose={()=>setRefund(null)} onConfirm={()=>act(`/api/billing/subscriptions/${refund.id}/refund-request`,{reason:refundReason})}>
      <p>{refund?.hive_name} ? Your Hive owner handles refund requests, subject to applicable law and platform procedures. This sends a request for the latest payment that has not been fully refunded; it does not issue a refund automatically.</p><label>Reason for your request<textarea value={refundReason} onChange={e=>setRefundReason(e.target.value)} maxLength={2000}/></label>
    </ConfirmDialog>
  </div>;
}
