// Actual browser DOMPurify/marked integration. No Stripe or backend mutation.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
let count=0;
for(const [name,engine] of Object.entries({chromium,firefox,webkit})) {
  const browser=await engine.launch();
  try {
    const page=await browser.newPage();
    await page.route('**/api/**',r=>r.abort());
    await page.goto(process.env.P73_BASE_URL||'http://localhost:5193');
    const result=await page.evaluate(async()=>{
      const {renderMarkdown}=await import('/src/lib/safeMarkdown.js');
      const hostile=['<script>alert(1)</script>','<img src=x onerror=alert(1)>','<svg><a onload=alert(1)>x</a></svg>',
        '[x](javascript:alert%281%29)','<a href="data:text/html,x" onclick="alert(1)">x</a>',
        '<math><mtext><img src=x onerror=alert(1)></mtext></math>','<form><input autofocus onfocus=alert(1)></form>'];
      const safe=hostile.map(raw=>{const el=document.createElement('div');el.innerHTML=renderMarkdown(raw);
        return !el.querySelector('script,img,svg,math,form,input,iframe')&&[...el.querySelectorAll('*')].every(n=>
          [...n.attributes].every(a=>!/^on/i.test(a.name))&&(!n.hasAttribute('href')||/^(https?|mailto):/i.test(n.getAttribute('href'))));});
      const el=document.createElement('div');el.innerHTML=renderMarkdown('**bold** [safe](https://example.com)');
      const a=el.querySelector('a');return {safe,format:el.querySelector('strong')?.textContent==='bold',link:a?.target==='_blank'&&a?.rel==='noopener noreferrer'};
    });
    assert(result.safe.every(Boolean));assert(result.format);assert(result.link);count+=result.safe.length+2;
    console.log(`PASS ${name}: hostile HTML/URLs stripped, formatting and safe links retained`);
  } finally {await browser.close();}
}
console.log(`SANITIZATION: ${count} real-browser checks passed.`);
