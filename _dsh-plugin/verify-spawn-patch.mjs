/**
 * 验证 dsh-open-in-explorer 的 spawn 补丁逻辑。
 *
 * 做法：先复刻 DSH 的 windows-child-process-hide.mjs 补丁，再加载插件真实代码
 * 并调用 apply()，最后断言 explorer.exe 拿到 windowsHide:false、其它命令不被干扰。
 */
import childProcess from 'node:child_process'

const results = []
const record = (name, pass, detail) => {
	results.push({ name, pass, detail })
	console.log(`${pass ? '✅' : '❌'} ${name}  ${detail}`)
}

// ---- 1) 复刻 DSH Desktop 的 shim ----
function applyWindowsHide(options) {
	if (options && typeof options === 'object' && options.windowsHide !== undefined) return options
	if (options && typeof options === 'object') return { ...options, windowsHide: true }
	return { windowsHide: true }
}

const captured = []
childProcess.spawn = function shimmedSpawn(command, args, options) {
	const isArray = Array.isArray(args)
	const finalOptions = isArray ? applyWindowsHide(options) : applyWindowsHide(args)
	captured.push({ command, args: isArray ? args : undefined, options: finalOptions })
	return { on() {}, unref() {} }
}

// ---- 2) 加载插件真实代码并 apply ----
const pluginUrl = new URL('file:///E:/Deepseek/_dsh-plugin/dsh-open-in-explorer/lib/index.js').href
const mod = await import(pluginUrl)
console.log('插件导出:', Object.keys(mod).join(', '))

let registeredPath = null
mod.apply({
	effect: (fn) => fn(),
	webServer: {
		register: (route) => {
			registeredPath = route.path
			return () => {}
		}
	}
})

// ---- 3) 断言 ----
captured.length = 0

childProcess.spawn('explorer.exe', ['/select,C:\\tmp\\a.txt'], { detached: true, stdio: 'ignore' })
let last = captured[captured.length - 1]
record(
	'explorer.exe 拿不到 CREATE_NO_WINDOW（等于被 shim 强加过）',
	last.options.windowsHide === false && last.options.detached === true && last.options.stdio === 'ignore',
	JSON.stringify(last.options)
)

childProcess.spawn('node', ['-v'], { detached: true, stdio: 'ignore' })
last = captured[captured.length - 1]
record(
	'非 GUI 命令保持原样（仍被 shim 加 windowsHide:true）',
	last.options.windowsHide === true,
	JSON.stringify(last.options)
)

childProcess.spawn('C:\\Windows\\explorer.exe', ['/select,C:\\tmp\\b.txt'], { detached: true, stdio: 'ignore' })
last = captured[captured.length - 1]
record(
	'带完整路径的 explorer.exe 也能识别',
	last.options.windowsHide === false,
	JSON.stringify(last.options)
)

childProcess.spawn('open', ['-R', '/tmp/a'], { detached: true, stdio: 'ignore' })
last = captured[captured.length - 1]
record('macOS 的 open 也被修好', last.options.windowsHide === false, JSON.stringify(last.options))

// spawn(command, options) 重载
childProcess.spawn('explorer.exe', { detached: true, stdio: 'ignore' })
last = captured[captured.length - 1]
record('spawn(command, options) 重载形式', last.options.windowsHide === false, JSON.stringify(last.options))

record('路由已注册', registeredPath === '/open-in-explorer', String(registeredPath))

const failed = results.filter((r) => !r.pass)
console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length === 0 ? 0 : 1)
