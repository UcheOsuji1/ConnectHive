// Explicit local staging cluster only. Never infer a target from server/.env.
const url=process.env.STAGING_DATABASE_URL || 'postgresql://truehive73a@127.0.0.1:55474/truehive_73a_staging';
const target=new URL(url);
if (!['127.0.0.1','localhost'].includes(target.hostname) || target.pathname!=='/truehive_73a_staging') throw new Error('Local PostgreSQL fixture target required. Hosted staging needs separate verification.');
process.env.DATABASE_URL=url;
process.env.P73A_LOCAL_POSTGRES='1';
process.env.P71B_ISOLATED='1';
process.env.RESEND_API_KEY='';process.env.ANTHROPIC_API_KEY='';
const {pool}=await import('../db/index.js');
const {readFile,readdir}=await import('node:fs/promises');
const {randomUUID}=await import('node:crypto');
const schema=`prompt73a_${randomUUID().replaceAll('-','')}`;
pool.options.options=`-c search_path=${schema},public`;
const connection=await pool.connect();
try {
  await connection.query(`CREATE SCHEMA ${schema}`);
  await connection.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));
  await connection.query(await readFile(new URL('../db/billing.sql',import.meta.url),'utf8'));
  for(const f of (await readdir(new URL('../db/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())
    await connection.query(await readFile(new URL(`../db/migrations/${f}`,import.meta.url),'utf8'));
} finally {connection.release();}
// Every connection uses the same private synthetic schema via startup options.
const client=await pool.connect();
await client.query('CREATE TABLE IF NOT EXISTS fixture_marker (test_only BOOLEAN NOT NULL DEFAULT TRUE)');
client.release();
pool.isolatedExec=sql=>pool.query(sql);
console.log('Actual local PostgreSQL: explicit loopback staging database, synthetic fixture schema.');
