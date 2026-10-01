# 高考倒计时页面 · 优化方案

> 适用版本：`gaokao/` v2.0.2（对应 git `e00c4a5`，与线上 `https://www.nightvoyager.online/gaokao/` 逐字节一致）
> 编制日期：基于本地工作副本 + 线上镜像的实测结论
> 约束：本文档只给方案与代码改动建议；`gaokao.js` 行号均以当时 1495 行版本为准
>
> ## ✅ 实施状态（2026-07-09 更新）
>
> **本方案已全部落地，成果版本 v2.0.3。** 实施情况：
>
> | 项 | 状态 | 落地位置 |
> |---|---|---|
> | P0-1 阶段日期跟随 GAOKAO_YEAR | ✅ 已实施 | `gaokao/time.js`（`PHASE_CONFIG.final` 由 `GAOKAO_YEAR` 推导） |
> | P0-2 高考日程单一数据源（Q1=打通） | ✅ 已实施 | `gaokao.js` `computeExamDates()` + `getGaokaoStart/End()` |
> | P0-3 SW 缓存版本化 + 网络优先 | ✅ 已实施 | `gaokao/sw.js` 重写 + `gaokao.js` 注册时传 `?v=APP_VERSION` |
> | P1-1 北京时间基准 | ✅ 已实施 | `time.js` `bjDate` / `fmtCnFull` / `fmtCnMonthDay` |
> | P1-2 主题按钮语义 | ✅ 已实施 | `gaokao.js` `syncThemeButton()` |
> | P1-3 日历键盘可达 | ✅ 已实施 | `gaokao.js` `handleCalendarKeydown()` |
> | P1-4 恢复默认直接绑定 + 立即生效 | ✅ 已实施 | `gaokao.js` `renderSettingsForm` / `resetSettings` |
> | P1-5 接通脉冲、删除死代码 | ✅ 已实施（Q3=接通） | `gaokao.js` `updatePhaseHero()` |
> | P1-6 阶段状态自动翻转 | ✅ 已实施 | `gaokao.js` `syncPhaseNavStatus()` |
> | P1-7 弹窗语义/焦点陷阱/选科按钮/播报 | ✅ 已实施 | `index.html` + `gaokao.js` |
> | P1-8 prefers-reduced-motion | ✅ 已实施 | `style.css` 末尾 |
> | P2-1 安全区适配 + dvh | ✅ 已实施 | `style.css` |
> | P2-2 抽离 time.js | ✅ 已实施 | `gaokao/time.js`（767 字节 → 7.6 KB，纯逻辑无 DOM） |
> | P2-3 回归测试 | ✅ 已实施（未引入 package.json，Q2 未确认） | `tests/gaokao-time.test.mjs`（24 项） |
> | P2-4 抽离 style.css + 结构清理 | ✅ 已实施（Q4=同意） | `gaokao/style.css` + 根 `index.html`/`404.html` |
> | P2-5 性能微优化 | ✅ 已实施 | Intl 缓存、DOM 写入短路、合并定时器、favicon −58% |
> | P2-6 文档与版本号单一来源 | ✅ 已实施 | `APP_VERSION`、`README.md`、`CHANGELOG.md`、`.nojekyll`、`robots.txt`、`sitemap.xml` |
> | Q5 考前 <24h 文案 | ⏳ 未改动 | 当前仍为整日截断显示「0 天」；如需改为「不足 1 天」请指明文案 |
> | Q6 服务端校时 | ✅ 按决定不做 | 已在 README 明确声明依赖设备本地时钟 |
>
> **实施期间的额外发现与修复**（方案未预见，由离线集成测试发现）：
> 1. `computeExamDates()` 与 `loadPhaseSettings()` 的初始化顺序错误（会抛异常）；
> 2. `getPhaseDates()` 从覆盖数据中读取了错误字段名（`year` vs `startYear`），
>    导致用户在设置里改高考日期时**静默回退到默认值**；
> 3. `fsProgressFill.parentElement.parentElement` 脆弱链，改为选择器定位。
>
> **验证结果**：24 项提交版回归测试 + 97 项离线集成测试（自建 DOM 垫片执行两个脚本）
> 全部通过；HTML 标签闭合、引用完整性、CSS 括号与 class 定义一致性均通过。
>
> **仍需你在浏览器中确认的事项**（无法离线验证）：
> Service Worker 实际更新与离线行为、`prefers-reduced-motion` 视觉表现、
> 键盘完整走查、iOS 安全区与全屏表现、`beforeinstallprompt` 安装流程。

---

## 0. 总览

### 0.1 优化原则

1. **保形最小改动**：`exams` 数组、`PHASE_CONFIG` 的对外结构保持兼容，优先改「取值来源」而不是改「数据结构」，避免牵动 1495 行里的既有调用。
2. **消灭双数据源**：当前高考日期存在两套来源（`GAOKAO_YEAR` 动态推导 vs `PHASE_CONFIG.final` 硬编码 2027），这是**唯一会让项目在 2027-06-10 11:00 之后彻底错乱**的问题，优先级最高。
3. **零依赖优先**：项目当前无构建链、无 npm。方案中所有 P0/P1 改动都保持「纯静态 + 零依赖」，只在 P2 才引入可选工具链。
4. **可验证**：每项都给出验证方法。P0-1 的关键约束可以写成不依赖任何库的 Node 断言脚本。

### 0.2 分级与工作量

| 级别 | 项数 | 预估工时 | 说明 |
|---|---|---|---|
| **P0 修复** | 3 | 3–5 h | 不修则明年功能失效 / 用户拿到旧代码 |
| **P1 改进** | 8 | 10–14 h | 健壮性、可访问性、体验 |
| **P2 增强** | 6 | 12–20 h | 工程化、性能、可维护性 |
| **合计** | 17 | 约 25–39 h | 建议按 P0 → P1 → P2 三个 PR 推进 |

### 0.3 建议的版本路线

| 版本 | 内容 | 建议提交信息 |
|---|---|---|
| v2.0.3 | P0-1、P0-2、P0-3 | `fix: 阶段日期跟随 GAOKAO_YEAR，修复跨年错乱；SW 缓存版本化` |
| v2.1.0 | P1 全部 | `feat: 键盘可达性、弹窗语义、安全区适配、阶段状态自动刷新` |
| v2.2.0 | P2 全部 | `refactor: 拆分 time.js / 独立 CSS / 抽出时间逻辑；perf: 缓存 Intl 格式化` |

---

# P0 · 必修项

## P0-1 阶段日期硬编码 2027，跨年后自相矛盾 🔴

### 现状与证据

`gaokao.js:5-13` 用动态年份：

```js
const GAOKAO_YEAR = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const end = new Date(y, 5, 10, 11, 0, 0);
    return now > end ? y + 1 : y;
})();
const COHORT_LABEL = GAOKAO_YEAR + '届';
```

但 `gaokao.js:1063-1094` 的 `PHASE_CONFIG` 年份是写死的：

```js
final: {
    id: 'final', name: '高考', longName: '全国统一高考', short: '终',
    defaultStart: { year: 2027, month: 6, day: 7 },   // ← 硬编码
    defaultEnd:   { year: 2027, month: 6, day: 10 },  // ← 硬编码
    desc: '全国统一高考',
},
```

