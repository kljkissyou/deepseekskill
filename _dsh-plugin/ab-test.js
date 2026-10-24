const { spawn } = require('child_process');
const fs = require('fs');

const A = 'E:\\Deepseek\\_测试A-windowsHide-true';
const B = 'E:\\Deepseek\\_测试B-windowsHide-false';

for (const d of [A, B]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(A + '\\测试A.txt', 'windowsHide: true 的对照实验\n', 'utf8');
fs.writeFileSync(B + '\\测试B.txt', 'windowsHide: false 的对照实验\n', 'utf8');

/** 完全复刻 better-sidebar 的调起方式，只改 windowsHide。 */
function launch(label, dir, windowsHide) {
  const args = [`/select,${dir}\\${label}.txt`];
  const child = spawn('explorer.exe', args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: windowsHide
  });
  child.on('error', (e) => console.log(`  ${label} error: ${e.message}`));
  child.unref();
  console.log(`  发出 ${label}: explorer.exe ${args[0]}   windowsHide=${windowsHide}  pid=${child.pid}`);
}

console.log('=== 对照实验（两个窗口的文件夹名不同，请分辨）===');
launch('测试A', A, true);
setTimeout(() => launch('测试B', B, false), 2500);
console.log('\n完成。未抛错 = 进程启动成功。');
