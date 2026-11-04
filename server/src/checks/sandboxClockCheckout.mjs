// Sandbox launcher adapter only. Never imported by application boot or routes.
export async function installSandboxClockCheckout({sdk,query,bindings,env=process.env}) {
  if(env.NODE_ENV==='production'||env.PORT!=='5183'||env.BILLING_ENABLED!=='test'||!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')||
    new URL(env.DATABASE_URL).hostname.split('.')[0].replace(/-pooler$/,'')!=='ep-fancy-cherry-at7zftnq')throw Error('Sandbox clock guard failed');
  if((await query("SELECT current_setting('neon.branch_id',true) b")).rows[0].b!=='br-holy-poetry-atkl4gsc')throw Error('Sandbox clock branch guard failed');
  const create=sdk.checkout.sessions.create.bind(sdk.checkout.sessions);
  sdk.checkout.sessions.create=async(params,options)=>{
    const {rows:[local]}=await query(`SELECT s.user_id,s.kind,s.stripe_account_id,u.email FROM billing_subscriptions s JOIN users u USING(user_id) WHERE s.id=$1`,[params.client_reference_id]);
    const binding=bindings()[local?.user_id];
    if(!binding)return create(params,options);
    if(local.kind!=='plus'||local.stripe_account_id!=='platform'||options?.stripeAccount||params.customer||
      !/^prompt73a-lifecycle-[a-z0-9-]+@truehive-test\.invalid$/.test(local.email)||binding.email!==local.email)throw Error('Sandbox fixture binding rejected');
    const customer=await sdk.customers.retrieve(binding.customerId);
    if(customer.deleted||customer.livemode!==false||customer.email!==local.email||customer.metadata?.truehive_user_id!==local.user_id||
      customer.test_clock!==binding.clockId)throw Error('Sandbox clock customer mismatch');
    const clock=await sdk.testHelpers.testClocks.retrieve(binding.clockId);
    if(clock.livemode!==false||clock.status!=='ready')throw Error('Sandbox clock is not ready');
    return create({...params,customer:customer.id},options);
  };
}