**失效路径**：2027-06-10 11:00 之后加载页面 →

| 位置 | 显示 | 代码 |
|---|---|---|
| 页头徽章 | `2028届` | `COHORT_LABEL`（动态，`gaokao.js:376`） |
| 高考总倒计时 | `距 2028 年高考还有` | `gaokao.js:389-391`（**硬编码 2028**，只加一年，不跟随 `GAOKAO_YEAR`） |
| 阶段导航「高考」 | 已结束「✓」 | `getPhaseStatus('final')`（2027，已过期） |
| 切换到高考阶段 | `所有考试已结束 · 金榜题名` | `updatePhaseHero`（`gaokao.js:1191`） |

即**同一屏上「距 2028 年高考还有 N 天」与「所有考试已结束」并存**。

### 改动方案

**(a) 让 `final` 阶段日期从年度常量推导**（`gaokao.js:1088-1093`）

```js
// 高考日程的唯一来源（月用 1-12 的自然月号）
const EXAM_SCHEDULE = {
    start: { year: GAOKAO_YEAR, month: 6, day: 7 },   // 6/7 00:00
    end:   { year: GAOKAO_YEAR, month: 6, day: 10 },  // 6/10（结束时刻由最后一场考试决定）
};

const PHASE_CONFIG = {
    // ... zero / first / second / third 保持不变 ...
    final: {
        id: 'final', name: '高考', longName: '全国统一高考', short: '终',
        defaultStart: { ...EXAM_SCHEDULE.start },
        defaultEnd:   { ...EXAM_SCHEDULE.end },
        desc: '全国统一高考',
    },
};
```

**(b) 把 `exams` 与常量集中为单一声明区**（`gaokao.js:16-54`）

```js
// ---- 唯一时间来源 ----
const GAOKAO_YEAR = /* 保持不变 */;

const EXAMS = [
    { date: 7,  start: [9,0],  end: [11,30], name: '语文',            tag: 'mandatory' },
    { date: 7,  start: [15,0], end: [17,0],  name: '数学',            tag: 'mandatory' },
    { date: 8,  start: [9,0],  end: [10,15], name: '历史 / 物理',     tag: 'elective'  },
    { date: 8,  start: [15,0], end: [17,0],  name: '外语',            tag: 'mandatory' },
    { date: 9,  start: [8,30], end: [9,45],  name: '化学',            tag: 'elective'  },
    { date: 9,  start: [11,0], end: [12,15], name: '地理',            tag: 'elective'  },
    { date: 9,  start: [14,30],end: [15,45], name: '思想政治',        tag: 'elective'  },
    { date: 9,  start: [17,0], end: [18,15], name: '生物学',          tag: 'elective'  },
    { date: 10, start: [9,0],  end: [11,0],  name: '藏语文 / 彝语文', tag: 'special'   },
];
const exams = EXAMS;   // 兼容既有引用

// 高考起止：起点为 6/7 00:00，终点由最后一场考试决定（当前恰好 = 6/10 11:00）
const gaokaoStart = bjDate(GAOKAO_YEAR, 6, 7, 0, 0);
const gaokaoEnd   = examDates[examDates.length - 1].end;
```

> **注意**：把 `gaokaoEnd` 改为「最后一场考试的结束时刻」后，仍然等于 6/10 11:00（已实测差值 0 分钟），所以**图形效果不变**，但从此不再需要手工维护 `5, 10, 11, 0` 这个魔数。

**(c) 覆盖数据归一化 + 推导顺序校验**（`getPhaseDates`，`gaokao.js:1111-1124`）

```js
const OVERRIDE_LIMITS = { year: [2020, 2100] };
function isSaneOverride(ov) {
    if (!ov) return false;
    const keys = ['startYear','startMonth','startDay','endYear','endMonth','endDay'];
    if (!keys.every(k => Number.isInteger(ov[k]))) return false;
    if (ov.startYear < OVERRIDE_LIMITS.year[0] || ov.startYear > OVERRIDE_LIMITS.year[1]) return false;
    if (ov.endYear   < OVERRIDE_LIMITS.year[0] || ov.endYear   > OVERRIDE_LIMITS.year[1]) return false;
    if (ov.startMonth < 1 || ov.startMonth > 12 || ov.endMonth < 1 || ov.endMonth > 12) return false;
    if (ov.startDay   < 1 || ov.startDay   > 31 || ov.endDay   < 1 || ov.endDay   > 31) return false;
    return bjDate(ov.endYear, ov.endMonth, ov.endDay, 0, 0)
         >= bjDate(ov.startYear, ov.startMonth, ov.startDay, 0, 0);
}

function getPhaseDates(phaseId) {
    const cfg = PHASE_CONFIG[phaseId];
    const ov = phaseOverrides[phaseId];
    const use = isSaneOverride(ov) ? ov : null;
    if (ov && !use) console.warn('[gaokao] 忽略非法日期覆盖:', phaseId, ov);
    const s = use || cfg.defaultStart;
    const e = use || cfg.defaultEnd;
    return {
        start: bjDate(use ? ov.startYear : s.year, use ? ov.startMonth : s.month, use ? ov.startDay : s.day, 0, 0),
        end:   bjDate(use ? ov.endYear   : e.year, use ? ov.endMonth   : e.month, use ? ov.endDay   : e.day,   0, 0),
    };
}

// 阶段顺序自检（开发期可见，生产不抛错）
function assertPhaseOrder() {
    const list = PHASE_ORDER.map(id => getPhaseDates(id).start.getTime());
    for (let i = 1; i < list.length; i++) {
        if (list[i] < list[i - 1]) console.warn('[gaokao] 阶段日期未递增:', PHASE_ORDER[i - 1], '→', PHASE_ORDER[i]);
    }
}
```

**(d) 修掉"只加一年"的逻辑**（`gaokao.js:389`）

```js
// 旧：const nextStart = new Date(GAOKAO_YEAR + 1, 5, 7, 0, 0, 0);
const nextStart = bjDate(GAOKAO_YEAR + 1, 6, 7, 0, 0);
```

### 验证方法

1. 用 Node 复现时间逻辑，断言 `PHASE_CONFIG.final.defaultStart.getTime() === gaokaoStart.getTime()`。
2. 注入假「现在」（`new Date('2027-08-01T00:00:00+08:00')`）跑一遍 `getPhaseStatus`，5 个阶段应全部为 `done`，且页头徽章与 Hero 年份一致（都指向 2028）。
3. 手工把 `localStorage.gaokao_phase_settings` 改成 `{"final":{"startYear":"x"}}` 刷新，页面应正常渲染并输出 `console.warn`，而不是 `Invalid Date` 崩溃。

### 风险

低。`PHASE_CONFIG[].defaultStart/defaultEnd` 的字段形状不变，`getPhaseDates` 返回的仍是 `{start: Date, end: Date}`；唯一变化是年份来源。

---

## P0-2 高考日程双数据源，设置弹窗「改了没用」 🔴

### 现状与证据

