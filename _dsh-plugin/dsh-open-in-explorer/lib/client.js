window.__ModuleLoader__.load({
        id: 'dsh-open-in-explorer',
        factory: (require) => {
            var module = { exports: {} };
            var exports = module.exports;

            /**
             * dsh-open-in-explorer —— 客户端半边。两件事：
             *
             * A) 「打开真实文件 / 资源管理器定位」的点击接管（原有功能）
             *    官方交付文件卡片点「打开」默认只开右侧预览；这里在捕获阶段接管：
             *      · split 里的「打开」按钮  -> 用系统默认应用打开真实文件
             *      · 整卡覆盖层 / ⌄ 菜单「在文件资源管理器中显示」 -> 资源管理器定位
             *
             * B) 自研「交付文件」行（方案 B）
             *    官方交付行依赖 slot `conversation.chat.turnTail` 注册，部分 DSH 版本上
             *    该 slot 未被父条目声明 → 注册被拒 → 行静默不渲染；所以这里自己渲染：
             *      1. 向宿主半边 GET /open-in-explorer/deliverables 取本会话交付文件；
             *      2. 在页面里找到"提到该文件名"的那段文字（内联代码里的路径最准），
             *         在它所在段落下面插一行「交付文件：文件名 · 打开 · 定位」；
             *      3. 找不到锚点就**什么都不画**——v2 起不再弹右下角浮动面板
             *         （第一版那个长条框太干扰，已移除）。
             *    按钮复用本插件自己的 /open-in-explorer/open 与 /reveal，不走官方链路。
             */
            const INSTALLED = '__dshOpenInExplorerInstalled'
            const RENDER_SCHEDULED = '__dshOpenInExplorerRenderScheduled'

            const OPEN_ENDPOINT = '/open-in-explorer/open'
            const REVEAL_ENDPOINT = '/open-in-explorer/reveal'
            const DIAG_ENDPOINT = '/open-in-explorer/diag'
            const DELIVERABLES_ENDPOINT = '/open-in-explorer/deliverables'

            /** 自研交付行的 DOM 标记（用于幂等与查重）。 */
            const ROW_ATTR = 'data-dsh-deliverables-row'

            const REVEAL_LABELS = [
                '在文件资源管理器中显示',
                '在文件资源管理器中打开',
                '在文件管理器中显示',
                '在文件夹中显示',
                '打开所在文件夹',
                '所在文件夹',
                '文件资源管理器',
                '资源管理器',
                'Show in File Explorer',
                'Show in File Manager',
                'Show in folder',
                'Reveal in'
            ]

            let lastCard = null
            let renderInFlight = false
            let lastRenderKey = ''
            let renderCount = 0
            let deferCount = 0
            let missCount = 0

            /**
             * 上报一条诊断现场信息。永不抛出。
             * @param {string} stage 阶段名
             * @param {object} [data] 附加上下文
             */
            function diag(stage, data) {
                try {
                    fetch(DIAG_ENDPOINT, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({
                                    stage: stage,
                                    data: data === undefined ? null : data,
                                    href: typeof location !== 'undefined' ? location.href : null,
                                    readyState: typeof document !== 'undefined' ? document.readyState : null
                                })
                        }).catch(function () {})
                } catch (error) {
                    /* 诊断失败绝不能影响界面 */
                }
            }

            /**
             * 把一次动作交给宿主半边执行。
             * @param {string} endpoint 动作路由（open / reveal）
             * @param {string} path 绝对路径
             * @param {string} via 触发来源，仅用于诊断
             */
            function postAction(endpoint, path, via) {
                if (typeof path !== 'string' || path.trim().length === 0) return
                try {
                    fetch(endpoint, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ path: path })
                        }).then(
                        function (response) {
                            diag('action-response', { via: via, endpoint: endpoint, status: response.status, ok: response.ok, path: path })
                        },
                        function (error) {
                            diag('action-reject', { via: via, endpoint: endpoint, message: String(error && error.message), path: path })
                        }
                    )
                } catch (error) {
                    diag('action-throw', { via: via, endpoint: endpoint, message: String(error && error.message) })
                }
            }

            function openPath(path, via) { postAction(OPEN_ENDPOINT, path, via) }
            function revealPath(path, via) { postAction(REVEAL_ENDPOINT, path, via) }

            /* ───────────────────── 官方卡片点击接管（原有） ───────────────────── */

            function looksLikeRevealLabel(element) {
                let node = element
                for (let depth = 0; node !== null && depth < 4; depth += 1) {
                    const text = typeof node.textContent === 'string' ? node.textContent.trim() : ''
                    if (text.length > 0 && text.length <= 40) {
                        for (let i = 0; i < REVEAL_LABELS.length; i += 1) {
                            if (text.indexOf(REVEAL_LABELS[i]) >= 0) return true
                        }
                    }
                    node = node.parentElement
                }
                return false
            }

            function nearRect(rect, x, y) {
                if (rect === null || rect === undefined) return false
                const cx = Math.min(Math.max(x, rect.left), rect.right)
                const cy = Math.min(Math.max(y, rect.top), rect.bottom)
                return Math.hypot(x - cx, y - cy) < 420
            }

            function findOpenButton(card) {
                if (card === null || card === undefined) return null
                const direct = card.querySelector('button[class*="open"]')
                if (direct !== null) return direct
                const split = card.querySelector('[class*="split"]')
                return split !== null ? split.querySelector('button') : null
            }

            /**
             * 自研交付行是否启用（默认**开启**）。
             *
             * 背景：官方交付行是靠 slot `conversation.chat.turnTail` 注册的，部分 DSH 版本 /
             * 环境下注册被拒，界面就**一张卡片都不出**（本机 2026-09-25 实测如此）。所以自研行
             * 默认打开，充当"永远可用"的交付界面；它只在**官方行缺席**时绘制，官方行一旦出现
             * 就自动让位（不会两套叠着）。
             * 关闭方式（任选其一）：
             *   · 地址栏加参数：?dsh-fallback=0
             *   · 控制台执行：localStorage.setItem('dsh-deliverables-fallback','off') 后刷新
             * @returns {boolean} 启用返回 true
             */
            function fallbackEnabled() {
                try {
                    if (typeof location !== 'undefined' && typeof location.search === 'string') {
                        if (location.search.indexOf('dsh-fallback=0') >= 0) return false
                        if (location.search.indexOf('dsh-fallback=1') >= 0) return true
                    }
                    if (typeof localStorage !== 'undefined' && localStorage.getItem('dsh-deliverables-fallback') === 'off') return false
                } catch (error) {
                    /* 读不到就按默认开启处理 */
                }
                return true
            }

            /**
             * 页面上是否已经有"官方交付行/卡片"（仅兜底模式使用）。
             * 官方那套更好看（图标 + 文件名 + 说明 + 打开 + ⌄ 菜单），只要它在就不画自研行。
             * 注意：类名带构建哈希（如 nArs4W_producedChip），只能做键名子串匹配；
             * 新版可能不再带 data-presented-file，所以多认几种。
             * @returns {boolean} 有官方行返回 true
             */
            function officialRowPresent() {
                try {
                    if (typeof document === 'undefined') return false
                    if (document.querySelectorAll('[data-presented-file]').length > 0) return true
                    if (document.querySelectorAll('[class*="cardPreview"]').length > 0) return true
                    if (document.querySelectorAll('[class*="producedChip"]').length > 0) return true
                    if (document.querySelectorAll('[class*="producedFile"], [class*="presentedCard"], [class*="deliverableCard"]').length > 0) return true
                    return false
                } catch (error) {
                    return false
                }
            }

            function census(reason) {
                try {
                    if (typeof document === 'undefined') return
                    const chips = document.querySelectorAll('[class*="producedChip"]')
                    const chipSample = []
                    for (let i = 0; i < chips.length && chipSample.length < 5; i += 1) {
                        chipSample.push({
                            tag: chips[i].tagName,
                            cls: String(chips[i].className || '').slice(0, 48),
                            text: String(chips[i].textContent || '').trim().slice(0, 60)
                        })
                    }
                    diag('census', {
                            reason: reason,
                            cardCount: document.querySelectorAll('[data-presented-file]').length,
                            previewCount: document.querySelectorAll('[class*="cardPreview"]').length,
                            openButtonCount: document.querySelectorAll('[class*="split"] button[class*="open"]').length,
                            producedChips: chips.length,
                            chipSample: chipSample,
                            turnTailNodes: document.querySelectorAll('[class*="turnTail"], [class*="TurnTail"]').length,
                            ourRows: document.querySelectorAll('[' + ROW_ATTR + ']').length
                        })
                } catch (error) {
                    diag('census-error', { message: String(error && error.message) })
                }
            }

            function onClickCapture(event) {
                try {
                    if (event.button !== 0) return
                    const target = event.target
                    if (target === null || typeof target.closest !== 'function') return

                    // 自研交付行的按钮：走我们自己的路由
                    const ourRow = target.closest('[' + ROW_ATTR + ']')
                    if (ourRow !== null) {
                        const action = target.getAttribute('data-dsh-action')
                        const path = target.getAttribute('data-dsh-path')
                        if (action === 'menu') {
                            event.preventDefault()
                            event.stopPropagation()
                            event.stopImmediatePropagation()
                            const card = target.closest('.dsh-ob-card')
                            const menu = card === null ? null : card.querySelector('.dsh-ob-menu')
                            if (menu !== null) menu.hidden = !menu.hidden
                            return
                        }
                        if ((action === 'open' || action === 'reveal') && path !== null) {
                            event.preventDefault()
                            event.stopPropagation()
                            event.stopImmediatePropagation()
                            if (action === 'open') openPath(path, 'our-row-open')
                            else revealPath(path, 'our-row-reveal')
                            const card = target.closest('.dsh-ob-card')
                            const menu = card === null ? null : card.querySelector('.dsh-ob-menu')
                            if (menu !== null) menu.hidden = true
                            return
                        }
                        return
                    }
                    // 点到别处：把还开着的 ⌄ 菜单收起来
                    const opened = document.querySelectorAll('[' + ROW_ATTR + '] .dsh-ob-menu:not([hidden])')
                    for (let i = 0; i < opened.length; i += 1) opened[i].hidden = true

                    const card = target.closest('[data-presented-file]')
                    if (card !== null) {
                        const overlay = card.querySelector('button[class*="cardPreview"]')
                        const overlayPath = overlay !== null ? overlay.getAttribute('title') : null
                        const usable = typeof overlayPath === 'string' && overlayPath.trim().length > 0
                        lastCard = { path: overlayPath, rect: card.getBoundingClientRect(), at: Date.now() }

                        const openButton = findOpenButton(card)
                        if (openButton !== null && usable && (target === openButton || openButton.contains(target))) {
                            diag('card-open-button-click', { path: overlayPath })
                            event.preventDefault()
                            event.stopPropagation()
                            event.stopImmediatePropagation()
                            openPath(overlayPath, 'card-open-button')
                            return
                        }

                        if (target === overlay && usable) {
                            diag('card-overlay-click', { path: overlayPath })
                            event.preventDefault()
                            event.stopPropagation()
                            event.stopImmediatePropagation()
                            revealPath(overlayPath, 'card-overlay')
                            return
                        }
                        return
                    }

                    if (lastCard !== null && looksLikeRevealLabel(target)) {
                        const fresh = Date.now() - lastCard.at < 15000
                        const close = nearRect(lastCard.rect, event.clientX, event.clientY)
                        if (fresh && close) {
                            diag('menu-reveal-click', { path: lastCard.path, fresh: fresh, close: close })
                            revealPath(lastCard.path, 'card-menu')
                        }
                    }
                } catch (error) {
                    diag('click-error', { message: String(error && error.message) })
                }
            }

            /* ───────────────────────── 自研交付行（方案 B） ───────────────────────── */

            /** 注入一次性的样式表（幂等）。外观对齐官方交付卡片：图标 + 文件名 + 说明 + 打开 + ⌄ 菜单。 */
            function ensureStyle() {
                if (typeof document === 'undefined') return
                if (document.getElementById('dsh-ob-style') !== null) return
                const style = document.createElement('style')
                style.id = 'dsh-ob-style'
                style.textContent = [
                    '[' + ROW_ATTR + ']{margin:8px 0 12px}',
                    '[' + ROW_ATTR + '] .dsh-ob-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px}',
                    '[' + ROW_ATTR + '] .dsh-ob-card{position:relative;display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(127,127,127,.28);border-radius:12px;background:rgba(127,127,127,.06)}',
                    '[' + ROW_ATTR + '] .dsh-ob-icon{flex:none;width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;letter-spacing:.5px;background:rgba(127,127,127,.18)}',
                    '[' + ROW_ATTR + '] .dsh-ob-body{flex:1 1 auto;min-width:0}',
                    '[' + ROW_ATTR + '] .dsh-ob-name{font-weight:600;font-size:13px;line-height:1.35;word-break:break-all}',
                    '[' + ROW_ATTR + '] .dsh-ob-desc{font-size:12px;opacity:.62;line-height:1.35;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
                    '[' + ROW_ATTR + '] .dsh-ob-actions{flex:none;display:flex;align-items:center;gap:0}',
                    '[' + ROW_ATTR + '] .dsh-ob-btn{cursor:pointer;font:inherit;font-size:12px;padding:4px 12px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit}',
                    '[' + ROW_ATTR + '] .dsh-ob-btn.dsh-ob-open{border-radius:8px 0 0 8px}',
                    '[' + ROW_ATTR + '] .dsh-ob-btn.dsh-ob-more{border-radius:0 8px 8px 0;border-left:0;padding:4px 8px}',
                    '[' + ROW_ATTR + '] .dsh-ob-btn:hover{border-color:currentColor}',
                    '[' + ROW_ATTR + '] .dsh-ob-menu{position:absolute;right:8px;top:calc(100% - 4px);z-index:50;min-width:190px;padding:6px;border:1px solid rgba(127,127,127,.3);border-radius:10px;background:var(--dsh-color-bg-elevated,rgba(30,30,30,.96));box-shadow:0 8px 24px rgba(0,0,0,.28)}',
                    '[' + ROW_ATTR + '] .dsh-ob-menu[hidden]{display:none}',
                    '[' + ROW_ATTR + '] .dsh-ob-menu button{display:block;width:100%;text-align:left;cursor:pointer;font:inherit;font-size:12px;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:inherit}',
                    '[' + ROW_ATTR + '] .dsh-ob-menu button:hover{background:rgba(127,127,127,.18)}',
                    '[' + ROW_ATTR + '] .dsh-ob-miss{font-size:11px;opacity:.55;margin-top:2px}'
                ].join('\n')
                document.head.appendChild(style)
            }

            /** 按扩展名给个简短图标字（模仿官方卡片左侧图标位）。 */
            function iconTextOf(name) {
                const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''))
                const ext = m === null ? '' : m[1].toLowerCase()
                if (ext === 'docx' || ext === 'doc') return 'W'
                if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'X'
                if (ext === 'md' || ext === 'txt') return 'MD'
                if (ext === 'pdf') return 'PDF'
                if (ext === 'mjs' || ext === 'js') return 'JS'
                if (ext === 'cmd' || ext === 'bat' || ext === 'ps1') return 'CMD'
                if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'IMG'
                return 'FILE'
            }

            /** 造一条「交付文件」行（内部是官方同款的卡片栅格）。 */
            function buildRow(files) {
                const row = document.createElement('div')
                row.setAttribute(ROW_ATTR, '1')
                const grid = document.createElement('div')
                grid.className = 'dsh-ob-grid'
                row.appendChild(grid)

                for (const file of files) {
                    const card = document.createElement('div')
                    card.className = 'dsh-ob-card'

                    const icon = document.createElement('div')
                    icon.className = 'dsh-ob-icon'
                    icon.textContent = iconTextOf(file.name)
                    card.appendChild(icon)

                    const body = document.createElement('div')
                    body.className = 'dsh-ob-body'
                    const name = document.createElement('div')
                    name.className = 'dsh-ob-name'
                    name.textContent = file.name
                    body.appendChild(name)
                    if (file.description) {
                        const desc = document.createElement('div')
                        desc.className = 'dsh-ob-desc'
                        desc.textContent = file.description
                        body.appendChild(desc)
                    }
                    if (file.exists === false) {
                        const miss = document.createElement('div')
                        miss.className = 'dsh-ob-miss'
                        miss.textContent = '原路径已不存在'
                        body.appendChild(miss)
                    }
                    card.appendChild(body)

                    const actions = document.createElement('div')
                    actions.className = 'dsh-ob-actions'

                    const openBtn = document.createElement('button')
                    openBtn.className = 'dsh-ob-btn dsh-ob-open'
                    openBtn.textContent = '打开'
                    openBtn.setAttribute('data-dsh-action', 'open')
                    openBtn.setAttribute('data-dsh-path', file.path)
                    actions.appendChild(openBtn)

                    const moreBtn = document.createElement('button')
                    moreBtn.className = 'dsh-ob-btn dsh-ob-more'
                    moreBtn.textContent = '⌄'
                    moreBtn.setAttribute('data-dsh-action', 'menu')
                    actions.appendChild(moreBtn)
                    card.appendChild(actions)

                    const menu = document.createElement('div')
                    menu.className = 'dsh-ob-menu'
                    menu.hidden = true
                    const openItem = document.createElement('button')
                    openItem.textContent = '用默认应用打开'
                    openItem.setAttribute('data-dsh-action', 'open')
                    openItem.setAttribute('data-dsh-path', file.path)
                    menu.appendChild(openItem)
                    const revealItem = document.createElement('button')
                    revealItem.textContent = '在文件资源管理器中显示'
                    revealItem.setAttribute('data-dsh-action', 'reveal')
                    revealItem.setAttribute('data-dsh-path', file.path)
                    menu.appendChild(revealItem)
                    card.appendChild(menu)

                    grid.appendChild(card)
                }
                return row
            }

            /**
             * 找到"提到这个文件名"的元素：走一遍文本节点，取最后一次命中。
             * 命中内联代码（<code>）时优先返回那个 code 元素，位置更准。
             * 精确匹配失败时，退一步用"去掉空格后的包含"和"前 12 个字符前缀"再试。
             * @param {string} name 文件名
             * @returns {Element|null}
             */
            function findAnchor(name) {
                if (typeof document === 'undefined' || !document.body || !name) return null
                const compact = name.replace(/\s/g, '')
                const prefix = compact.slice(0, Math.min(12, compact.length))
                let best = null
                let loose = null
                try {
                    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
                    let node = walker.nextNode()
                    while (node !== null) {
                        const text = node.nodeValue || ''
                        if (text.length > 0) {
                            const el = node.parentElement
                            if (el !== null) {
                                const hit = text.indexOf(name) >= 0
                                    || text.replace(/\s/g, '').indexOf(compact) >= 0
                                if (hit) {
                                    const code = el.closest('code')
                                    best = code !== null ? code : el
                                } else if (loose === null && prefix.length >= 6 && text.indexOf(prefix) >= 0) {
                                    loose = el
                                }
                            }
                        }
                        node = walker.nextNode()
                    }
                } catch (error) {
                    diag('anchor-walk-error', { message: String(error && error.message) })
                }
                return best !== null ? best : loose
            }

            /** DOM 探针：锚点全丢时上报一次现场，便于远程定位。 */
            function domProbe() {
                try {
                    const body = document.body
                    if (!body) return { error: 'no-body' }
                    const text = typeof body.textContent === 'string' ? body.textContent : ''
                    return {
                        domChars: text.length,
                        p: document.querySelectorAll('p').length,
                        code: document.querySelectorAll('code').length,
                        pre: document.querySelectorAll('pre').length,
                        div: document.querySelectorAll('div').length,
                        tail: text.slice(-160).replace(/\s+/g, ' ')
                    }
                } catch (error) {
                    return { error: String(error && error.message) }
                }
            }

            /**
             * 交付行插在这个块级元素后面（段落 / 列表项 / 引用 / 代码块）。
             * @param {Element} anchor 锚点元素
             * @returns {Element|null}
             */
            function blockOf(anchor) {
                if (anchor === null) return null
                const block = anchor.closest('p, li, blockquote, pre, td, th')
                if (block !== null) return block
                return anchor.parentElement
            }

            /**
             * 主渲染流程：取数 → 找锚点 → 在段落下方插行（找不到就不画）。
             * @param {string} reason 触发原因
             */
            function renderDeliverables(reason) {
                if (typeof document === 'undefined' || renderInFlight) return
                renderInFlight = true
                renderCount += 1
                fetch(DELIVERABLES_ENDPOINT, { headers: { 'cache-control': 'no-store' } }).then(
                    function (response) { return response.ok ? response.json() : null },
                    function (error) { diag('deliverables-fetch-reject', { reason: reason, message: String(error && error.message) }); return null }
                ).then(function (payload) {
                    try {
                        if (payload === null || payload === undefined || payload.ok !== true) {
                            diag('deliverables-payload-bad', { reason: reason, payload: payload === null ? null : { ok: payload.ok, error: payload.error } })
                            return
                        }
                        const files = []
                        const seen = {}
                        for (const turn of (payload.turns || [])) {
                            for (const file of (turn.files || [])) {
                                if (seen[file.path] === true) continue
                                seen[file.path] = true
                                files.push(file)
                            }
                        }
                        if (files.length === 0) return

                        // 不再检测官方行、也不让位：本机的官方交付行（slot conversation.chat.turnTail）
                        // 在部分版本里注册被拒，一张卡都不出；用户明确要求"每次都用自研这套"。
                        // 因此这里始终渲染，保证每个提到交付文件的消息下面都有可点的卡片。
                        if (renderCount % 40 === 1) {
                            diag('deliverables-official-state', {
                                    officialCards: document.querySelectorAll('[data-presented-file]').length,
                                    producedChips: document.querySelectorAll('[class*="producedChip"]').length,
                                    ourRows: document.querySelectorAll('[' + ROW_ATTR + ']').length
                                })
                        }

                        // 页面刚 boot 时聊天区可能还是一片空白：先确认 DOM 里真的有正文再动手，
                        // 否则找不到锚点、白跑一次（v2 的 bug 就在这里：只试一次就再没重试）。
                        const domChars = document.body && typeof document.body.textContent === 'string' ? document.body.textContent.length : 0
                        if (domChars < 800) {
                            deferCount += 1
                            if (deferCount % 8 === 1) diag('deliverables-defer', { reason: reason, domChars: domChars, files: files.length })
                            return
                        }

                        const key = payload.sessionId + '|' + files.map(function (f) { return f.path + ':' + f.exists }).join(';')
                        if (key === lastRenderKey) return

                        ensureStyle()
                        const buckets = []
                        const unanchored = []
                        const samples = []
                        for (const file of files) {
                            const anchor = findAnchor(file.name)
                            const block = blockOf(anchor)
                            if (block === null || block.parentElement === null) {
                                unanchored.push(file.name)
                                continue
                            }
                            let bucket = null
                            for (const candidate of buckets) {
                                if (candidate.block === block) { bucket = candidate; break }
                            }
                            if (bucket === null) { bucket = { block: block, files: [] }; buckets.push(bucket) }
                            bucket.files.push(file)
                            if (samples.length < 4) {
                                samples.push({
                                    name: file.name,
                                    anchorTag: anchor === null ? null : anchor.tagName,
                                    anchorCls: anchor === null ? null : String(anchor.className || '').slice(0, 48),
                                    blockTag: block.tagName,
                                    blockCls: String(block.className || '').slice(0, 48)
                                })
                            }
                        }

                        let inserted = 0
                        for (const bucket of buckets) {
                            const old = bucket.block.nextElementSibling
                            if (old !== null && old.getAttribute(ROW_ATTR) !== null) old.remove()
                            const row = buildRow(bucket.files)
                            bucket.block.parentElement.insertBefore(row, bucket.block.nextSibling)
                            inserted += 1
                        }

                        if (inserted > 0) {
                            // 只有真正插进去了才记 key（记早了就再也不会重试）
                            lastRenderKey = key
                            diag('deliverables-render', {
                                    reason: reason,
                                    sessionId: payload.sessionId,
                                    workspaceRoot: payload.workspaceRoot,
                                    files: files.length,
                                    anchored: files.length - unanchored.length,
                                    rows: inserted,
                                    unanchored: unanchored.slice(0, 4),
                                    officialCards: document.querySelectorAll('[data-presented-file]').length,
                                    codeCount: document.querySelectorAll('code').length,
                                    samples: samples
                                })
                        } else {
                            missCount += 1
                            if (missCount % 4 === 1) {
                                diag('deliverables-miss', {
                                        reason: reason,
                                        sessionId: payload.sessionId,
                                        files: files.length,
                                        codeCount: document.querySelectorAll('code').length,
                                        unanchored: unanchored.slice(0, 4),
                                        probe: domProbe()
                                    })
                            }
                        }
                    } finally {
                        renderInFlight = false
                    }
                }).catch(function (error) {
                    renderInFlight = false
                    diag('deliverables-render-error', { reason: reason, message: String(error && error.message) })
                })
            }

            /** 安排渲染：加载后 + DOM 变化（防抖）+ 定时兜底。默认关闭，见 fallbackEnabled()。 */
            function scheduleRenders() {
                if (typeof document === 'undefined' || window[RENDER_SCHEDULED] === true) return
                if (!fallbackEnabled()) {
                    diag('deliverables-fallback-off', {
                            officialCards: document.querySelectorAll('[data-presented-file]').length,
                            producedChips: document.querySelectorAll('[class*="producedChip"]').length,
                            note: '自研兜底行默认关闭（官方卡片行正常工作）；需要时加 ?dsh-fallback=1 或 localStorage dsh-deliverables-fallback=on'
                        })
                    return
                }
                window[RENDER_SCHEDULED] = true

                let timer = null
                const kick = function (reason) {
                    if (timer !== null) clearTimeout(timer)
                    timer = setTimeout(function () { renderDeliverables(reason) }, 600)
                }

                try {
                    renderDeliverables('boot')
                    if (typeof MutationObserver === 'function' && document.body) {
                        new MutationObserver(function () { kick('mutation') }).observe(document.body, { childList: true, subtree: true })
                    }
                    if (typeof window !== 'undefined') {
                        window.addEventListener('load', function () { setTimeout(function () { renderDeliverables('window-load') }, 1200) })
                    }
                    setInterval(function () { renderDeliverables(renderCount < 40 ? 'interval-fast' : 'interval-slow') }, renderCount < 40 ? 3000 : 10000)
                } catch (error) {
                    diag('deliverables-schedule-error', { message: String(error && error.message) })
                }
            }

            /* ───────────────────────────── 安装 ───────────────────────────── */

            function install() {
                if (typeof document === 'undefined') return
                if (window[INSTALLED] === true) return
                window[INSTALLED] = true
                document.addEventListener('click', onClickCapture, true)
                diag('interceptor-installed', { open: OPEN_ENDPOINT, reveal: REVEAL_ENDPOINT, deliverables: DELIVERABLES_ENDPOINT })
            }

            install()

            try {
                if (typeof window !== 'undefined') {
                    window.addEventListener('load', function () {
                            setTimeout(function () { census('window-load') }, 1500)
                        })
                }
            } catch (error) {
                diag('census-schedule-error', { message: String(error && error.message) })
            }

            function apply() {
                install()
                census('apply')
                scheduleRenders()
            }

            exports.apply = apply
            exports.inject = []
            return module.exports
        }
    })
