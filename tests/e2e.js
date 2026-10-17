// Playwright local (npm install) sinon installation globale
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;
const EXP={normal:[16,"Pas d'HTP"],g1:[42,'HTP précapillaire'],g2i:[30,'HTP post-capillaire isolée'],g2c:[42,'HTP post-capillaire combinée'],g3:[27,'HTP précapillaire'],g4:[44,'HTP précapillaire'],g5:[34,'HTP précapillaire'],hd:[24,'HTP non classée']};
(async()=>{ const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']}); const fails=[]; const ok=(c,m)=>{ if(!c) fails.push(m); };
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
  // Explorateur pas à pas : chaque groupe, chaque étape
  const EXPSTEP={'2':{2:'HTP post-capillaire isolée',3:'HTP post-capillaire combinée'},'normal':{4:"Pas d'HTP"},'5':{3:'HTP non classée'},'1':{4:'HTP précapillaire'}};
  for (const g of ['normal','1','2','3','4','5']) {
   await p.click(`.htp-gbtn[data-group="${g}"]`); await p.waitForTimeout(150);
   ok(await p.locator('#htp-step-list li').count()===5, `${n} groupe ${g} : 5 étapes`);
   for (let i=0;i<5;i++){ if(i) { await p.click('[data-step="next"]');
     if (await p.locator('#htp-predict').isVisible()) { await p.click('#htp-predict [data-pred="0"]'); await p.click('.htp-predict-go'); } }
    await p.waitForTimeout(1400);
    const cur=await p.locator('#htp-step-list li.is-current .htp-step-btn').getAttribute('data-i'); ok(+cur===i, `${n} groupe ${g} étape ${i} courante=${cur}`);
    const exp=(EXPSTEP[g]||{})[i]; if(exp){ const got=await p.textContent('#htp-profile-mini'); ok(got===exp, `${n} groupe ${g} étape ${i+1}: ${got} attendu ${exp}`); }
    await hscroll('groupe '+g+' étape '+i); }
  }
  await p.click('[data-step="next"]'); await p.waitForTimeout(200);
  ok(await p.locator('.htp-gbtn.is-on[data-group="normal"]').count()===1, `${n} bouclage après G5`);
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
  // 3D
  if (await p.locator('.htp-view-seg').isVisible()) await p.click('.htp-view-seg label:nth-child(2)'); await p.waitForTimeout(2500);
  ok(await p.locator('.htp3d-canvas canvas').count()===1, `${n} 3D chargée`);
  for (const v of ['gauche','dos','oblique','face']) { await p.click(`[data-view="${v}"]`); await p.waitForTimeout(300); }
  await p.evaluate(()=>{document.querySelector('.htp3d-more').open=true;});
  for (const l of ['heart','lungs','vessels','flow','labels']) { await p.click(`label:has([data-layer="${l}"])`); await p.click(`label:has([data-layer="${l}"])`); }
  await p.click('[data-cut="sax"]'); await p.waitForTimeout(900); await p.click('[data-cut="a4c"]'); await p.waitForTimeout(900); ok((await p.textContent('.htp3d-cutinfo')).includes('VD/VG'), n+' info 4 cavités'); await p.click('[data-preset="g4"]'); await p.waitForTimeout(1300);
  await p.locator('.htp3d-stage').screenshot({path:`${(process.argv[2] || require('os').tmpdir())}/e2e-${n}-cut.png`});
  await p.click('[data-cut="none"]'); await p.waitForTimeout(300);
  // Thème : bascule pendant la 3D
  await p.evaluate(()=>{document.documentElement.dataset.theme = document.documentElement.dataset.theme==='dark'?'light':'dark';}); await p.waitForTimeout(300);
  await p.locator('.htp3d-stage').screenshot({path:`${(process.argv[2] || require('os').tmpdir())}/e2e-${n}-3d.png`});
  await hscroll('3D');
  ok(errs.length===0, `${n} erreurs console: ${errs.join(' | ')}`);
  await p.close(); }
 console.log(fails.length? 'ÉCHECS:\n'+fails.join('\n') : 'TOUT OK'); if (fails.length) process.exitCode = 1; await b.close(); })();
