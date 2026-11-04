import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const PLAN={version:1,currency:'usd',account:'acct_1UUV9MRuxbB0fH11',endpoint:'ep-fancy-cherry-at7zftnq',branch:'br-holy-poetry-atkl4gsc',
 limits:{charge:{count:7,cents:12996},refund:{count:3,cents:1700},feeRefund:{count:2,cents:150},failedAttempt:{count:14,cents:11186},dispute:{count:1,cents:799},disputeFees:{count:1,cents:5000},cleanup:{count:7,cents:0}},
 scenarios:['annual-cancellation','plus-partial-refund','hive-full-refund','hive-partial-refund','hive-closure','dispute','retry-exhaustion'],
 resources:{customers:7,clocks:7,subscriptions:7,hives:1,products:1,prices:1},
 cleanup:'Cancel ONLY run-owned subscriptions without proration/invoice; retain financial/user/audit rows and manifest. Never delete shared owner/account or protected fixtures.'};
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
export class Budget {
 constructor({approval,stateFile,now=Date.now()}) {
  if(approval?.approved!==true||approval.planHash!==PLAN_HASH||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(approval.runId)||!Number.isFinite(Date.parse(approval.expiresAt))||Date.parse(approval.expiresAt)<=now||Date.parse(approval.expiresAt)>now+86400000)throw Error('Explicit unexpired scope approval required');
  this.runId=approval.runId;this.file=stateFile;this.approval=approval;
  this.resourceLimits={...PLAN.resources};
  if(approval.resourceAmendment){const a=approval.resourceAmendment;
   if(JSON.stringify(Object.keys(a).sort())!==JSON.stringify(['basePlanHash','hives','kind','prices','products','runId'])||a.kind!=='one-replacement-hive'||a.basePlanHash!==PLAN_HASH||a.runId!==this.runId||a.hives!==1||a.products!==1||a.prices!==1)throw Error('Invalid replacement resource authorization');
   for(const kind of ['hives','products','prices'])this.resourceLimits[kind]++;
  }
  this.state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{runId:this.runId,planHash:PLAN_HASH,used:{},operations:{},fixtures:{},resources:{}};
  if(this.state.runId!==this.runId||this.state.planHash!==PLAN_HASH)throw Error('Journal scope mismatch');
 }
 save(){const temp=this.file+`.tmp.${process.pid}`,fd=fs.openSync(temp,'w');try{fs.writeFileSync(fd,JSON.stringify(this.state,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  // Windows scanners/readers can briefly deny rename despite an exclusive run
  // lock. Keep the reserved journal intact; never repeat a financial callback.
  for(let attempt=0;;attempt++){try{fs.renameSync(temp,this.file);return;}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=20)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}
 }
 own(type,id){if(!id)throw Error('Missing resource ID');const list=this.state.resources[type]||=[];if(!list.includes(id)){if(list.length>=(this.resourceLimits[type]??0))throw Error('Resource cap exceeded');list.push(id);this.save();}return id;}
 assertOwn(type,id){if(!this.state.resources[type]?.includes(id))throw Error('Resource not owned by acceptance run');}
 async operation(label,effects,request,fn){
  if(Date.parse(this.approval.expiresAt)<=Date.now())throw Error('Scope approval expired');
  const hash=createHash('sha256').update(JSON.stringify({effects,request})).digest('hex');let op=this.state.operations[label];
  if(op&&op.hash!==hash)throw Error('Operation parameters changed; refusing duplicate effects');
  if(op?.done)return op.result;
  if(!op){for(const [kind,cents] of Object.entries(effects)){const cap=PLAN.limits[kind],used=this.state.used[kind]||{count:0,cents:0};if(!cap||!Number.isSafeInteger(cents)||cents<0||used.count+1>cap.count||used.cents+cents>cap.cents)throw Error('Approved financial budget exceeded');}
   for(const [kind,cents] of Object.entries(effects)){const used=this.state.used[kind]||={count:0,cents:0};used.count++;used.cents+=cents;}
   op=this.state.operations[label]={hash,pending:true};this.save();}
  const key=`p73a-${this.runId}-${label}`;
  const result=await fn(key);op.result=result;op.done=true;delete op.pending;this.save();return result;
 }
}
