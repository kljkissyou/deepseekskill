import fs from 'fs';
import path from 'path';

const ASAR = 'E:/Program Files/DeepSeek/DSH Desktop/resources/app.asar/node_modules';
const HOME = process.env.DSH_HOME;

function hunt(file, kws, ctx = 900) {
  let s;
  try { s = fs.readFileSync(file, 'utf8'); } catch (e) { console.log(`\n### ${file} ERROR ${e.message}`); return; }
  console.log(`\n########## ${file} (len=${s.length})`);
  for (const kw of kws) {
    let i = -1, n = 0;
    while ((i = s.indexOf(kw, i + 1)) !== -1 && n < 3) {
      n++;
      console.log(`\n--- [${kw}] hit#${n} @${i} ---`);
      console.log(s.slice(Math.max(0, i - 200), i + ctx));
    }
    if (n === 0) console.log(`\n--- [${kw}] NOT FOUND ---`);
  }
}

hunt(path.join(ASAR, '@deepseek-ai/dsh-plugin-manager/lib/index.js'), ['runPluginCommand', 'bundles', 'profile.bundles']);

const mk = path.join(HOME, 'profiles/web/node_modules/dshmarket');
try {
  console.log('\n########## dshmarket lib:', fs.readdirSync(path.join(mk, 'lib')).join(' | '));
} catch (e) { console.log('\ndshmarket lib ERROR', e.message); }
hunt(path.join(mk, 'lib/index.js'), ['registerFetchRoute', 'route(', '/install', 'bundles'], 1200);