- 设置弹窗（`renderSettingsForm`，`gaokao.js:1385-1429`）允许修改包括「高考」在内 5 个阶段的起止日期，保存进 `localStorage.gaokao_phase_settings`。
- 但高考总倒计时（`gaokao.js:53-54`、`378-394`）、9 张科目卡片（`examDates`，`gaokao.js:45-48`）、全屏进程（`updateFullscreen`）、小窗（`updatePipContent`）**全部读 `exams` + `GAOKAO_YEAR`，完全不读 `phaseOverrides.final`**。

**用户可复现**：设置里把高考开始改成 6 月 1 日 → 保存 → 回到高考阶段，Hero 与科目卡片毫无变化，只有阶段详情页和阶段导航跟着变。这是明确的交互缺陷。

### 改动方案（三选一，建议按 B 落地）

**方案 A（最小）**：设置弹窗中把「高考」一行的两个日期控件置灰只读，加提示「高考日期按国家统一安排，不可自定义」。

```js
// renderSettingsForm 内
const lock = id === 'final';
// 生成 dp-trigger 时：if (lock) 不绑定 openCalendar，加 class "dp-locked"，title="高考日期不可修改"
```

**方案 B（推荐：真正打通，单一数据源）**：让「高考」阶段的覆盖反过来驱动总计时。

```js
// 新增：求和出当前生效的高考起止（优先用户覆盖，其次默认）
function getFinalDates() { return getPhaseDates('final'); }

// gaokaoStart / gaokaoEnd 改为惰性函数（因为覆盖可能变化）
function getGaokaoStart() { return getFinalDates().start; }
function getGaokaoEnd() {
    const last = examDates[examDates.length - 1].end;   // 6/10 11:00（按 GAOKAO_YEAR）
    const { end } = getFinalDates();
    // 用户覆盖的结束日晚于最后一场时，以用户为准；否则以最后一场为准
    return end > last ? end : last;
}
```

把 `gaokao.js` 中对 `gaokaoStart` / `gaokaoEnd` 的 4 处直接引用改为函数调用，并在 `saveSettings()` 末尾统一 `updateAll(true)`（已有 `refreshPhaseUI()` → `updateAll(true)` 链路）。

> 若采用方案 B，**科目卡片的日期也应跟随**：建议把 `examDates` 改为按当前生效高考起始「同一天序」推导，或明确保留科目卡片永远按 6/7–6/10 展示、并在设置里注明「仅调整阶段展示日期，不改变科目时间」。**这是产品决策，需你确认**（见文末待确认项 Q1）。

**方案 C（最省事）**：保持现状，但在设置弹窗标题下加一行说明「此处仅用于阶段预报显示，不影响高考倒计时」，把语义讲清楚。

### 验证方法

改设置 → 保存 → 不动页面，Hero 标签、科目卡片首场时间、全屏进程、小窗标签**四处同时更新**；刷新后仍然一致。

---

## P0-3 Service Worker 缓存名恒定，改代码可能不生效 🔴

### 现状与证据

`gaokao/sw.js`：

```js
const CACHE = 'gaokao-cache-v1';                       // ← 版本号从不变化
const ASSETS = ['./index.html', './gaokao.js', './manifest.json'];
// HTML/JSON：网络优先；其他资源：缓存优先
event.respondWith(caches.match(event.request).then(c => c || fetch(event.request)));
```

线上实测响应头：`cache-control: max-age=600`（`gaokao.js` / `sw.js` 均为 600 秒）。

**失效路径**：用户首次访问后 `gaokao.js` 进入 `gaokao-cache-v1` → 你修复了 P0-1/P0-2 并部署 → 用户再访问，HTML 走网络优先拿到新版，但 `<script src="gaokao.js">` 命中**缓存优先** → **继续执行旧 JS**。因为 SW 文件本身内容没变（缓存名没改），浏览器也不会触发 SW 更新，这个状态可能长期持续。表现为「改了没用 / 只有清缓存才生效」。

### 改动方案

**新 `gaokao/sw.js`（完整替换）**：

```js
/* 四川高考倒计时 · Service Worker v2
 * 版本号必须随手改代码一起提升（与页面 footer 版本保持一致）。 */
const VERSION = '2.0.3';
const CACHE = `gaokao-cache-v${VERSION}`;
const ASSETS = ['./', './index.html', './gaokao.js', './manifest.json'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k.startsWith('gaokao-cache-') && k !== CACHE)
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;   // 只处理同源

    // HTML / JS / JSON 一律网络优先：保证改动能立刻生效，离线时回退缓存
    const isDynamic = /\.(?:html|js|json)$/.test(url.pathname) || url.pathname.endsWith('/');
    if (isDynamic) {
        event.respondWith(
            fetch(req)
                .then(res => {
                    if (res && res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
        );
        return;
    }

    // 静态资源（图标等）：缓存优先
    event.respondWith(
        caches.match(req).then(hit => hit || fetch(req).then(res => {
            if (res && res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
            }
            return res;
        }))
    );
});
```

**主线程加更新提示**（放在 `gaokao.js` 末尾 SW 注册处，`gaokao.js:1490-1495`）：

```js
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            // 有新版本在等待时，提示用户刷新（避免同一会话反复 reload）
            const notify = (worker) => {
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateHint();      // 见下方实现
                    }
                });
            };
            if (reg.waiting) notify(reg.waiting);
            reg.addEventListener('updatefound', () => notify(reg.installing));
        }).catch((e) => console.warn('[gaokao] SW 注册失败:', e));
    });
}

function showUpdateHint() {
    if (document.getElementById('swUpdateBar')) return;
    const bar = document.createElement('div');
    bar.id = 'swUpdateBar';
    bar.setAttribute('role', 'status');
    bar.textContent = '有新版本可用，点击刷新';
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;' +
        'z-index:200;padding:8px 18px;border-radius:999px;cursor:pointer;' +
        'background:var(--text-accent);color:var(--text-on-accent);font-size:0.78rem;';
    bar.addEventListener('click', () => location.reload());
    document.body.appendChild(bar);
}
```

**配套：把 `footer` 的 `v2.0.2` 文案改为单一来源**（`gaokao/index.html:1838`），例如 `<span id="versionLabel">v2.0.2</span>` 并由 JS 用常量填充，避免三处版本号漂移（HTML / sw.js / CHANGELOG）。

### 验证方法

1. Chrome DevTools → Application → Service Workers，勾选 Update on reload，改 `gaokao.js` 刷新，确认新逻辑生效且旧 cache key 被删除。
2. `Application → Cache Storage` 只剩一个 `gaokao-cache-v2.0.3`。
3. Application → 勾 Offline，刷新页面应仍能打开（回退缓存生效）。
4. 连续部署两次，第二次应弹出「有新版本可用」提示。

### 风险

中低。改为网络优先后首屏多一次网络往返（原本 HTML 已经是网络优先，所以实际变化很小），离线可用性保持不变。

---

# P1 · 改进项

## P1-1 时区未固定：非 UTC+8 用户倒计时偏差 8 小时 🟠

### 现状

所有时间都用 `new Date(y, 5, d, h, m, 0)` 按**浏览器本地时区**构造（`gaokao.js:45-48`、`53-54`、`389`、`762-763`、`772`、`1116-1122`）。身处 UTC+0 的用户看到的高考开始时刻比北京时间晚 8 小时（本地 6/6 16:00 起算），进程条、考试中/已完成状态同步错位。

