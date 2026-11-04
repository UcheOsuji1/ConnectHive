import { useEffect, useRef, useState, useId } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import '../../styles/billing.css';
export const money = (cents,currency='USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(cents || 0)/100);
export const day = value => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Awaiting confirmation';
export const label = value => String(value || 'not connected').replaceAll('_', ' ');
export function Panel({ children, ...props }) {
  const reduce = useReducedMotion();
  return <motion.section {...props} className={`bill-card ${props.className || ''}`} initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : .22 }}>{children}</motion.section>;
}
export function Button({ children, ...props }) {
  const reduce = useReducedMotion();
  return <motion.button type="button" {...props} className={`bill-btn ${props.className || ''}`} whileHover={reduce || props.disabled ? {} : { y: -1 }} whileTap={reduce || props.disabled ? {} : { scale: .98 }} transition={{ duration: .14 }}>{children}</motion.button>;
}
export function Status({ value }) { return <span className={`bill-status bill-status--${value}`}>{label(value)}</span>; }
export function Notice({ children, error = false }) {
  const reduce = useReducedMotion();
  return <AnimatePresence>{children && <motion.p className={`bill-notice ${error ? 'bill-error' : ''}`} role={error ? 'alert' : 'status'} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .18 }}>{children}</motion.p>}</AnimatePresence>;
}
export function ConfirmDialog({ open, title, children, onClose, onConfirm, busy, confirmLabel = 'Confirm', cancelLabel = 'Keep membership' }) {
  const ref = useRef(null), reduce = useReducedMotion();
  const desiredOpen=useRef(open);
  desiredOpen.current=open;
  const heldChildren=useRef(children);
  if(open)heldChildren.current=children;
  const titleId=useId();
  useEffect(() => { if (open && !ref.current.open) ref.current.showModal(); }, [open]);
  return <dialog ref={ref} className="bill-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <motion.div initial={false} animate={{ opacity: open ? 1 : 0, y: reduce ? 0 : open ? 0 : 8 }} transition={{ duration: reduce ? 0 : .2 }} onAnimationComplete={()=>{if(!desiredOpen.current&&ref.current?.open)ref.current.close();}}>
      <h3 id={titleId}>{title}</h3>{open?children:heldChildren.current}
      <div className="bill-actions"><Button className="bill-secondary" onClick={onClose} disabled={busy||!open}>{cancelLabel}</Button><Button onClick={onConfirm} disabled={busy||!open}>{busy ? 'Saving…' : confirmLabel}</Button></div>
    </motion.div>
  </dialog>;
}
export function ExpandableDetails({ title, children }) {
  const [open,setOpen]=useState(false), reduce=useReducedMotion();
  return <div className="bill-details"><Button className="bill-secondary" aria-expanded={open} aria-controls="bill-invoice-details" onClick={()=>setOpen(!open)}>{title}</Button><AnimatePresence initial={false}>{open&&<motion.div id="bill-invoice-details" initial={{height:reduce?'auto':0,opacity:reduce?1:0}} animate={{height:'auto',opacity:1}} exit={{height:reduce?'auto':0,opacity:reduce?1:0}} transition={{duration:reduce?0:.22}} style={{overflow:'hidden'}}>{children}</motion.div>}</AnimatePresence></div>;
}
export const emptyConfig = { mode: 'free', monthlyPrice: '', benefits: '', description: '', cancellationPolicy: 'Cancel at the end of your current paid period. Access continues until your paid-through date.' };
export function configPayload(config) {
  const valid = /^\d+(\.\d{1,2})?$/.test(config.monthlyPrice);
  const [dollars, cents = ''] = config.monthlyPrice.split('.');
  return { ...config, monthlyPriceCents: valid ? Number(dollars)*100 + Number(cents.padEnd(2,'0')) : 0 };
}
export function MonetizationForm({ value, onChange, plus, showMode = true }) {
  const set = (key, v) => onChange({ ...value, [key]: v });
  const price = configPayload(value).monthlyPriceCents;
  return <div className="bill-form bill-root">
    {showMode && <fieldset><legend>Membership access</legend><div className="bill-choice"><label><input type="radio" name="membership-mode" checked={value.mode === 'free'} onChange={() => set('mode','free')} /> Free Hive</label><label><input type="radio" name="membership-mode" checked={value.mode === 'paid'} onChange={() => set('mode','paid')} /> Paid monthly membership</label></div></fieldset>}
    {value.mode === 'paid' && <Panel>
      <h3>Build something worth belonging to</h3>
      <p>Paid Hives require active TrueHive Plus, Stripe identity and payout verification, and TrueHive review before publication. Members do not need Plus.</p>
      {!plus && <Notice>Upgrade to <a href="/settings#billing">TrueHive Plus</a> to offer paid memberships.</Notice>}
      <label>Monthly price (USD)<input inputMode="decimal" value={value.monthlyPrice} onChange={e => set('monthlyPrice', e.target.value)} placeholder="12.00" maxLength={10} /></label>
      <label>Ongoing member benefits<textarea value={value.benefits} onChange={e => set('benefits',e.target.value)} minLength={30} maxLength={8000} placeholder="Weekly coaching sessions, curated resources, and a monthly workshop…" /></label>
      <label>What members receive<textarea value={value.description} onChange={e => set('description',e.target.value)} minLength={30} maxLength={8000} /></label>
      <label>Cancellation policy<textarea value={value.cancellationPolicy} onChange={e => set('cancellationPolicy',e.target.value)} minLength={30} maxLength={8000} /></label>
      <dl className="bill-breakdown"><div><dt>Monthly member price</dt><dd>{money(price)}</dd></div><div><dt>TrueHive platform fee · 10%</dt><dd>{money(Math.round(price*.1))}</dd></div><div><dt>Stripe processing costs</dt><dd>Vary by payment method</dd></div><div><dt>Estimated proceeds before processing</dt><dd>{money(price-Math.round(price*.1))}</dd></div></dl>
      <p className="bill-muted">Estimates are not guaranteed payouts. Processing, refunds, disputes, and adjustments reduce proceeds. Prices and benefits are locked while subscriptions have obligations. Paid Hives use open admission after verified payment. Capacity uses your existing Hive member limit.</p>
    </Panel>}
  </div>;
}
