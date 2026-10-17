/* Lance les tests : serveur de l'app (8765), version de référence du calculateur (8766),
   puis le parcours complet de l'onglet HTP et la non-régression du calculateur. */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const REF_COMMIT = '47f8f76';                       // calculateur avant l'onglet HTP
const REF_DIR = path.join(os.tmpdir(), 'detect-ref');

function serve(dir, port) {
    return spawn('python3', ['-m', 'http.server', String(port)], { cwd: dir, stdio: 'ignore' });
}
function run(script, args = []) {
    return new Promise((resolve) => {
        const p = spawn(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });
        p.on('exit', (code) => resolve(code || 0));
    });
}

(async () => {
    if (!fs.existsSync(REF_DIR)) execSync(`git worktree add --detach "${REF_DIR}" ${REF_COMMIT}`, { cwd: ROOT, stdio: 'inherit' });
    const servers = [serve(ROOT, 8765), serve(REF_DIR, 8766)];
    await new Promise((r) => setTimeout(r, 1500));
    let code = 0;
    try {
        code |= await run('regression-detect.js');
        code |= await run('e2e.js', [os.tmpdir()]);
    } finally {
        servers.forEach((s) => s.kill());
    }
    console.log(code ? 'Tests en échec' : 'Tous les tests sont verts');
    process.exit(code);
})();