### 改动方案：集中一个北京时间构造器

在 `gaokao.js` 顶部（`GAOKAO_YEAR` 之前）加入：

```js
// ============================================================
//  时间基准：高考日程一律以北京时间（UTC+8）为准，
//  避免用户所处时区导致倒计时偏移。
// ============================================================
const CN_OFFSET_MIN = 8 * 60;

/** 按北京时间构造 Date。month 用 1-12 的自然月号。 */
function bjDate(year, month, day, hour = 0, minute = 0, second = 0) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - CN_OFFSET_MIN * 60000);
}

/** 以北京时间格式化日期文案（阶段详情 / 日期范围） */
const CN_FMT = { timeZone: 'Asia/Shanghai' };
function fmtCnDate(date, opts) {
    return date.toLocaleDateString('zh-CN', Object.assign({}, CN_FMT, opts));
}
```

然后替换所有构造点：

| 位置 | 原 | 改为 |
|---|---|---|
| `gaokao.js:45-48` | `new Date(GAOKAO_YEAR, 5, ex.date, h, m, 0)` | `bjDate(GAOKAO_YEAR, 6, ex.date, h, m)` |
| `gaokao.js:53` | `new Date(GAOKAO_YEAR, 5, 7, 0, 0, 0)` | `bjDate(GAOKAO_YEAR, 6, 7, 0, 0)` |
| `gaokao.js:54` | `new Date(GAOKAO_YEAR, 5, 10, 11, 0, 0)` | 改为 `examDates` 最后一项的 `end`（见 P0-1b） |
| `gaokao.js:8` | `new Date(y, 5, 10, 11, 0, 0)` | `bjDate(y, 6, 10, 11, 0)` |
| `gaokao.js:389` | `new Date(GAOKAO_YEAR + 1, 5, 7, 0, 0, 0)` | `bjDate(GAOKAO_YEAR + 1, 6, 7, 0, 0)` |
| `gaokao.js:762-763` | 重复定义 `gaokaoStart/gaokaoEnd`（**同时删掉这处重复声明**） | 复用上面函数 |
| `gaokao.js:772` | `new Date(GAOKAO_YEAR + 1, 5, 7, 0, 0, 0)` | `bjDate(GAOKAO_YEAR + 1, 6, 7, 0, 0)` |
| `gaokao.js:1116-1122` | `new Date(ov.startYear, ov.startMonth - 1, ov.startDay)` | `bjDate(ov.startYear, ov.startMonth, ov.startDay)` |
| `gaokao.js:1210-1211`、`884-886` | `toLocaleDateString('zh-CN', fmtOpt)` | `fmtCnDate(date, fmtOpt)` |

**注意**：`gaokao.js:8` 的 `GAOKAO_YEAR` 自举存在循环依赖（`bjDate` 必须在它之前定义，而 `bjDate` 不依赖 `GAOKAO_YEAR`，所以安全）。

### 验证方法

1. `node` 里跑同一时刻：`TZ=UTC` 与 `TZ=Asia/Shanghai` 两种环境下，`bjDate(2027,6,7,9,0).toISOString()` 必须**完全一致**（都等于 `2027-06-07T01:00:00.000Z`）。
2. 浏览器 DevTools → Sensors → Location 换到 `Europe/London`，页面倒计时数值应与北京时间口径一致。
3. 阶段详情日期文案在任意时区都应显示「2027年6月7日」，而非 6 月 6 日。

### 遗留说明（诚实边界）

纯静态页面**无法**校准用户的系统时钟。想彻底防作弊需要服务端时间戳（与"零依赖静态站"原则冲突）。建议接受现状，但在 README 里写明「依赖设备本地时间」。

---

## P1-2 主题按钮文案语义反转 🟠

### 现状

`gaokao.js:584-611`：`themeToggle.textContent` 写入的是**当前主题**（暗色时显示「深色」），而按钮的 `title` 是「切换主题」。`gaokao/index.html:1844` 初始文本为「浅色」。

**用户可复现的困惑**：深色模式下按钮写着「深色」，用户以为点了会变深色，实际会切到浅色。

### 改动方案

改为「显示当前 + 箭头指向目标」，并补 `aria-pressed`：

```js
function syncThemeButton() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeToggle.textContent = isDark ? '深色 →' : '浅色 →';
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.title = isDark ? '当前深色，点击切换为浅色' : '当前浅色，点击切换为深色';
}
// loadTheme() 与 toggleTheme() 末尾统一调用 syncThemeButton()，不再各自写 textContent
```

同步更新 HTML 初始值 `<button ... id="themeToggle" aria-pressed="false">浅色 →</button>`。

---

## P1-3 自定义日历不可用键盘打开 🟠

### 现状

`.dp-trigger` 带 `tabindex="0"`（`gaokao.js:1407`、`1415`），但**没有任何 `keydown` 绑定**。`initCalendar`（`gaokao.js:1352-1383`）只有 click、外部点击关闭、resize、Escape。键盘用户能 Tab 到它，却打不开日历。

### 改动方案

`initCalendar` 内补键盘支持（同时把日历格子改为可键盘导航）：

```js
document.getElementById('settingsForm').addEventListener('keydown', (e) => {
    const trigger = e.target.closest('.dp-trigger');
    if (!trigger) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (calState && calState.trigger === trigger) closeCalendar();
        else openCalendar(trigger);
    }
});

// 日历弹窗内：方向键移动选中日、Enter 确认、Escape 关闭
document.getElementById('calPopup').addEventListener('keydown', (e) => {
    if (!calState) return;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta) {
        e.preventDefault();
        const base = bjDate(calState.year, calState.month, 1);
        // 基于当前选中日推进（需在 renderCalendar 里把选中日存进 calState.day）
        const day = new Date(base.getTime() + (calState.day - 1 + delta) * 86400000);
        calState.year = day.getFullYear();
        calState.month = day.getMonth() + 1;
        calState.day = day.getDate();
        renderCalendar(calState.year, calState.month);
        document.querySelector('#calDays .cal-day.selected')?.focus();
    }
});
```

配套：`renderCalendar` 时把 `calState.day` 记下来；`selectDay` 后把焦点归还给 `calState.trigger`。

> 提示：`renderCalendar` 里 `const dStr = \`${year}-${month}-${cell.day}\`` 与 `todayStr`（未补零，`gaokao.js:1295`）比较。当前恰好能对（因为 getMonth()+1 不补零、数字日也不补零），但这是**脆弱的一致**；建议两边都走 `pad2`。

---

## P1-4 设置「恢复默认」按钮绑定脆弱 🟠

### 现状

`renderSettingsForm`（`gaokao.js:1425-1428`）用 `innerHTML` 注入 `<button id="settingsReset">`，点击委托绑在 `#settingsForm` 上（`gaokao.js:1479-1481`）。因为处理函数里会 `renderSettingsForm()` 重建 DOM，冒泡路径虽已确定、当前能工作，但属于**隐式依赖冒泡语义的实现**，任何一次结构调整都可能静默失效（此按钮无任何测试覆盖）。

### 改动方案

