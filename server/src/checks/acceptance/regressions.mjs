// Repeatable non-financial regression entry point. Requires sandbox services.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const server=fileURLToPath(new URL('../../../',import.meta.url)),client=path.resolve(server,'../client');
const isolated=['prompt73','prompt73a-fees','prompt73a-security','prompt73a-concurrency','prompt73a-system','prompt73a-inbox','prompt73a-lifecycle','prompt73a-worker','prompt73a-connect-callbacks','prompt73a-real-cancellation-expiry','prompt73a-real-renewal-grace','prompt73a-durable-nonces','prompt73a-acceptance-cleanup','prompt73a-real-dispute-accounting'];
const tests=isolated.map(name=>({name,cwd:server,args:['--import','./src/checks/prompt73a-dev-preload.mjs',`src/checks/${name}.mjs`],env:{P73A_VERIFIED_DEV_TESTS:'1',BILLING_CALLBACK_ORIGIN:'http://localhost:5183'}}));
for(const name of ['prompt73a-catalog','prompt73a-clock-checkout','prompt73a-acceptance-budget','prompt73a-glob-compatibility','prompt73a-refund-accounting','prompt73a-retry-schedule'])tests.push({name,cwd:server,args:[`src/checks/${name}.mjs`]});
for(const browser of ['chromium','firefox','webkit'])tests.push({name:'browser-'+browser,cwd:client,args:['src/checks/prompt73-browser.mjs'],env:{P73_BASE_URL:'http://localhost:5193',P73A_BROWSER_RUN:'1',P73_BROWSER:browser}});
tests.push({name:'sanitization',cwd:client,args:['src/checks/prompt73a-sanitization.mjs']});
if(process.argv.includes('--list')){console.log(tests.map(t=>t.name).join('\n'));process.exit(0);}
const logs=path.join(server,'sandbox.local','regressions');fs.mkdirSync(logs,{recursive:true});
const results=[];
for(const test of tests){
  console.log('RUN '+test.name);const result=spawnSync(process.execPath,test.args,{cwd:test.cwd,env:{...process.env,...test.env,SENTRY_AUTH_TOKEN:''},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:16*1024*1024});
  fs.writeFileSync(path.join(logs,test.name+'.log'),(result.stdout||'')+(result.stderr||''));
  results.push({name:test.name,status:result.status===0?'PASS':'FAIL',exit:result.status,signal:result.signal});
  fs.writeFileSync(path.join(logs,'results.json'),JSON.stringify(results,null,2));console.log(results.at(-1).status+' '+test.name);
  if(result.status!==0){process.exitCode=1;console.log('Stopped; inspect private log before retry. No financial suite was invoked.');break;}
}
