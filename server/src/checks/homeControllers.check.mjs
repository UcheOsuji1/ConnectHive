import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
// Exercise real controller handlers with an isolated database adapter. No real account data is changed.
let replies=[], queries=[];
const context=vm.createContext({console});
const source=readFileSync(new URL('../controllers/postsController.js',import.meta.url),'utf8');
const mod=new vm.SourceTextModule(source,{context});
await mod.link(async spec=>{
 let exports;
 if(spec.includes('db/index'))exports={query:async(sql,args)=>{queries.push({sql,args}); const next=replies.shift();if(next instanceof Error)throw next;return next??{rows:[]};}};
 else if(spec.includes('notificationsController'))exports={createNotification:async()=>{}};
 else if(spec.includes('hiveMembership'))exports={getMembership:async()=>null};
 else if(spec.includes('systemUser'))exports={excludeSystemClause:()=>"TRUE"};
 else if(spec.includes('homeFeed')) { const {homeFeedOptions}=await import('../lib/homeFeed.js'); exports={homeFeedOptions}; }
 else throw new Error(spec);
 return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});
});await mod.evaluate();
function response(){return{code:200,body:null,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
const req={userId:'viewer',params:{id:'post'},body:{saved:true},query:{tab:'Following'}};
replies=[{rows:[{hive_id:'private',visibility:'hive'}]},{rows:[{is_member:false,is_following:false}]}];let res=response();queries=[];await mod.namespace.savePost(req,res);assert.equal(res.code,403);assert(!queries.some(q=>q.sql.startsWith('INSERT')));
replies=[{rows:[{hive_id:'private',visibility:'hive'}]},{rows:[{is_member:false,is_following:true}]}];res=response();await mod.namespace.savePost(req,res);assert.equal(res.code,403);
replies=[{rows:[{hive_id:'public',visibility:'public'}]},{rows:[{is_member:false,is_following:true}]},{rows:[]}];res=response();await mod.namespace.savePost(req,res);assert.equal(res.body.saved,true);
replies=[{rows:[{hive_id:'private',author_user_id:'another'}]}];res=response();await mod.namespace.editPost({...req,body:{headline:'Changed'}},res);assert.equal(res.code,403);
replies=[{rows:[]}];queries=[];res=response();await mod.namespace.getFeed(req,res);assert.equal(res.code,200);assert.match(queries[0].sql,/p.visibility = 'public'/);assert.match(queries[0].sql,/membership_status = 'active'/);assert.match(queries[0].sql,/AND EXISTS \(SELECT 1 FROM hive_followers/);
replies=[new Error('offline')];res=response();const old=console.error;console.error=()=>{};await mod.namespace.savePost(req,res);console.error=old;assert.equal(res.code,500);
console.log('PASS: private bookmark denial, follower privacy, public bookmark, edit membership gate, filtered feed privacy, database failure response.');
