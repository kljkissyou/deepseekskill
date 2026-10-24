import fs from 'fs';
import path from 'path';

const RES = 'E:/Program Files/DeepSeek/DSH Desktop/resources';
const ASAR = path.join(RES, 'app.asar/node_modules');
const HOME = process.env.DSH_HOME;

function tryRead(p, n = 3000, tag = '') {
  try {
    const s = fs.readFileSync(p, 'utf8');
    console.log(`\n===== ${tag || p} (len=${s.length}) =====`);
    console.log(s.slice(0, n));
  } catch (e) {
    console.log(`\n===== ${tag || p} ERROR: ${e.message}`);
  }
}

console.log('DSH version:', JSON.parse(fs.readFileSync(path.join(ASAR, '@deepseek-ai/dsh/package.json'), 'utf8')).version);

console.log('\n@deepseek-ai packages:', fs.readdirSync(path.join(ASAR, '@deepseek-ai')).join(' | '));

const pmLib = path.join(ASAR, '@deepseek-ai/dsh-plugin-manager/lib');
try {
  console.log('\nplugin-manager lib:', fs.readdirSync(pmLib).join(' | '));
} catch (e) {
  console.log('\nplugin-manager lib ERROR:', e.message);
  console.log('plugin-manager root:', fs.readdirSync(path.join(ASAR, '@deepseek-ai/dsh-plugin-manager')).join(' | '));
}

tryRead(path.join(HOME, '.desktop-install-state.json'), 4000, 'desktop-install-state.json');
tryRead(path.join(HOME, 'profiles/web/pnpm-workspace.yaml'), 2000, 'pnpm-workspace.yaml');
