# 技术架构

## 目录结构

```
gaokao/                          ← 应用根目录，也是 GitHub Pages 的发布单元
├── index.html          420 行   结构与无障碍语义（样式与逻辑全部外置）
├── style.css          4019 行   全部样式、主题 token、响应式布局
├── time.js             366 行   时间基准 / 考试与阶段配置 / 节假日兜底表 · 不碰 DOM
├── lunar.js            278 行   农历与二十四节气（朔表 + 节气兜底表） · 不碰 DOM
├── gaokao.js          2765 行   DOM 渲染、事件绑定、每秒更新循环
├── sw.js               112 行   Service Worker（缓存版本化 + 网络优先）
├── manifest.json        27 行   PWA 清单（图标为内联 data-URI SVG）
├── data/
│   ├── holidays.json             节假日（运行时覆盖 time.js 的兜底表）
│   └── solar-terms.json          节气（运行时覆盖 lunar.js 的兜底表）
├── preview.html      100 KB    设计基准 demo · 带 noindex，不参与运行时
├── README.md                    面向人类的入口文档
├── AGENTS.md                    面向 AI / 维护者的路由器
├── CHANGELOG.md                 逐版本变更记录
└── docs/                        本目录
    ├── README.md                文档索引与阅读路径
    ├── overview.md              定位、目标与取舍、已知限制
    ├── architecture.md          本文
    ├── implementation.md        逐模块实现与 DOM 契约
    ├── modules.md               功能模块行为
    ├── DESIGN.md                界面设计语言（token / 形状 / 组件规格）
    ├── data.md                  数据格式与年度更新流程
    ├── testing.md               三层验证与历次真实缺陷
    ├── VISUAL-CHECK.md          视觉验收协议
    ├── deployment.md            发布与缓存
    ├── development.md           开发规范与 CSS 权重约定
    └── MAINTENANCE.md           变更的辐射面：改什么要同步改哪里
```

## 分层与依赖方向

```
        ┌─────────────────────────────────────────┐
        │  数据层（纯数据 + 纯函数，零 DOM）        │
        │  time.js        lunar.js                 │
        │  ├ 时间基准      ├ 朔表 + 农历换算        │
        │  ├ 考试/阶段配置  ├ 节气兜底表            │
        │  └ 节假日兜底表   └ 节气近似表            │
        └────────────────┬────────────────────────┘
                         │ 全局函数 / 常量（无模块系统）
                         ▼
        ┌─────────────────────────────────────────┐
        │  数据覆盖层（异步，可选）                 │
        │  data/holidays.json  → setHolidayData()  │
        │  data/solar-terms.json → setSolarTermsData()
        └────────────────┬────────────────────────┘
                         │ fetch 成功才替换；失败静默保留兜底
                         ▼
        ┌─────────────────────────────────────────┐
        │  展示层（持有全部 DOM 引用与状态）        │
        │  gaokao.js                               │
        │  ├ cacheDom() 集中缓存 28+ 元素          │
        │  ├ render() / updateAll()                │
        │  └ 交互：阶段、选科、日历、主题、弹窗      │
        └────────────────┬────────────────────────┘
                         │ class / id / CSS 自定义属性
                         ▼
        ┌─────────────────────────────────────────┐
        │  表现层                                   │
        │  style.css（token 系统 + 组件 + 响应式）  │
        │  index.html（语义结构）                   │
        └─────────────────────────────────────────┘
```

**依赖是单向的，且没有模块系统。** 三个 JS 文件通过 `<script>` 顺序加载，
共享全局作用域，因此**加载顺序是硬约束**：

```html
<script src="time.js"></script>    <!-- 1. 常量与纯函数必须先就位 -->
<script src="lunar.js"></script>   <!-- 2. 依赖 time.js 的 bjDate / CN_OFFSET_MIN / MS_DAY -->
<script src="gaokao.js"></script>  <!-- 3. 依赖前两者 -->
```

`time.js` 与 `lunar.js` **一行 DOM 代码都没有**，因此可以脱离浏览器验证
（见 [testing.md](testing.md) 的冻结回归）。

---

## 关键设计决策

以下每一条都有明确的「为什么」，其中多数是踩坑后形成的。

### 1. 时间一律以北京时间（UTC+8）为基准

**做法**：所有日期经由 `time.js` 的 `bjDate(year, month, day, h, m, s)` 构造。
**禁止**直接写 `new Date(year, month, day)` —— 那会按浏览器本地时区解释。

```js
bjDate(2027, 6, 7, 9, 0).toISOString();   // '2027-06-07T01:00:00.000Z' ← 北京 09:00
```

日期文案用 `fmtCnFull` / `fmtCnMonthDay`（内部固定 `timeZone: 'Asia/Shanghai'`）。

