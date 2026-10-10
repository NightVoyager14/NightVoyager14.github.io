# 核心实现

本文按模块说明**怎么实现的**。设计理由见 [architecture.md](architecture.md)，
功能行为见 [modules.md](modules.md)。

---

## 一、`time.js` —— 时间基准与配置（零 DOM）

### 常量

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `APP_VERSION` | `'2.5.2'` | **版本号唯一来源**，页脚与 SW 缓存名都取这里 |
| `CN_OFFSET_MIN` | `480` | 北京时间相对 UTC 的偏移（分钟） |
| `MS_DAY` | `86400000` | 一天毫秒数 |
| `GAOKAO_YEAR` | 运行时求值 | 见下 |
| `COHORT_LABEL` | `GAOKAO_YEAR + '届'` | 届别徽章文案 |

### 时间基准函数

```js
bjDate(year, month, day, hour = 0, minute = 0, second = 0)
```

按北京时间构造 `Date`，`month` 用 1–12 自然月号。
实现是 `Date.UTC(...) - CN_OFFSET_MIN * 60000`。

配套纯函数：

| 函数 | 作用 | 返回示例 |
| --- | --- | --- |
| `fmtCnFull(date)` | 完整中文日期 | `2027年6月7日` |
| `fmtCnMonthDay(date)` | 月日 | `6月10日` |
| `cnDayKey(date)` | 北京时间的日键 | `2026-10-3`（**不补零**） |
| `splitDuration(ms)` | 拆分天/时/分/秒，负数钳到 0 | `{d,h,m,s}` |
| `pad2(n)` | 补零 | `'07'` |
| `targetState(now, start, end)` | 目标状态机 | `'waiting'` / `'ongoing'` / `'done'` |

`fmtCnFull` / `fmtCnMonthDay` 内部用**缓存好的** `Intl.DateTimeFormat` 实例
（`CN_FMT_FULL` / `CN_FMT_MD`，固定 `timeZone: 'Asia/Shanghai'`）。
构造函数在每次调用时重建的开销很大，这是性能微优化的一部分。

### 高考年份自动滚动

```js
const GAOKAO_YEAR = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const end = bjDate(y, 6, 10, 11, 0);
    return now > end ? y + 1 : y;
})();
```

**每年 6/10 11:00（最后一场考试结束）之后自动推进到下一年**，无需手工改年份。
`PHASE_CONFIG.final`、届别徽章、高考起止全部由它推导。

### 考试科目表

`exams` 是一个数组，**只配「日 + 时 + 分」**，年份由 `GAOKAO_YEAR` 补齐：

```js
{ date: 7,  start: [9, 0],  end: [11, 30], name: '语文',        tag: 'mandatory' }
```

9 场考试分四天（6/7–6/10）。`tag` 三态映射：

| `tag` | 中文 | CSS 类 |
| --- | --- | --- |
| `mandatory` | 全国统考 | `tag-mandatory` |
| `elective` | 等级选考 | `tag-elective` |
| `special` | 民族加试 | `tag-special` |

由它推导出：

```js
const gaokaoStart = bjDate(GAOKAO_YEAR, 6, 7, 0, 0);          // 起点 6/7 00:00
const gaokaoEnd   = examEndAt(exams[exams.length - 1], GAOKAO_YEAR);  // 终点 = 最后一场结束
```

### 阶段配置

`PHASE_CONFIG` 定义五阶段（`zero` / `first` / `second` / `third` / `final`），
每项含 `id` / `name` / `longName` / `short` / `defaultStart` / `defaultEnd` / `desc`。

`PHASE_ORDER = ['zero','first','second','third','final']` 是顺序的唯一来源。

> **注意**：一诊默认日期为 **2026-12-21 ~ 12-23**
> （原为 12-22 ~ 12-24，依实际安排更正）。冻结回归里有对应断言。

### 选科模型

```js
const SUBJECTS = {
    primary:   { label: '首选', options: ['历史', '物理'], max: 1 },
    secondary: { label: '再选', options: ['化学', '地理', '思想政治', '生物学'], max: 2 },
};
```

`isExamRelevant(ex, selectedSubjects)` 判定某场考试是否与当前选科相关 ——
它是全站「淡化/高亮」的唯一判据。

### 节假日数据结构与函数

```js
const HOLIDAY_FALLBACK = { schemaVersion: 2, days: [ /* … */ ] };
let holidayTable = HOLIDAY_FALLBACK;      // 当前生效表（可被 JSON 替换）
```