创建元素后直接绑定，去掉委托：

```js
const resetBtn = document.createElement('button');
resetBtn.className = 'sm-reset-btn';
resetBtn.type = 'button';
resetBtn.textContent = '↻ 恢复默认';
resetBtn.addEventListener('click', resetSettings);
resetDiv.appendChild(resetBtn);
```

同时删除 `gaokao.js:1479-1481` 的委托监听。

**顺带修 `resetSettings` 的体验缺陷**：`gaokao.js:1466-1470` 只清了 `phaseOverrides` 并重渲染表单，**没有调用 `refreshPhaseUI()`**，所以必须再点一次「保存」才生效。建议：

```js
function resetSettings() {
    phaseOverrides = {};
    savePhaseSettings();
    renderSettingsForm();
    refreshPhaseUI();     // ← 立即生效
}
```

---

## P1-5 Hero「进行中」脉冲动画永不触发（死代码） 🟡

### 现状

`.hero-countdown.ongoing .timer .num { animation: pulseSoft ... }`（`gaokao/index.html:223`）依赖 `ongoing` 类。全项目只有 `gaokao.js:381` 会 `add('ongoing')`，而它位于 `if (now >= gaokaoStart && now <= gaokaoEnd)` 分支内 —— 但由于初始化末尾执行 `switchPhase('final')`（`gaokao.js:1487`）会把 `updateAll` 的高考分支永久短路（`gaokao.js:364-368` 提前 return），**该分支运行时永不执行**。

结果：`add('ongoing')` 是死代码；而 `gaokao.js:1184`（`updatePhaseHero` 的进行中分支）只 `add`、**没有任何地方 `remove`**，所以一旦进入某阶段进行中，`ongoing` 类会一直残留。

### 改动方案

统一在 `updatePhaseHero` 里按状态开关，并让高考阶段也用同一入口：

```js
function updatePhaseHero() {
    const now = new Date();
    const cfg = PHASE_CONFIG[activePhaseId];
    const { start, end } = getPhaseDates(activePhaseId);
    dom.yearBadge.textContent = COHORT_LABEL;

    let ongoing = false;
    if (now < start) {
        setHero(start - now, `距 ${cfg.name} 还有`);
    } else if (now <= end) {
        setHero(end - now, `距 ${cfg.name} 结束还有`);
        ongoing = true;
    } else {
        const nextPhase = PHASE_ORDER.find(id => getPhaseDates(id).start > now);
        if (nextPhase) setHero(getPhaseDates(nextPhase).start - now, `距 ${PHASE_CONFIG[nextPhase].name} 还有`);
        else setHero(0, '所有考试已结束 · 金榜题名');
    }
    dom.heroSection.classList.toggle('ongoing', ongoing);
    dom.statusMsg.classList.toggle('show', activePhaseId === 'final' && ongoing);
}
```

然后删除 `gaokao.js:378-394` 里针对 Hero 的重复逻辑（改为在 `updateAll` 的 final 分支调用 `updatePhaseHero()`，真正实现单一来源）。

**配套（可选，视觉收益明显）**：把 `updatePhaseDetail` 里的内联动画（`gaokao.js:1238-1239` 直接改 `style.animation`）改为 CSS 类：

```css
/* index.html，紧跟 .pd-countdown 规则 */
.pd-countdown .pd-timer { }
.phase-detail.ongoing .pd-timer .num { animation: pulseSoft 1.5s ease-in-out infinite; }
```

JS 只需 `detail.classList.toggle('ongoing', status === 'ongoing')`。

---

## P1-6 阶段状态徽章不随时间自动翻转 🟠

### 现状

`initPhaseNav()`（`gaokao.js:1135-1152`）只在启动（`1485`）与保存设置（`refreshPhaseUI`，`1460`）时执行。`updatePhaseHero` / `updatePhaseDetail` **都不重建阶段导航**。

**后果**：页面开着不动跨越某阶段边界（例如 2026-12-22 00:00 一诊开始）时，阶段 Tab 的「一」不会变成「进行中」，「已结束」的 ✓ 也不会出现，必须刷新。

### 改动方案

在 `updateAll` 的非 final 分支里增加低成本检测（每秒一次的比较，不重建 DOM）：

```js
let lastPhaseStatusKey = '';
function syncPhaseNavStatus(now) {
    const key = PHASE_ORDER.map(id => getPhaseStatus(id)).join('|');
    if (key === lastPhaseStatusKey) return;      // 状态没变就不动 DOM
    lastPhaseStatusKey = key;
    document.querySelectorAll('.phase-tab').forEach(tab => {
        const id = tab.dataset.phase;
        const status = getPhaseStatus(id);
        const cfg = PHASE_CONFIG[id];
        tab.classList.toggle('done', status === 'done');
        tab.querySelector('.pt-sub').textContent =
            status === 'done' ? '已结束' : status === 'ongoing' ? '进行中' : cfg.short;
        const hasBadge = !!tab.querySelector('.pt-badge');
        if (status === 'done' && !hasBadge) {
            const b = document.createElement('span');
            b.className = 'pt-badge'; b.textContent = '✓';
            tab.appendChild(b);
        } else if (status !== 'done' && hasBadge) {
            tab.querySelector('.pt-badge').remove();
        }
    });
}
```

在 `updateAll` 开头（任何分支都执行）调用 `syncPhaseNavStatus(now)`。

---

## P1-7 弹窗与全屏缺少可访问性语义 🟠

### 现状

| 元素 | 位置 | 缺什么 |
|---|---|---|
| 设置弹窗 | `index.html:1903` | 无 `role="dialog"`、`aria-modal`、`aria-labelledby`；无焦点陷阱；关闭后焦点不归还 |
| 日历弹窗 | `index.html:1916` | 无 `role`；无 `aria-expanded` 关联 |
| 全屏覆盖层 | `index.html:1852` | 无 `role="dialog"`；退出按钮 `✕ 退出` 无可访问名 |
| 选科选项 | `index.html:1816-1824` | 可点击 `<span>`，无键盘、无 `aria-pressed`，读屏完全不可知 |
| 倒计时数字 | `heroTimer` / `pd-timer` / 科目卡片 | 无 `aria-live`，每秒变化对读屏用户是噪音，但又完全不可感知 |

### 改动方案

**(a) 弹窗语义 + 焦点管理**（`gaokao.js` 的 `openSettings` / `closeSettings`）：

```js
let lastFocused = null;

function openSettings() {
    lastFocused = document.activeElement;
    renderSettingsForm();
    const modal = document.getElementById('settingsModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    lockScroll(true);
    // 焦点移入弹窗第一个可聚焦元素
    const first = modal.querySelector('button, [tabindex="0"]');
    if (first) first.focus();
    document.addEventListener('keydown', trapFocus);
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    lockScroll(false);
    document.removeEventListener('keydown', trapFocus);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function trapFocus(e) {
    if (e.key === 'Escape') { closeSettings(); return; }
    if (e.key !== 'Tab') return;
    const modal = document.getElementById('settingsModal');
    const items = modal.querySelectorAll('button, [tabindex="0"]');
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
```

HTML 侧（`index.html:1903-1905`）：

