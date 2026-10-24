// Playwright local (npm install) sinon installation globale
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
const EXP={g1:[42,'HTP précapillaire'],g2i:[30,'HTP post-capillaire isolée'],g2c:[42,'HTP post-capillaire combinée'],g3:[27,'HTP précapillaire'],g4:[44,'HTP précapillaire'],g5:[34,'HTP précapillaire'],hd:[24,'HTP non classée']};
(async()=>{ const b=await chromium.launch(); const fails=[]; const ok=(c,m)=>{ if(!c) fails.push(m); };
 for (const [n,vp,scheme] of [['desktop1366',{width:1366,height:768},'light'],['mobile320',{width:320,height:700},'dark']]) {
  const p=await b.newPage({viewport:vp,colorScheme:scheme}); const errs=[];
  p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  const hscroll=async(tag)=>{ const w=await p.evaluate(()=>document.documentElement.scrollWidth); ok(w<=vp.width, `${n} défilement horizontal (${w}px) à ${tag}`); };
  await p.goto('http://localhost:8765/index.html'); await p.click('[data-tab="tab-htp"]'); await p.waitForFunction(()=>window.HTP); await p.waitForTimeout(300); await hscroll('ouverture');
  // Cas cliniques (mode avancé)
  await p.evaluate(()=>{document.getElementById('htp-adv').open=true;});
  for (const [k,[mp,prof]] of Object.entries(EXP)) { await p.click(`[data-preset="${k}"]`); await p.waitForTimeout(1400);
   const r=await p.evaluate(()=>[document.getElementById('htp-mpap').textContent, document.getElementById('htp-profile').textContent]);
   ok(+r[0]===mp && r[1]===prof, `${n} cas ${k}: ${r} attendu ${mp} ${prof}`); }
  // Curseurs : seuils
  for (const [pvr,pawp,co,exp] of [[2,15,3,'HTP non classée'],[2,14,3,"Pas d'HTP"],[2.1,15,3,'HTP précapillaire'],[2,16,3,'HTP post-capillaire isolée'],[2.1,16,3,'HTP post-capillaire combinée']]) {
   await p.evaluate(([a,b,c])=>{const s=(id,v)=>{const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('input'));}; s('htp-pvr',a);s('htp-pawp',b);s('htp-co',c);},[pvr,pawp,co]);
   const got=await p.textContent('#htp-profile'); ok(got===exp, `${n} seuil RVP ${pvr} PAPO ${pawp} DC ${co}: ${got} attendu ${exp}`); }
  // Comparaison au normal : schéma de référence, tableau, mécanisme du groupe
  ok(await p.locator('#htp-ref svg').count()===1, `${n} schéma de référence`);
  await p.click('.htp-gbtn[data-preset="g2i"]'); await p.waitForTimeout(1400);
  ok((await p.textContent('#htp-case-title'))==='G2 · post-capillaire isolée', `${n} titre du cas G2`);
  ok(await p.locator('#htp-c-pawp.is-high').count()===1 && await p.locator('#htp-c-pvr.is-high').count()===0, `${n} tableau G2 : PAPO ↑, RVP normale`);
  ok(await p.locator('#htp-mech').isVisible() && (await p.textContent('#htp-mech summary')).includes('groupe 2'), `${n} mécanisme du groupe 2`);
  await p.click('.htp-gbtn[data-preset="hd"]'); await p.waitForTimeout(1400);
  ok(!(await p.locator('#htp-mech').isVisible()) && await p.locator('#htp-c-co.is-high').count()===1, `${n} hyperdébit : DC ↑, pas de groupe`);
  await p.evaluate(()=>{const e=document.getElementById('htp-pvr');e.value=6;e.dispatchEvent(new Event('input'));});
  ok((await p.textContent('#htp-case-title'))==='Vos valeurs' && await p.locator('.htp-gbtn.is-on').count()===0, `${n} valeurs libres`);
  await hscroll('comparaison');
  // Quiz complet
  let expected=0;
  const NQ=+(await p.textContent('.htp-quiz-n')).split('/')[1]; for (let i=0;i<NQ;i++){ await p.click('#htp-quiz-body .htp-opt[data-opt="0"]'); if (await p.locator('#htp-quiz-body .htp-opt[data-opt="0"].is-right').count()) expected++;
   ok(await p.locator('#htp-quiz-body .htp-opt.is-right').count()===1, `${n} quiz q${i+1} correction`); await p.click('[data-quiz="next"]'); }
  const end=await p.textContent('.htp-quiz-end'); ok(end.includes(`${expected} / ${NQ}`), `${n} score final ${end} attendu ${expected}`);
  // Lexique
  ok(await p.locator('.htp-term').count()>20, `${n} lexique`);
  // Lien patient depuis le calculateur
  await p.click('[data-tab="tab-calculator"]');
  await p.evaluate(()=>{const t=document.getElementById('tr_vel');t.value='3.2';t.dispatchEvent(new Event('input'));document.getElementById('ra_area').value='20';document.getElementById('btn-htp-link').click();});
  await p.waitForTimeout(1500); ok(await p.locator('#tab-htp.active').count()===1 && await p.locator('#htp-patient').isVisible(), `${n} lien patient`);
  ok((await p.textContent('#htp-patient')).includes('PAPm ≈ '+(await p.textContent('#htp-mpap'))), `${n} cohérence PAPm bandeau/simulateur`);
  await hscroll('fin');
  ok(errs.length===0, `${n} erreurs console: ${errs.join(' | ')}`);
  await p.close(); }
 console.log(fails.length? 'ÉCHECS:\n'+fails.join('\n') : 'TOUT OK'); if (fails.length) process.exitCode = 1; await b.close(); })();
