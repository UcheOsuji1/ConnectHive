// Smoke-boot the actual API using read-only database sessions and no email/AI keys.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const child = spawn(process.execPath, ['src/index.js'], {
  cwd: new URL('../../', import.meta.url), windowsHide: true,
  env: { ...process.env, PORT: '5001', CLIENT_URL: 'http://127.0.0.1:5173', PGOPTIONS: '-c default_transaction_read_only=on', RESEND_API_KEY: '', ANTHROPIC_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', b => { output += b; });
child.stderr.on('data', b => { output += b; });
try {
  let healthy = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (child.exitCode !== null) throw new Error(`API exited with code ${child.exitCode}`);
    if (!output.includes('schema check passed') || !output.includes('data check passed')) continue;
    const response = await fetch('http://127.0.0.1:5001/api/health');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    healthy = true;
    console.log('PASS actual API boot: database connected, schema guard passed, default-channel guard passed, /api/health 200');
    break;
  }
  assert.ok(healthy, 'API did not become healthy within 30 seconds');
  console.log('Background-job writes prevented by read-only DB sessions; email and AI disabled for smoke test.');
} finally {
  child.kill();
}