```html
<div class="modal-overlay" id="settingsModal" role="dialog" aria-modal="true"
     aria-labelledby="smTitle" aria-hidden="true">
    <div class="settings-modal">
        <div class="sm-title" id="smTitle">考试日程设置</div>
```

**(b) 选科改为真正的按钮**（行为不变、语义正确）：

```html
<button type="button" class="ss-option" data-subject="历史" aria-pressed="false">历史</button>
```

```js
// initSubjectSelector 内，切 active 时同步 aria-pressed
el.classList.toggle('active', nextActive);
el.setAttribute('aria-pressed', String(nextActive));
```

同时 `.ss-option` 需补 `font: inherit; cursor: pointer;`（`index.html:434` 附近）以消除 `<button>` 默认样式差异。

**(c) 倒计时播报降噪**：总倒计时（`#heroTimer`）加 `role="timer"` + `aria-live="off"`，并在 Hero 的 **分钟** 层级加一个视觉隐藏的播报节点（避免每秒播报）：

```html
<div class="timer" id="heroTimer" role="timer" aria-live="off">
```

```html
<!-- 供读屏，每分钟更新一次 -->
<span class="sr-only" id="heroA11y" aria-live="polite" aria-atomic="true"></span>
```

```css
.sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
```

```js
// updateAll 内，仅当分钟值变化时更新
const a11yKey = `${d}-${h}-${m}`;
if (a11yKey !== lastA11yKey) {
    lastA11yKey = a11yKey;
    const el = document.getElementById('heroA11y');
    if (el) el.textContent = `${dom.heroLabel.textContent} ${d} 天 ${h} 小时 ${m} 分`;
}
```

**(d) 键盘可见焦点**（`index.html` `<style>` 顶部附近）：

```css
:focus-visible {
    outline: 2px solid var(--text-accent);
    outline-offset: 2px;
    border-radius: 4px;
}
```

---

## P1-8 缺少 `prefers-reduced-motion` 支持 🟠

### 现状

4 个无限/循环动画（`pulseSoft` `index.html:228`、`pulseDot` `712`、`shimmer` `1148`、`fadeUp` `736`）在系统「减少动态效果」开启时仍然运行，前庭敏感用户无法关闭。

### 改动方案

在 `<style>` 末尾（`@media (max-width: 600px)` 之后，`index.html:1674` 前）加：

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        scroll-behavior: auto !important;
    }
    /* 骨架屏改为静态色块，避免扫光 */
    .skeleton .sk-block::after,
    .skeleton .sk-line::after,
    .skeleton .sk-bar::after,
    .skeleton .sk-pill::after { animation: none !important; opacity: 1 !important; }
}
```

**注意保留进度条宽度过渡**：如果你的产品希望进度条仍平滑变化，把 `.ce-progress-fill, .fs-progress-fill { transition-duration: revert !important; }` 单独提出来。

---

# P2 · 增强项

## P2-1 安全区适配与移动端视口 🟠

### 现状

- `viewport-fit=cover` 已声明（`index.html:5`），但**全站没有一处 `env(safe-area-inset-*)`**。
- `.action-bar { position: fixed; bottom: 24px; right: 24px; }`（`index.html:744-751`），移动端断点改为 `bottom:16px; right:16px`（`1669`）—— 带 Home 指示条的 iPhone 上按钮会压进指示条区域。
- 全屏用 `height: 100vh`（`index.html:821`），移动端地址栏伸缩时会露底。

### 改动方案

```css
body {
    padding-left: max(24px, env(safe-area-inset-left));
    padding-right: max(24px, env(safe-area-inset-right));
    padding-bottom: max(24px, env(safe-area-inset-bottom));
}
.action-bar {
    bottom: calc(24px + env(safe-area-inset-bottom, 0px));
    right: calc(24px + env(safe-area-inset-right, 0px));
}
.fs-overlay {
    height: 100vh;
    height: 100dvh;            /* 新内核用动态视口，旧内核回退 100vh */
    padding-bottom: env(safe-area-inset-bottom, 0px);
}
.fs-exit { top: calc(16px + env(safe-area-inset-top, 0px)); }
@media (max-width: 600px) {
    .action-bar {
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        right: calc(16px + env(safe-area-inset-right, 0px));
    }
}
```

---

## P2-2 时间逻辑四处重复，抽成单一模块 🟡

### 现状

「按阶段/考试目标算剩余时间并格式化」这套逻辑在 4 处各写了一遍：

| 位置 | 函数 | 行数 |
|---|---|---|
| 高考总倒计时 + 科目卡片 | `updateAll` | `gaokao.js:360-550` |
| 阶段 Hero + 阶段详情 | `updatePhaseHero` / `updatePhaseDetail` | `1171-1240` |
| 全屏 | `updateFullscreen` | `865-1023` |
| 小窗 | `updatePipContent` | `757-811` |

每次改口径（如 P1-1 的时区）都要同步改 4 遍，且 `updatePipContent` 里还**重复声明**了 `gaokaoStart` / `gaokaoEnd`（`gaokao.js:762-763`），遮蔽了外层同名常量（`53-54`）——这是明确的一致性隐患。

### 改动方案

抽出一个纯函数模块（建议新建 `gaokao/time.js`，用 `<script>` 在 `gaokao.js` 之前引入，无需 ES module）：

```js
/* gaokao/time.js —— 纯时间计算，不碰 DOM。依赖 gaokao.js 里定义的常量，
   或把常量也移到这里（推荐：把 GAOKAO_YEAR / EXAMS / 时间基准全部搬过来）。 */

/** 剩余量拆分为 天/时/分/秒 */
function splitDuration(ms) {
    const clamped = Math.max(0, ms);
    return {
        d: Math.floor(clamped / 86400000),
        h: Math.floor((clamped % 86400000) / 3600000),
        m: Math.floor((clamped % 3600000) / 60000),
        s: Math.floor((clamped % 60000) / 1000),
    };
}

/** 目标状态机：waiting | ongoing | done */
function targetState(now, start, end) {
    if (now < start) return 'waiting';
    if (now <= end) return 'ongoing';
    return 'done';
}

/** 统一算「当前要展示的目标」：高考总目标 or 某阶段目标 */
function resolveTarget({ now, kind, phaseId, exam, selectedSubjects }) { /* ... */ }

