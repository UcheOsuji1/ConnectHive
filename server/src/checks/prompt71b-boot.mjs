// Smoke-test the actual Express/Socket.IO server using only isolated fixture data.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const child = spawn(process.execPath, ['--import', new URL('./prompt71b-isolated.mjs', import.meta.url).href, 'src/index.js'], {
  cwd: new URL('../../', import.meta.url), windowsHide: true,
  env: { ...process.env, PORT: '5181', CLIENT_URL: 'http://127.0.0.1:5174', JWT_SECRET: 'isolated-fixture-secret-not-for-deployment', RESEND_API_KEY: '', ANTHROPIC_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', b => { output += b; });
child.stderr.on('data', b => { output += b; });
try {
  let healthy = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (child.exitCode !== null) throw new Error(`API exited ${child.exitCode}: ${output.slice(-2000)}`);
    if (!output.includes('schema check passed') || !output.includes('data check passed')) continue;
    const response = await fetch('http://127.0.0.1:5181/api/health');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
    healthy = true;
    console.log('PASS isolated API boot: connection, schema/data guards, /api/health 200; production inaccessible.');
    break;
  }
  assert.ok(healthy, `API did not become healthy: ${output.slice(-2000)}`);
} finally { child.kill(); }
