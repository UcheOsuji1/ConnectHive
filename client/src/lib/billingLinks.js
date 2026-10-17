const hosts={checkout:['checkout.stripe.com'],portal:['billing.stripe.com'],connect:['connect.stripe.com'],invoice:['invoice.stripe.com','pay.stripe.com']};
export function trustedStripeURL(value,kind) {
  if(typeof value!=='string'||/[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&hosts[kind]?.includes(url.hostname)?url.href:null; }
  catch {return null;}
}
export function redirectToStripe(value,kind) {
  const url=trustedStripeURL(value,kind);
  if(!url)throw new Error('The secure Stripe link could not be verified. Please try again.');
  window.location.assign(url);
}