/** 统一文案 */
function formatCountdown(parts, style) { /* style: 'colon' | 'cn' | 'compact' */ }
```

然后 `gaokao.js` 的四处更新函数都改为调用这些纯函数、只负责把结果写进 DOM。同时**给 `time.js` 配单元测试**（见 P2-3）。

**迁移顺序建议**：先抽 `splitDuration` + `targetState`（纯机械替换，风险最低）→ 再抽 `resolveTarget`（需仔细处理"考虑选科"的分支）→ 最后统一文案格式化。

---

## P2-3 补零依赖回归测试 🟡

### 现状

零测试。P0-1 那类「阶段顺序 / 年份一致性」错误一旦引入，只能靠人肉发现。

### 改动方案

用 Node 20 内置的 `node:test`（**不引入任何依赖**），新建 `tests/time.test.mjs`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../gaokao/gaokao.js', import.meta.url), 'utf8');
// 在受控沙箱里求值：注入假 Date，只取常量定义区（到 "选科标记" 之前）
function loadCore(nowIso) {
    const head = src.split('//  选科标记')[0];
    const sandbox = {
        Date: class extends Date { constructor(...a) { super(...(a.length ? a : [nowIso])); } },
        console,
    };
    vm.createContext(sandbox);
    vm.runInContext(head + '\n;globalThis.__out = { GAOKAO_YEAR, exams, examDates, gaokaoStart, gaokaoEnd };', sandbox);
    return sandbox.__out;
}

test('gaokaoStart 等于 final 阶段默认开始（防止年份双源回归）', () => {
    const core = loadCore('2026-09-01T00:00:00+08:00');
    assert.equal(core.GAOKAO_YEAR, 2027);
    assert.equal(core.gaokaoStart.getTime(), core.examDates[0].start.getTime() - 9 * 3600000);
});

test('gaokaoEnd 不早于最后一场考试结束', () => {
    const core = loadCore('2026-09-01T00:00:00+08:00');
    assert.ok(core.gaokaoEnd >= core.examDates.at(-1).end);
});

test('跨过 6/10 11:00 后年份推进到下一年', () => {
    assert.equal(loadCore('2027-06-10T10:59:00+08:00').GAOKAO_YEAR, 2027);
    assert.equal(loadCore('2027-06-10T11:01:00+08:00').GAOKAO_YEAR, 2028);
});

test('9 场考试时间严格递增且无重叠', () => {
    const { examDates } = loadCore('2026-09-01T00:00:00+08:00');
    assert.equal(examDates.length, 9);
    for (let i = 1; i < examDates.length; i++) {
        assert.ok(examDates[i].start >= examDates[i - 1].end, `第 ${i + 1} 场与前一场重叠`);
    }
});

test('时区无关：UTC 与 Asia/Shanghai 下时间戳相同', () => {
    const a = loadCore('2026-09-01T00:00:00+08:00');
    // 该测试需配合运行两次（TZ=UTC / TZ=Asia/Shanghai）比较快照，见 CI 说明
    assert.equal(a.gaokaoStart.getTime(), 1812297600000);
});
```

运行：

```powershell
node --test tests/
$env:TZ='UTC'; node --test tests/     # 验证时区无关性
```

同时把 `package.json` 作为**纯脚本容器**引入（不引入任何 dependency）：

```json
{
  "name": "nightvoyager-pages",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

时区无关性用两条命令验证（不需要任何依赖）：

```powershell
node --test tests/
$env:TZ='UTC'; node --test tests/
```

> 若你希望彻底不出现 `package.json`，可以只保留 `tests/` 目录 + 一条手动命令，写进 README 即可。**这是待确认项 Q2。**

---

## P2-4 CSS / 结构清理 🟡

| 问题 | 位置 | 建议 |
|---|---|---|
| 内联 1660 行 CSS 混在 HTML | `index.html:16-1675` | 抽出 `gaokao/style.css`，用 `<link rel="stylesheet">` 引入。单文件从 67 KB 降到约 12 KB；HTTP/2 下多一次请求代价很小。需同步更新 `sw.js` 的 `ASSETS` |
| 硬编码颜色绕过变量 | `index.html:909-914`（`#c8a870`）、`gaokao.js:151`（`#dc3545`）、`gaokao.js:310`（`#bbb`）、`gaokao.js:652-657`（PiP 内联配色） | 全部改为 CSS 变量或新增 `--warn` / `--text-dim` 变量，PiP 用 `getComputedStyle(document.documentElement).getPropertyValue('--text-accent')` 读取主文档变量，保证深浅主题一致 |
| 只有一个断点 | `index.html:1640` | 补 `@media (min-width: 900px)` 限制内容最大宽度（当前 `.container` 在大屏上过宽），以及 `@media (max-width: 380px)` 兜底超小屏 |
| 未使用的 DOM 缓存 | `gaokao.js:201`（`dom.fsStatusDot` 从未读取） | 删除 |
| 未使用变量 | `gaokao.js:1270-1275` 附近的日历定位魔数 `272` / `300` | 改为读取 `popup.offsetWidth/offsetHeight`，避免样式改动后定位错位 |
| `</br>` 非法闭合 | `index.html:13-14`, `22-23` | 改为 `<br>`（两处各两个） |
| 标签未闭合 | `index.html:26` 的 `<dl>`、`24` 的 `<nav>` | 补 `</dl>` 与 `</nav>`（缺失的 `</dl>` 会导致后续元素被浏览器改挂到 `dl` 下） |
| 导航项文案过期 | `index.html:27`（`gaokao_schedule`） | 改为「高考倒计时」（v2.0.2 已把入口从 `gaokao_schedule.html` 改成 `gaokao/`，名称未同步） |
| 缺少 meta | `gaokao/index.html` `<head>` | 补 `<link rel="canonical" href="https://www.nightvoyager.online/gaokao/">`、Open Graph（`og:title` / `og:description` / `og:url` / `og:type`），分享到微信/QQ 时卡片不会空白 |

---

## P2-5 性能微优化 🟡

| 项 | 现状 | 建议 | 预期收益 |
|---|---|---|---|
| `Intl` 格式化每帧构造 | `updatePhaseDetail`（`gaokao.js:1209-1211`）每秒调 2 次 `toLocaleDateString` | 把 `Intl.DateTimeFormat` 实例提到模块级缓存（`const FMT_FULL = new Intl.DateTimeFormat('zh-CN', {...})`），每秒省下 2 次 formatter 构造 | 中 |
| 每秒 40+ 次无条件 DOM 写入 | `updateAll`（`gaokao.js:397-457`）9 场 × 4 数字 + 卡片状态类 | 给每个 `textContent` 写入前加短路：`if (el.textContent !== v) el.textContent = v;`；`classList.toggle(cls, bool)` 本身已幂等，但 `querySelector` 查找（`.exam-done-badge`）应缓存 | 中 |
| 未使用的 CSS 死代码 | `index.html:223`（`.hero-countdown.ongoing`，见 P1-5） | 若按 P1-5 接通则保留，否则删除 | 低 |
| `favicon.ico` 270 KB | 根目录 | 压到 ≤ 32 KB（多尺寸 ICO），或改用 SVG + PNG fallback。作为静态站点最大单项资源，收益最直接 | 高（首屏） |
| 骨架屏覆盖层无法被读屏忽略 | `index.html:1681` | 加 `aria-hidden="true"`（它本来就只是装饰） | 低（可访问性） |
| `setInterval(updateFullscreen, 1000)` 常驻 | `gaokao.js:1055-1057` | 全屏覆盖层关闭时应 `clearInterval`，或合并进主 rAF 循环（`updateAll` 里判断 `fsOverlay.open` 再调 `updateFullscreen`），可彻底去掉一个定时器与一份重复代码 | 中 |

**建议的合并方案**（同时解决 P2-5 最后一行 + P2-2）：

```js
function tickLoop(time) {
    if (time - lastTick >= 1000) {
        lastTick = time;
        updateAll();
        if (fsOverlay.classList.contains('open')) updateFullscreen();   // 合并原 setInterval
    }
    requestAnimationFrame(tickLoop);
}
```

