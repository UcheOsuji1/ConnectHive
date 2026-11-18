// check:gender (Prompt 88) — proves lib/genderPolicy.js fits() and SQL
// gender_fits() (schema.sql) agree for every policy × gender combination.
//
// Runs the real function definition, extracted from schema.sql, inside an
// in-process PGlite database: no network, no DATABASE_URL, nothing else.
// PGlite lives outside the repo (same convention as prompt71b-isolated.mjs):
//   npm install --prefix "$TMP/truehive-p88-tools" @electric-sql/pglite
// or point P88_TEST_TOOLS at any folder that has it installed.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { POLICY_KEYS, GENDERS, fits } from '../lib/genderPolicy.js';

const tools = process.env.P88_TEST_TOOLS || join(tmpdir(), 'truehive-p88-tools');
let PGlite;
try {
  const require = createRequire(join(tools, 'package.json'));
  ({ PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href));
} catch {
  console.error(`FAIL check:gender needs PGlite in ${tools}`);
  console.error(`     npm install --prefix "${tools}" @electric-sql/pglite`);
  process.exit(1);
}

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const fn = schema.match(/CREATE OR REPLACE FUNCTION gender_fits\([\s\S]*?\n\$\$;/);
if (!fn) {
  console.error('FAIL gender_fits() not found in schema.sql');
  process.exit(1);
}

const db = new PGlite();
await db.exec(fn[0]);

let failures = 0;
const genders = [...GENDERS, null];
for (const policy of POLICY_KEYS) {
  for (const gender of genders) {
    const { rows: [r] } = await db.query('SELECT gender_fits($1, $2) AS ok', [policy, gender]);
    const js = fits(policy, gender);
    if (r.ok !== js) {
      failures++;
      console.error(`FAIL ${policy} × ${gender ?? 'unset'}: SQL ${r.ok}, JS ${js}`);
    }
  }
}
const total = POLICY_KEYS.length * genders.length;
if (failures) {
  console.error(`\n${failures}/${total} combinations disagree.`);
  process.exit(1);
}
console.log(`PASS gender_fits() (SQL) and fits() (JS) agree on all ${total} policy × gender combinations.`);
