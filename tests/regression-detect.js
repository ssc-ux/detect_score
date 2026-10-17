// Playwright local (npm install) sinon installation globale
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
const CASES=[
 {fvc:95,dlco:38,telang:'yes',aca:'yes',nt:450,urate:6.5,rad:'no',ra:20,tr:3.2},
 {fvc:110,dlco:80,telang:'no',aca:'no',nt:80,urate:4,rad:'no',ra:12,tr:2.3},
 {fvc:70,dlco:30,telang:'yes',aca:'no',nt:2000,urate:9,rad:'yes',ra:28,tr:3.9},
 {fvc:85,dlco:50,telang:'unknown',aca:'yes',nt:300,urate:5,rad:'no',ra:16,tr:2.8},
];
async function run(b,port){ const res=[]; const errs=[];
 for(const c of CASES){ const p=await b.newPage(); p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.dismiss());
  await p.goto(`http://localhost:${port}/index.html`);
  await p.fill('#fvc',''+c.fvc); await p.fill('#dlco',''+c.dlco); await p.fill('#ntprobnp',''+c.nt); await p.fill('#urate',''+c.urate);
  for (const [id,v] of [['telang',c.telang],['aca',c.aca],['rad',c.rad]]) { const sel=`#${id} input[value="${v}"]`; if (await p.locator(sel).count()) await p.locator(sel).evaluate(e=>{e.checked=true;e.dispatchEvent(new Event("change",{bubbles:true}));e.dispatchEvent(new Event("input",{bubbles:true}));}); }
  await p.click('#calc-step1'); await p.waitForTimeout(2000);
  const s1=await p.evaluate(()=>[document.getElementById('s1-points-val').textContent,document.getElementById('s1-exact-score').textContent,document.getElementById('s1-decision').textContent.trim()]);
  let s2=null;
  if (await p.locator('#step2-card:not(.hidden)').count()) { await p.fill('#ra_area',''+c.ra); await p.fill('#tr_vel',''+c.tr); await p.click('#calc-step2'); await p.waitForTimeout(2000);
   s2=await p.evaluate(()=>[document.getElementById('s2-points-val').textContent,document.getElementById('s2-exact-score').textContent,document.getElementById('final-recommendation').textContent.trim()]); }
  res.push({s1,s2}); await p.close(); }
 return {res,errs}; }
(async()=>{ const b=await chromium.launch(); const o=await run(b,8766), n=await run(b,8765);
 console.log('OLD',JSON.stringify(o.res));console.log('NEW',JSON.stringify(n.res)); const same = JSON.stringify(o.res)===JSON.stringify(n.res); if (!same || o.errs.length || n.errs.length) process.exitCode = 1;
 console.log('identiques:', same, 'erreurs old/new:', o.errs, n.errs); await b.close(); })();