删除 `gaokao.js:1054-1057` 的 `setInterval`。

---

## P2-6 文档与仓库卫生 🟡

| 项 | 现状 | 建议 |
|---|---|---|
| `README.md` 功能描述过期 | `README.md:3-4` 写「高考时间表」，实际是「倒计时 + 五阶段预报」 | 更新为当前功能清单，并补一句「倒计时依赖设备本地时间，以北京时间（UTC+8）为基准」 |
| `CHANGELOG.md` 未提交 | git 历史中无 `gaokao/CHANGELOG.md` | 与 P0 修复一起提交，并补 v2.0.3 条目 |
| 目录结构文档与实现不符 | `CHANGELOG.md:15-27` 写「根目录含 CHANGELOG.md」，实际它在 `gaokao/` 下 | 修正 |
| 版本号三处漂移 | `index.html:1838` footer `v2.0.2`、`sw.js` 的 `gaokao-cache-v1`、CHANGELOG | 收敛为单一 `VERSION` 常量（见 P0-3 配套） |
| 无 404 页 | 自定义域名下落到 GitHub 默认 404 | 加根目录 `404.html`，风格与个人主页一致 |
| 无 `robots.txt` / `sitemap.xml` | — | 至少加 `robots.txt`（允许抓取 + 指向 sitemap） |
| `favicon.ico` 之外的社交图 | — | 补 `og:image`（可用 `manifest.json` 里那张 `考` 字 SVG 导出 1200×630 PNG） |

---

# 附录 A · 实施方案（建议的 PR 拆分）

| PR | 分支名 | 内容 | 验收标准 |
|---|---|---|---|
| **PR #1** | `fix/phase-year-and-sw-cache` | P0-1、P0-2、P0-3 | ① `node --test tests/` 全绿；② 假时间 2027-08-01 下页头与 Hero 年份一致；③ 改设置后四处倒计时同步；④ DevTools 里旧 cache key 被清理且离线可打开 |
| **PR #2** | `feat/a11y-and-robustness` | P1-1 ~ P1-8 | ① `TZ=UTC` 与 `TZ=Asia/Shanghai` 时间戳一致；② 纯键盘可从 Tab 到日历并选定日期；③ 弹窗 Esc 关闭且焦点归还；④ 系统「减少动态效果」开启后无循环动画；⑤ 阶段跨越时徽章自动翻转 |
| **PR #3** | `refactor/time-module-and-polish` | P2-1 ~ P2-6 | ① CSS 抽离后视觉零回归（逐屏截图对比）；② 主线程无每秒重复的 `Intl` 构造；③ HTML 校验通过；④ 版本号单一来源 |

# 附录 B · 验证清单（可直接勾选）

**时间正确性**
- [ ] `GAOKAO_YEAR` 在 6/10 11:00 前后正确切换（10:59 → 本年，11:01 → 次年）
- [ ] 页头徽章、Hero 年份、阶段导航「高考」三者年份永远一致
- [ ] 9 场考试时间严格递增、无重叠、无跨天
- [ ] `gaokaoEnd` ≥ 最后一场考试结束时刻
- [ ] 同一时刻在 `TZ=UTC` / `TZ=Asia/Shanghai` / `TZ=America/New_York` 下倒计时数值一致
- [ ] 阶段详情日期文案在任意时区都显示北京时间日期

**状态机**
- [ ] 开考前 ≥1 天：天数正常递减
- [ ] 开考前 <24h：不产生「0 天」歧义（确认产品口径）
- [ ] 考试中：卡片显示「考试中」+ 脉冲点，进程条随时间增长
- [ ] 单科结束：显示「已完成」徽章，倒计时数字清空
- [ ] 全部结束：Hero / 科目卡 / 全屏 / 小窗四处都进入完成态，文案不再是「距结束还有」
- [ ] 阶段跨越时阶段 Tab 徽章自动翻转（不刷新页面）

**设置与持久化**
- [ ] 修改阶段日期 → 保存 → 四处同步 → 刷新后保持
- [ ] 「恢复默认」一步生效（无需再点保存）
- [ ] 手工写入非法 `localStorage` → 页面正常渲染 + `console.warn`，不白屏
- [ ] 清除 localStorage → 回到默认日程

**PWA / 缓存**
- [ ] 首次访问后 Cache Storage 只有一个 `gaokao-cache-v{当前版本}`
- [ ] 修改 `gaokao.js` 部署后，用户刷新即生效（无旧 JS 残留）
- [ ] 离线刷新仍可打开
- [ ] 有新版本时出现刷新提示
- [ ] 可安装到桌面，独立窗口 `start_url` 正确

**可访问性**
- [ ] 全站可用 Tab 键走完所有交互元素，焦点可见
- [ ] 运行 Lighthouse 无障碍项（目标 ≥ 90）
- [ ] 系统开启「减少动态效果」后无循环动画
- [ ] 弹窗 Esc 可关闭、焦点归还触发元素
- [ ] 选科按钮可键盘操作且读屏能播报选中状态
- [ ] iOS Safari 带 Home 指示条设备上，底部按钮不被遮挡
- [ ] 全屏模式在移动端地址栏伸缩时不露底

**性能**
- [ ] Lighthouse 性能 ≥ 90（移动端）
- [ ] 首屏无布局抖动（CLS ≈ 0）
- [ ] `favicon.ico` 压至 ≤ 32 KB
- [ ] 主线程每秒无重复的 `Intl` 构造（Performance 面板确认）

# 附录 C · 需你确认的产品决策

| # | 问题 | 影响 |
|---|---|---|
| **Q1** | 用户在设置里改「高考」阶段日期时，**科目卡片（9 场考试时间）是否也要跟着变**？ | 决定 P0-2 走方案 B（打通）还是方案 A/C（只读或仅改文案）。打通需要重新定义「单科时间如何随高考起始日平移」，涉及产品语义 |
| **Q2** | 是否可以引入 `package.json`（**仅作脚本容器、零依赖**）以运行 `node --test`？ | 决定 P2-3 用 `npm test` 还是手动命令 |
| **Q3** | 「高考进行中」时 Hero 的 `ongoing` 脉冲动画：**是要接通（按 P1-5 修复）还是直接删掉这段死 CSS**？ | 影响视觉，两种都合理 |
| **Q4** | 是否同意把 1660 行内联 CSS 抽成 `gaokao/style.css`？ | 触及文件结构，会让 `sw.js` 的 `ASSETS` 变化；好处是可维护性大幅提升 |
| **Q5** | 倒计时天数是否保留「整日截断」（考前 24h 内显示 `0 天`）？还是改为「不足 1 天」/补足小时语义？ | 影响主视觉文案习惯 |
| **Q6** | 是否要为「防篡改」接受服务端时间戳（会打破纯静态零依赖）？ | 若不需要，则在 README 明确声明依赖本地时钟即可 |

# 附录 D · 上轮报告中需更正的一处

上轮我说「全屏覆盖层 `.open` 类在 CSS 中未定义，只靠 Fullscreen API 生效」——**这是错误的**。实测 `.fs-overlay.open { display: block; }` 定义在 `gaokao/index.html:796`，覆盖层显示逻辑正常。全文其余结论均经代码复核。
