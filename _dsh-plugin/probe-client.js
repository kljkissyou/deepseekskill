const http = require('http');

const TOKEN = '7R7pDO2TjS1354GCjgH-_AdR1AtVnOYAv91nseLZLBA';
const BASE = 'http://127.0.0.1:43129';

function get(path, cookie) {
  return new Promise((resolve) => {
    const headers = cookie ? { cookie } : {};
    http.get(BASE + path, { headers }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', (e) => resolve({ status: 0, error: e.message }));
  });
}

(async () => {
  // 1) 用 token 换 cookie（首页 303 带 Set-Cookie）
  const boot = await get(`/?token=${TOKEN}`);
  console.log('首页:', boot.status);
  const setCookie = boot.headers['set-cookie'];
  console.log('Set-Cookie:', setCookie ? setCookie.map((c) => c.split(';')[0]).join(' | ') : '(无)');
  const cookie = setCookie ? setCookie.map((c) => c.split(';')[0]).join('; ') : '';

  // 2) 从首页 HTML 里抓出插件的确切 URL
  const m = boot.body.match(/"id":"dsh-open-in-explorer","url":"([^"]+)"/);
  const raw = m ? m[1] : null;
  console.log('boot 图中的 URL:', raw);

  const candidates = [
    `/plugins/??dsh-open-in-explorer/client.js&rev=5dcebcd9705ed631-46`,
    raw ? raw.replace(/&amp;/g, '&') : null,
    `/plugins/??dsh-open-in-explorer/client.js`,
  ].filter(Boolean);

  for (const p of candidates) {
    const r = await get(p, cookie);
    console.log(`\n=> ${p}\n   HTTP ${r.status}  ${r.body ? r.body.length : 0}B`);
    if (r.status === 200) {
      const c = r.body;
      for (const kw of ['__ModuleLoader__', 'cardPreview', 'open.external', 'onClickCapture', '已接管']) {
        console.log(`   ${kw.padEnd(18)}: ${c.includes(kw) ? '✅' : '❌'}`);
      }
      break;
    } else if (r.body) {
      console.log('   body:', r.body.slice(0, 200));
    }
  }
})();