> **曾经的坑**：早期所有日期按浏览器本地时区构造，非 UTC+8 用户看到的倒计时
> 整体偏移 8 小时。这类 bug 在 UTC+8 开发机上看不出来。

**两套「日序号」口径不可混用**（这是最容易静默出错的地方）：

| 函数 | 所在文件 | 基准 | 返回值示例（2026-02-04） |
| --- | --- | --- | --- |
| `cnDayNumber()` | `gaokao.js` | **1970-01-01** | `20488` |
| `lunarEpochDay()` | `lunar.js` | **2000-01-01** | `9531` |

两者相差 `LUNAR_EPOCH_DAY = 10957` 天。混用会让农历查表**全部落空且不报错**，
只是静默显示不出农历 —— 开发中踩过一次。

同时注意 `cnDayKey()` 返回**不补零**格式（`2026-10-2`），
而 `data/holidays.json` 用**补零**格式（`2026-10-02`）。
早期直接用字符串比较判断日期相邻，永远不相等，导致假期段无法合并。
现统一改用 `holidayDateNumber()` 换算成整数日序号后比较。

### 2. 单一数据源

| 数据 | 唯一来源 | 派生处 |
| --- | --- | --- |
| 考试科目与时间 | `time.js` 的 `exams`（只配「日 + 时 + 分」） | 年份由 `GAOKAO_YEAR` 补齐 |
| 高考年份 | `time.js` 的 `GAOKAO_YEAR`（每年 6/10 11:00 后自动推进） | `PHASE_CONFIG.final`、届别徽章、高考起止 |
| 版本号 | `time.js` 的 `APP_VERSION` | 页脚 `#versionLabel`、Service Worker 缓存名 |
| 节假日 | `time.js` 兜底表 + `data/holidays.json` | 界面三处（左栏卡 / 日历卡 / 速览弹窗） |
| 节气 | `lunar.js` 兜底表 + `data/solar-terms.json` | 月历格 |

**版本号单一来源**的具体机制：`gaokao.js` 启动时
`setText(document.getElementById('versionLabel'), APP_VERSION)`，
同时用 `APP_VERSION` 作为 `sw.js` 的查询串（`./sw.js?v=2.5.2`），
使 Service Worker 缓存名随版本自动变化。**改版本只需改 `time.js` 一行。**
（`index.html` 里的 `<span id="versionLabel">2.5.2</span>` 只是首屏占位，
运行时会被覆盖，但**发布时应保持一致**以免骨架期显示旧号。）

### 3. 兜底 + JSON 覆盖（数据层策略）

两组数据（节假日、节气）使用**同一套策略**：

```
内置兜底表（同步，永远可用）
      │
      ├── fetch 成功且格式合法 → 整体替换 → 重渲染
      └── fetch 失败 / 格式非法 → 静默保留兜底（console.warn）
```

**为什么必须这样**：这两个数据都是**每个日历格都要用**的，
不能承受异步失败。JSON 存在的意义是给「一年一变的官方公告 / 官方表」留一个更新入口。

完整流程与校验方法见 [data.md](data.md)。

### 4. 主题 token 系统（五主题 × 三档字号）

**做法**：所有配色挂 `html[data-theme]`，字号系数挂 `html[data-size]`，
组件 CSS 只消费 CSS 自定义属性，**不写具体颜色**。

```css
html[data-theme="camp"] { --bg: #FFF6E9; --accent: #E8892B; /* … */ }
html[data-size="std"]   { --n: 22; --u: 4.2; }
.hero-countdown .timer .t-main .num { font-size: calc(var(--n) * 1cqw); }
```

**关键约束**：

- 主题自带明暗身份（`THEME_DARK` 集合），`appearance` 只决定「去亮侧还是暗侧」。
  `appliedThemeId` 是唯一事实来源，菜单按钮显示**已应用**的主题。
- 旧键迁移：`dark` → 夜航（`night`），`light` → 砚台（`ink`）。
  这是为了老用户不会在升级后被切到反色的界面。
- 露营主题的实色卡片靠**每张卡自己的** `--card-solid-bg` / `--card-accent`
  驱动；其他主题这些变量回退成 `var(--bg-card)`，**彩块自动降级为普通卡片**。

### 5. 字号用容器查询，不用视口单位

Hero 大数字跟随**卡片自身宽度**缩放：

```css
.hero-countdown { container-type: inline-size; }
.hero-countdown .timer .t-main .num {
    font-size: var(--n-fallback, 19vw);          /* 老浏览器回退 */
}
@container (min-width: 1px) {
    .hero-countdown .timer .t-main .num { font-size: calc(var(--n, 22) * 1cqw); }
}
```

