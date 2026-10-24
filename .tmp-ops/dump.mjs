import fs from 'fs';
import path from 'path';

const RES = 'E:/Program Files/DeepSeek/DSH Desktop/resources';
const HOME = process.env.DSH_HOME;

function head(p, n = 4000, tag = '') {
  try {
    const s = fs.readFileSync(p, 'utf8');
    console.log(`\n===== ${tag || p} (len=${s.length}) =====`);
    console.log(s.slice(0, n));
  } catch (e) {
    console.log(`\n===== ${tag || p} ERROR: ${e.message}`);
  }
}

head(path.join(RES, 'app.asar/node_modules/@deepseek-ai/dsh/lib/plugin-BGnVfe_D.js'), 9000, 'dsh CLI plugin cmd');

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(HOME, 'profiles/web/node_modules/dshmarket/package.json'), 'utf8'));
  console.log('\n===== dshmarket package.json =====');
  console.log(JSON.stringify({ name: pkg.name, version: pkg.version, bin: pkg.bin, main: pkg.main, exports: pkg.exports, dsh: pkg.dsh }, null, 2));
} catch (e) {
  console.log('\n===== dshmarket package.json ERROR: ' + e.message);
}
