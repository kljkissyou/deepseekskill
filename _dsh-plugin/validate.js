/**
 * 部署后自检：确认插件包、客户端脚本、宿主脚本与挂载行都对得上。
 * 用法：set DSH_HOME=<harness 目录> && node validate.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const dshHome = process.env.DSH_HOME || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'dsh-desktop', 'harness');
const patchPath = path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml');
const dir = path.join(dshHome, 'plugins-local', 'dsh-open-in-explorer');

let bad = 0;
const check = (label, pass, detail) => {
if (pass) console.log(`✔ ${label}${detail ? '  ' + detail : ''}`);
else { bad += 1; console.log(`✘ ${label}${detail ? '  ' + detail : ''}`); }
};

console.log('DSH_HOME:', dshHome);

// 1) 挂载行
const yaml = require('E:/Program Files/DeepSeek/DSH Desktop/resources/app/node_modules/js-yaml');
const doc = yaml.load(fs.readFileSync(patchPath, 'utf8'));
const insert = [].concat(...doc.filter((e) => e && Array.isArray(e.insert)).map((e) => e.insert));
const mount = insert.find((e) => e && e.id === 'open-in-explorer');
check('cordis.patch.yml 解析成功，顶层条目数 ' + doc.length, true);
check('open-in-explorer 挂载行存在', !!mount, JSON.stringify(mount || null));
check('挂载名正确', !!mount && mount.name === 'dsh-open-in-explorer', mount && mount.name);

// 2) 插件包结构
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
check('package.json 声明 client', JSON.stringify(pkg.dsh && pkg.dsh.client) === '{"platform":"web"}', JSON.stringify(pkg.dsh && pkg.dsh.client));
check('exports./client 指向 lib/client.js', pkg.exports['./client'].default === './lib/client.js');

// 3) 客户端脚本
const client = fs.readFileSync(path.join(dir, 'lib', 'client.js'), 'utf8');
check('client.js 使用 ModuleLoader.load', client.includes('window.__ModuleLoader__.load'));
check('client.js 有 cardPreview 覆盖层选择器', client.includes('cardPreview'));
check('client.js 有「打开」按钮选择器', client.includes('button[class*="open"]'));
check('client.js 打 /open-in-explorer/open 路由', client.includes("'/open-in-explorer/open'"));
check('client.js 打 /open-in-explorer/reveal 路由', client.includes("'/open-in-explorer/reveal'"));

// 4) 宿主脚本
const host = fs.readFileSync(path.join(dir, 'lib', 'index.js'), 'utf8');
check('index.js 注册 /open-in-explorer/open', host.includes("endsWith('/open')"));
check('index.js 注册 /open-in-explorer/reveal', host.includes("endsWith('/reveal')"));
check('index.js 自检入口 test / test-open', host.includes("'/test-open'") || host.includes("/test-open"));
check('index.js 显式 windowsHide: false', host.includes('windowsHide: false'));
check('index.js 带 spawn 补丁', host.includes('patchSpawnForGuiLaunchers'));

console.log('');
if (bad > 0) { console.log(`结果：${bad} 项未通过`); process.exit(1); }
console.log('结果：全部通过 ✅');