> **曾经的坑**：用 `vw` 会以视口为基准，而数字住在窄卡片里，必然溢出。
> 另一个坑是 `flex-wrap: nowrap` **拦不住文字折行** ——
> 必须在容器和文字上都写 `white-space: nowrap`，否则整行塌缩。
> 全屏层同样用 `min(vw, vh)` 双约束（只按 `vh` 会在窄屏溢出）。

### 6. 布局：页头与轨道全宽，两栏只承载内容

```
.main-content  (grid，仅在 ≥1024px 生效)
├── .header            全宽 · grid-area: head
├── #pgRail            全宽 · grid-area: rail   考试阶段轨道
├── #pgColLeft         左栏 · grid-area: left    总倒计时 + 下一个假期  ← sticky
├── #pgColRight        右栏 · grid-area: right   当前考试 / 选科 / 日历 / 日程
└── .footer            全宽 · grid-area: footer（与左栏同一行区间，z-index 更高）
```

```css
@media (min-width: 1024px) {
    .main-content {
        display: grid;
        grid-template-areas: "head head" "rail rail" "left right" "left footer";
        grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    }
}
```

**三条硬约束，都源自真实 bug**：

1. **`.main-content` 的直接子元素必须显式指定 `grid-area`**。
   Grid 的自动放置会把未指定区域的孩子塞进**最后的隐式行** ——
   页头标题因此跑到整页最下方（实测标题 `y=1547`、页脚 `y=1487`）。
2. **网格必须加在「两栏的直接父元素」上**。
   早期写在 `.container` 上，而两栏被 `.main-content` 包着，
   网格只作用于那唯一一个子元素，双栏静默退化成单列。
3. **左栏的 `grid-row` 必须跨到页脚行**（`"left right" / "left footer"`）。
   `position: sticky` 的可用行程 = 自身 grid 区域高度；
   左栏若只占第 3 行，滚到最后一段时行程用尽，主倒计时会被顶出视口。
   配合 `.footer { position: relative; z-index: 7 }` 让页脚「滑过」左栏。

### 7. 滚动锁：冻结位置，不改 overflow

打开弹窗/全屏时不使用 `overflow: hidden`：

> **为什么**：把 `html`/`body` 设成 `hidden` 会**改变 sticky 元素的滚动容器** ——
> 滚动容器从视口变成 `html`/`body` 本身，而它此时并不滚动，
> 于是吸附偏移量塌缩、根元素回到滚动位置 0，左栏被整体顶出视口。
> 实测：弹窗打开瞬间 `hero.top` 由 `16` 变成 `-377`。

也**不能**用主流的 `body { position: fixed }`：

> **为什么**：fixed 的 body 会成为 fixed 定位的**包含块**，
> 而 `.modal-overlay` / `.fs-overlay` 都是 `position: fixed`，
> 它们会改为相对 body 定位，覆盖层立刻错位。

**实际做法**：不改变任何布局，只把滚动位置按住 ——
监听 `scroll` / `wheel` / `touchmove` 并在被锁定时还原 `scrollY`，
`keydown` 拦截翻页键（表单控件内放行）。

### 8. `cacheDom()` 集中缓存 + 静默失败风险

`gaokao.js` 启动时把 28+ 个元素引用集中缓存进 `dom` 对象，之后靠引用做增量更新
（避免每秒重建 DOM）。

> **风险**：若某个 id 在 DOM 重构中消失或被移动，`dom.foo` 会是 `null`，
> 症状是**倒计时静默不更新**（不报错）。因此
> **DOM 结构变更后必须跑 id 完整性检查**（见 [testing.md](testing.md)）。

### 9. `.hidden` 与 CSS 权重

`.hidden` 的基础规则写在样式表前部，而 `.pg-card` 等卡片规则写在后部。
同权重下**后者胜**，导致给日程卡加 `.hidden` 后它仍然显示。修复方式是在末尾补一条
更高权重的兜底规则。

这条属于本样式表反复出现的坑，已总结成规范，见
[development.md](development.md#css-权重约定)。

### 10. 不做服务端校时

页面**刻意**不校验服务器时间，完全信任设备本地时钟。
理由：引入校时需要一个可用的时间源（自建接口或第三方），
会破坏「纯静态零依赖」，而收益仅覆盖「设备时间本身错误」这一少数场景。
该限制已在 [overview.md](overview.md) 与 README 中明确声明。

---

## 相关文档

- 逐模块实现细节 → [implementation.md](implementation.md)
- 功能模块行为 → [modules.md](modules.md)
- 数据格式与年度更新 → [data.md](data.md)
- 测试与验收方法 → [testing.md](testing.md)
- 发布与缓存 → [deployment.md](deployment.md)
