import '../env.js';
import {stripe} from '../lib/stripe.js';
import {pool} from '../db/index.js';
import {startBillingJob} from './billingJob.js';
stripe(); // Reject absent/live credentials before starting a worker.
if(!process.env.DATABASE_URL)throw new Error('A staging database is required.');
startBillingJob({standalone:true});
const keepAlive=setInterval(()=>{},60_000);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{clearInterval(keepAlive);await pool.end();process.exit(0);});
