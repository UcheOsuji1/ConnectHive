import {query} from '../db/index.js';
import {fail} from './billingStore.js';
import {stripeOptions} from './stripe.js';
const id=value=>typeof value==='string'?value:value?.id;
export function validHivePrice(p,amount) {
  return p?.active===true&&p.livemode===false&&p.currency==='usd'&&p.unit_amount===amount&&
    p.type==='recurring'&&p.recurring?.interval==='month'&&p.recurring.interval_count===1&&
    p.product?.active===true&&p.product.livemode===false;
}
export async function hiveCatalogPrice({hiveId,account,amount,allowMissing=false},sdk,db={query}) {
  const options=stripeOptions(account);
  const catalog=await sdk.prices.list({active:true,type:'recurring',limit:100,expand:['data.product']},options);
  if(catalog.has_more)fail('Hive catalog requires reconciliation before Checkout.',503);
  const candidates=new Set(catalog.data.filter(p=>validHivePrice(p,amount)&&
    (p.metadata?.truehive_hive_id===hiveId||p.product.metadata?.truehive_hive_id===hiveId)).map(p=>p.id));
  // Legacy catalog prices have no Hive metadata. Prove ownership through an
  // existing local subscription and its current Stripe reservation/customer.
  // Stripe's archived inline prices are deliberately excluded: they cannot be
  // reused. Publication/lazy migration creates one canonical reusable binding.
  const {rows}=await db.query(`SELECT id,stripe_subscription_id,stripe_customer_id FROM billing_subscriptions
    WHERE hive_id=$1 AND stripe_account_id=$2 AND price_cents=$3 AND interval='month'
    AND stripe_subscription_id IS NOT NULL ORDER BY created_at LIMIT 101`,[hiveId,account,amount]);
  if(rows.length>100)fail('Hive price bindings require reconciliation.',503);
  for(const row of rows) {
    const sub=await sdk.subscriptions.retrieve(row.stripe_subscription_id,{},options);
    if(sub.livemode!==false||sub.metadata?.truehive_subscription_id!==row.id||id(sub.customer)!==row.stripe_customer_id||sub.items?.data?.length!==1||sub.items.data[0].quantity!==1)
      fail('Hive catalog subscription binding is invalid.',503);
    const priceId=id(sub.items.data[0].price);
    const price=catalog.data.find(p=>p.id===priceId);
    if(price&&validHivePrice(price,amount))candidates.add(priceId);
  }
  if(!candidates.size&&allowMissing)return null;
  if(candidates.size!==1)fail('A unique approved Hive catalog price must exist before Checkout.',503);
  return [...candidates][0];
}
export async function ensureHiveCatalogPrice({hiveId,account,amount,revision,name},sdk,db={query}) {
  const existing=await hiveCatalogPrice({hiveId,account,amount,allowMissing:true},sdk,db);
  if(existing)return existing;
  const options=stripeOptions(account),productId=`truehive_hive_${hiveId}`;
  let product;
  try {product=await sdk.products.retrieve(productId,{},options);}
  catch(error){if(error.code!=='resource_missing')throw error;
    product=await sdk.products.create({id:productId,name,metadata:{truehive_hive_id:hiveId}},stripeOptions(account,`hive-product-${hiveId}`));}
  if(product.livemode!==false||!product.active||product.metadata?.truehive_hive_id!==hiveId)fail('Hive product binding is invalid.',503);
  const key=`hive-${hiveId}-r${revision}-usd-${amount}-month`;
  const price=await sdk.prices.create({product:product.id,currency:'usd',unit_amount:amount,recurring:{interval:'month'},lookup_key:key,
    metadata:{truehive_hive_id:hiveId,truehive_revision:String(revision)}},stripeOptions(account,key));
  if(!validHivePrice({...price,product},amount))fail('Stripe returned an invalid Hive price.',503);
  return price.id;
}