| 函数 | 作用 |
| --- | --- |
| `holidayKey(y, m, d)` | 日期键，**补零**格式 `2026-10-02` |
| `setHolidayData(data)` | 校验并整体替换；字段非法返回 `false` 并保留原表 |
| `getHoliday(dateKey)` | 查某天的记录，无则 `null` |
| `getMonthHolidays(y, m)` | 某月全部记录（按日期升序） |
| `holidayDateNumber(str)` | 把 `YYYY-MM-DD` 转成整数日序号（跨格式比较用） |
| `getHolidayRuns()` | 把同名连续放假日**合并成假期段** |
| `todayKey()` | 北京时间的今日键 |

`getHolidayRuns()` 返回 `[{ name, startKey, endKey, days, confirmed }]`，
相邻判定用**日序号差 == 1**，不用字符串比较（见 [architecture.md](architecture.md#1-时间一律以北京时间utc8为基准)）。

---

## 二、`lunar.js` —— 农历与二十四节气（零 DOM）

### 农历：算，不是查

三步：

**① 朔表** —— `NEW_MOON_DAYS` 是 95 个整数，表示每个「朔」（新月）的日期，
单位是**距 2000-01-01 的北京日历天**，覆盖约 2024-05 ~ 2029-12。
由 Meeus 朔望月近似式（含 17 个主要摄动项）算出，精度约 ±2 分钟。

**② 月序编号** —— `monthContainsSolstice(i)` 判断某朔望月是否包含冬至（12 月 21 日），
`lunarMonthNumber()` 据此编号：**包含冬至的那个朔望月 = 十一月**，其后依次递增、逢 12 归 1。

> **跨年陷阱**：冬至要按月**自己所在的年份**取。
> 跨年的那个月里冬至落在「月尾年份」上，只按起始年取会**漏判**，
> 导致 2026-12-09 起的那个月拿不到十一月编号。

**③ 取日期** —— `getLunar(date)` 返回：

```js
{ day, dayName, monthNum, monthName, label }
// label 供日历格使用：农历月初显示月名（「腊月」），其余显示日名（「廿八」）
```

超出朔表范围时返回 `null`，调用方据此不显示农历（不报错）。

### 节气：两级数据

```js
const SOLAR_TERMS_FALLBACK = { 2026: { 204: ['立春','04:02'], … }, 2027: {…}, 2028: {…} };
const SOLAR_TERM_APPROX = { 2028: [106,120,…], 2029: [105,120,…] };
let solarTermTable = SOLAR_TERMS_FALLBACK;
```

键是 `月*100 + 日`（如 `204` = 2 月 4 日）。

| 函数 | 作用 |
| --- | --- |
| `setSolarTermsData(data)` | 校验 `terms` 数组并整体替换；非法返回 `false` |
| `solarTermsDataUrl()` | 返回 `'./data/solar-terms.json'`（**不发请求**，纯函数模块不发网络） |
| `getSolarTerm(date)` | 返回 `{ name, time }`；`time` 为空串表示该年无权威时刻；非节气日返回 `null` |
| `hasSolarTerm(date)` | 布尔快捷方式 |

**分级原则**：官方值精确到分；近似值**只给日期不给时刻** ——
宁可少给信息，也不给未经核对的分钟数。

### 校验结果（已实测）

| 参照 | 来源 | 结果 |
| --- | --- | --- |
| 2026 年 24 个节气对应的农历日期 | 官方节气表 | **24/24 一致** |
| 2027 全年 + 2028 年 1 月节气名称与时刻 | 官方节气表 | **26/26 一致** |
| 同 26 条对应的农历日期 | 同上 | **26/26 一致** |

见 [testing.md](testing.md) 的 `lunarjs_probe.py`。

---

## 三、`gaokao.js` —— 展示层

### 启动顺序

```
1. 选科：loadSubjectSelection() → initSubjectSelector()
2. render()                  生成 9 张考试卡（含逐场倒计时 id）
3. initCardBands()           给卡片注入彩色页眉 .card-band
4. cacheDom()                集中缓存 37 个 id
5. loadPhaseSettings()       读 localStorage 覆盖
6. examDates = computeExamDates()   推导 9 场时刻
7. hideSkeleton()            三重保障移除骨架屏
8. updateAll(true)           首屏一次性写满
9. tickLoop()                每秒增量更新
10. initPhaseNav() / initCalendar() / assertPhaseOrder() / switchPhase('final')
11. applyTheme()             首屏主题落地（**必须在文件末尾**）
12. renderHoliday()          首屏节假日落地
13. loadHolidayData() / loadSolarTermsData()   异步覆盖
```

> **为什么 `applyTheme()` 在文件末尾**：它内部会视情况调用 `updateFullscreen()` /
> `updatePipContent()`，而 `fsOverlay`、`pipWindow` 的声明在主题段落**之后**。
> 提前调用会因暂时性死区（TDZ）抛错，被 `typeof` 守卫吞掉，
> 表现为「全屏不刷新」。放在末尾可确保所有 `const`/`let` 已初始化。

### 考试时刻推导（`computeExamDates`）

把每个阶段的自定义起止日期（`phaseOverrides`）与考试表结合，
按**北京时间日历天**整体平移：

```js
const dayOffset = cnDayNumber(gkStart) - cnDayNumber(bjDate(GAOKAO_YEAR, 6, 7));
exams.map(ex => ({
    start: addDays(examStartAt(ex, GAOKAO_YEAR), dayOffset),
    end:   addDays(examEndAt(ex, GAOKAO_YEAR), dayOffset),
}));
```

于是用户在设置里改高考起始日后，**9 场科目时间跟着整体平移**，
总倒计时、科目卡片、全屏、小窗四处永远一致。

`examDates` 的每一项**只有 `{start, end}`，没有 `name`**。
需要科目名时要在 `exams` 里按下标取 —— 曾经在这里写出 `undefined`。

### DOM 契约

`cacheDom()` 缓存的 37 个 id 是**展示层与结构层的契约**。
其中关键分组：

| 分组 | id |
| --- | --- |
| Hero 倒计时 | `hDays` `hHours` `hMins` `hSecs` `heroLabel` `heroSection` `heroA11y` `heroDate` `heroStats` `heroPhaseName` `heroPhaseBadge` `heroPhaseLine` |
| 当前考试 | `currentExam` `ceLabel` `ceBadge` `ceName` `ceTime` `ceCountdown` `ceProgressFill` `ceProgressStart` `ceProgressEnd` `ceBandNote` |
| 全屏 | `fsCurName` `fsCurTime` `fsDd` `fsDh` `fsDm` `fsDs` `fsProgressFill` `fsNextName` `fsNextTime` `fsNextCountdown` `fsDone` `fsRemain` `fsStatusBar` `fsStatusText` `fsNext` `fsCountLabel` |
| 阶段 | `phaseNav` `pgRail` `railMode` `railBack` `statusMsg` |
| 日历 | `hmTabs` `hmGrid` `hmList` |
| 其他 | `yearBadge` `versionLabel` |

`render()` 生成的考试卡 id 有固定规则：

```
卡片     card-{date}-{name 去掉 / 和空格}
天数     cd-d-{同上}
时/分/秒 cd-h- / cd-m- / cd-s-{同上}
```

**裸 DOM 查询（`getElementById`）仅出现在一次性初始化与弹窗逻辑**，
每秒循环一律走 `dom.xxx` 引用，避免每秒重复查询。

### 每秒循环（`tickLoop`）

```
每秒：
  updateAll()              总倒计时 + 9 场 + 当前考试 + 全屏 + 小窗
  syncPhaseNavStatus()     阶段状态翻转才触 DOM（用状态串比对）
```

防抖策略：多处用**内容签名比对**（如 `lastHeroStatsKey`、`lastPhaseStatusKey`），
内容不变时直接跳过 DOM 写入。

### 状态管理

| 状态 | 位置 | 持久化 |
| --- | --- | --- |
| 选科 | `selectedSubjects` 数组 | `localStorage` |
| 阶段覆盖 | `phaseOverrides` 对象 | `localStorage` |
| 主题 / 字号 / 明暗 | `appliedThemeId` / `sizeStep` / `appearance` | `localStorage` |
| 当前查看的阶段 | `activePhaseId` | 不持久化 |
| 日历游标 | `calState`（含 `sel*` 与游标两组字段） | 不持久化 |

**`calState` 的字段拆分是一个真实 bug 的产物**：
它同时承载「已提交的选中日期」（`selYear` / `selMonth` / `selDay`）
与「浏览中的游标」（`year` / `month` / `day`）。
早期只有一套字段，且 `goMonth()` 会把 `day` 重置成 1，
于是「只是翻到另一个月」就会把那个月的 1 号画成选中态。
**新增类似的浏览型 UI 时沿用这个拆分。**

### 主题解析

```
appearance: 'auto' | 'light' | 'dark'
     │
     ├─ auto  → 跟随 prefers-color-scheme
     └─ 指定值 → 按该侧的调色板
     ▼
appliedThemeId  ← 唯一事实来源（菜单按钮显示的是它）
```

主题自带明暗身份由 `THEME_DARK` 集合给出；`autoPairThemeId` 记住亮侧调色板，
使用户在 auto 模式下切系统明暗时仍停留在同一支配色。

### 滚动锁（`lockScroll`）

不改变布局，只冻结滚动位置：

```
lock(true)：记录 scrollY，监听 scroll/wheel/touchmove 还原位置，keydown 拦翻页键
lock(false)：解绑监听，精确还原 scrollY
```

详见 [architecture.md](architecture.md#7-滚动锁冻结位置不改-overflow)。

---

## 四、`sw.js` —— Service Worker

| 常量 | 值 |
| --- | --- |
| `CACHE_PREFIX` | `'gaokao-cache-'` |
| `ASSETS` | `./` `index.html` `style.css` `time.js` `lunar.js` `gaokao.js` `manifest.json` `data/holidays.json` `data/solar-terms.json` |

**缓存名带版本号**：`currentVersion()` 读取 `sw.js` 自身 URL 上的查询串
（由 `index.html` 注册时带上 `?v=APP_VERSION`），
所以 `CACHE = 'gaokao-cache-2.5.2'`。

**缓存策略**：

| 资源 | 策略 |
| --- | --- |
| HTML / JS / JSON | **网络优先**（`networkFirst`），保证改代码能生效 |
| 其他静态资源 | **缓存优先**（`cacheFirst`） |

`activate` 时删除同前缀的旧缓存，只保留当前版本。

> **曾经的坑**：缓存名固定为 `gaokao-cache-v1` 且对 `.js` 用缓存优先，
> 导致部署新版本后用户可能长期执行旧脚本。
> 现在发布后如需确认，可在 DevTools → Application → Cache Storage 检查
> **应只存在一个** `gaokao-cache-v<APP_VERSION>`。

---

## 五、`index.html` —— 结构

108 个 id。顶层骨架：

```
.container
├── #skeleton                     骨架屏（绝对定位，加载后移除）
└── #mainContent  (.main-content)
    ├── .header                   标题 + 届别
    ├── #pgRail  (.rail)          考试阶段轨道
    │   ├── .rail-head            「考试阶段」+ #railMode + #railBack
    │   └── #phaseNav             5 个阶段节点（JS 填充）
    ├── #pgColLeft   (.pg-col-left)
    │   ├── #heroSection          总倒计时（含 #heroPhaseLine 阶段名与徽章）
    │   └── #holidayCard          下一个假期
    ├── #pgColRight  (.pg-col-right)
    │   ├── #gaokaoContent        高考专属（阶段非 final 时整体隐藏）
    │   │   ├── #currentExam      当前考试进程
    │   │   └── #subjectSelector  选科标记
    │   ├── #calCard              日历 · 节假日（常驻，不随阶段隐藏）
    │   └── #scheduleCard         考试日程（随阶段隐藏）
    └── .footer
#actionBar                        底部固定操作栏
#themeMenu  #holidayModal  #fsOverlay  #settingsModal  #calPopup
```

**两个覆盖层都是 `position: fixed`**，也是 `lockScroll` 不能用
`body { position: fixed }` 的原因。

### 无障碍要点

- 读屏专用节点用 `.sr-only`；`#heroA11y` 每分钟更新一次（避免每秒播报）
- 弹窗与全屏层有 `role="dialog"` + `aria-modal`，实现**焦点陷阱**与关闭后焦点归还
- 选科项是真 `<button>` + `aria-pressed`
- 阶段节点同步 `aria-pressed`，当前节点带 `aria-current`
- 日历格带完整 `aria-label`（公历 + 农历 + 节气 + 假期）

---

## 相关文档

- 设计理由与踩坑背景 → [architecture.md](architecture.md)
- 功能行为 → [modules.md](modules.md)
- 数据文件格式 → [data.md](data.md)
