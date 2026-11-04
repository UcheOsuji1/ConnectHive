// Exercise the exact Sentry wrapper after the scoped transitive security override.
import {globFiles} from '../../node_modules/@sentry/bundler-plugins/build/esm/core/glob.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'p73a-sentry-glob-'));
try {
  fs.mkdirSync(path.join(root,'nested'));for(const name of ['a.js','b.js.map','nested/c.js'])fs.writeFileSync(path.join(root,name),'fixture');
  const matches=await globFiles(['**/*.js','**/*.map'],{cwd:root,ignore:['**/*.map']});
  assert.equal(matches.length,2);assert(matches.every(path.isAbsolute));assert(matches.every(p=>p.endsWith('.js')));
  console.log('GLOB: 3 compatibility checks passed; no network or upload.');
}finally{fs.unlinkSync(path.join(root,'nested/c.js'));fs.rmdirSync(path.join(root,'nested'));for(const f of ['a.js','b.js.map'])fs.unlinkSync(path.join(root,f));fs.rmdirSync(root);}
