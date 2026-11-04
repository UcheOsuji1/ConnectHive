import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pool,query} from '../db/index.js';
if(process.env.P73A_LOCAL_POSTGRES!=='1')throw new Error('Local staging only.');
const run=(file,args)=>new Promise((resolve,reject)=>{const p=spawn(file,args,{windowsHide:true,stdio:'ignore'});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(new Error(`pg_ctl exited ${code}`)));});
const root=join(tmpdir(),'truehive-73a-postgres'),data=join(root,'isolated-data'),bin=join(root,'runtime/pgsql/bin/pg_ctl.exe');
const actual=(await query('SHOW data_directory')).rows[0].data_directory;
assert.equal(resolve(actual).toLowerCase(),resolve(data).toLowerCase(),'Refuse to restart any other PostgreSQL cluster.');
const connection=await pool.connect();connection.on('error',()=>{});const marker=randomUUID();
try {
 await connection.query('BEGIN');await connection.query(`INSERT INTO billing_audit(action,detail) VALUES('restart_uncommitted',$1)`,[JSON.stringify({marker})]);
 await run(bin,['-D',data,'-m','fast','-w','stop'],{windowsHide:true});
 await assert.rejects(()=>connection.query('COMMIT'));
 console.log('PASS PostgreSQL shutdown aborts in-flight transaction');
 await run(bin,['-D',data,'-l',join(root,'isolated-postgres.log'),'-o','-h 127.0.0.1 -p 55474','-w','start'],{windowsHide:true});
 const {rows}=await query(`SELECT 1 FROM billing_audit WHERE detail->>'marker'=$1`,[marker]);assert.equal(rows.length,0);
 console.log('PASS restart retains committed schema and rolls back uncommitted financial audit');
 assert.equal((await query('SELECT 1 ok')).rows[0].ok,1);console.log('PASS connection pool recovers after actual PostgreSQL restart');
}finally{connection.release(true);await pool.end();}
