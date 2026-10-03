# 四川高考倒计时 · 3+1+2

一个纯静态、零依赖、零构建的新高考倒计时与阶段日程页面。

- 线上地址：<https://www.nightvoyager.online/gaokao/>
- 归属站点：NightVoyager 的个人 GitHub Pages（应用本身全部位于本目录）

## 功能

- **分层倒计时**：高考总倒计时 → 当前/下一场考试进程条 → 各科逐场倒计时
- **五阶段预报**：零诊 / 一诊 / 二诊 / 三诊 / 高考，可切换查看，状态徽章随时间自动翻转
- **选科标记**：首选（历史/物理，互斥单选）+ 再选（化学/地理/思想政治/生物学，限 2 科），
  自动高亮或淡化相关科目卡片
- **全屏模式**：考试进度条、下一场提醒、已完成/剩余场次统计
- **浮动小窗**：基于 Document Picture-in-Picture API（仅 Chromium 系支持）
- **自定义日程**：可修改各阶段起止日期，保存至 localStorage
- **节假日日历**：右栏常驻月历（放假 / 调休 / 预估三态着色）+ 左栏「下一个假期」卡；
  「假期」按钮打开未来几个假期的时间线速览
- **五套主题 × 三档字号**：砚台 / 夜航 / 白板 / 青瓷 / 露营，明暗自适应
- 骨架屏、PWA 安装支持

## 文件构成

| 文件 | 作用 |
|---|---|
| `index.html` | 页面结构与无障碍语义（样式与逻辑均已外置） |
| `style.css` | 全部样式、主题 token 与响应式布局 |
| `time.js` | 时间基准、考试与阶段配置、节假日数据、纯函数 —— **不碰 DOM** |
| `lunar.js` | 农历与二十四节气（朔表 + 节气兜底表），纯函数 —— **不碰 DOM** |
| `gaokao.js` | DOM 渲染、事件绑定、每秒更新循环 |
| `data/holidays.json` | 节假日数据（**权威来源**：2026 依国办发明电〔2025〕7 号，2027 为预估）。会整体替换 `time.js` 的内置兜底表 |
| `data/solar-terms.json` | 二十四节气（2026/2027 全年 + 2028 年 1 月官方值）。会整体替换 `lunar.js` 的内置兜底表 |
| `manifest.json` | PWA 清单（图标为内联 data-URI SVG） |
| `sw.js` | Service Worker（缓存版本化 + 网络优先） |
| `preview.html` | **设计基准 demo**，带 `noindex` 不参与收录；改动视觉时用它做对照 |
| `MIGRATION-2.3.0.md` | 设计迁移计划书 + 验收标准 + 历轮补丁记录；**改视觉前先读** |
| `CHANGELOG.md` | 版本变更记录 |

引入顺序有依赖：`time.js` → `lunar.js` → `gaokao.js`，三者不可颠倒。

## 布局结构

页头与阶段轨道是**全宽**元素，两栏只承载内容：

```
.main-content  (grid)
├── .header            全宽：标题 + 届别
├── .rail              全宽：考试阶段轨道（菱形节点 + 连接线 + 回到当前阶段）
├── #pgColLeft         左栏：总倒计时（含阶段名/徽章）+ 下一个假期   ← 桌面端 sticky
├── #pgColRight        右栏：当前考试 / 选科 / 日历 / 日程
└── .footer            全宽（与左栏同一行区间，靠 z-index 压在其上）
```

> **倒计时只有一处**。阶段专有信息（全名、状态徽章）写在 Hero 内部，
> 不要为某个阶段另起一张带倒计时的卡片 —— 那会让页面上并排出现两个相同的倒计时
> （v2.3.2 修掉的正是这个）。

## 数据放在哪：兜底 + JSON 覆盖

这份页面的数据分散在几个文件里，不是随手放的，判据是**「多久会过期」**：

| 数据 | 位置 | 过期方式 |
| --- | --- | --- |
| 考试与阶段配置 | `time.js` 的 `exams` / `PHASE_CONFIG` | 一年一次（年份自动滚动） |
| 节假日放假与调休 | `time.js` 的 `HOLIDAY_FALLBACK` **＋** `data/holidays.json` | 一年一次，**由国务院公告决定** |
| 二十四节气 | `lunar.js` 的 `SOLAR_TERMS_FALLBACK` **＋** `data/solar-terms.json` | 一年一次（官方节气表），另有近似式兜底未来年份 |
| 农历换算 | `lunar.js` 的朔表 `NEW_MOON_DAYS` | **天文规律，不会过期** |

**两组「兜底 + JSON 覆盖」是同一套策略**：内置表保证任何时刻都能渲染，
`fetch` 成功则替换，**失败或数据非法都静默保留兜底**。网络只负责「可能更新一点」。

**为什么两组都要有内置兜底**：节假日与节气都是**每个日历格都要用**的数据，
不能承受异步失败。JSON 存在的意义是给「一年一变的官方公告 / 官方表」留一个更新入口。

**改数据的正确姿势**：

| 要改什么 | 改哪几处 | 改完跑 |
| --- | --- | --- |
| 放假 / 调休 | `time.js` 的 `HOLIDAY_FALLBACK` **和** `data/holidays.json` | `holiday_check.py` |
| 节气（权威年份） | `lunar.js` 的 `SOLAR_TERMS_FALLBACK` **和** `data/solar-terms.json` | `solar_check.py` |
| 未来年份的节气近似值 | 只改 `lunar.js` 的 `SOLAR_TERM_APPROX` | 无需比对（单副本） |

两个检查脚本都会把两份数据逐条 diff 出来。**节假日已经因为两边不同步返工过三次**，
所以这一步不是可选的。

> `SOLAR_TERM_APPROX` 是**近似表**，只给日期不给时刻 ——
> 官方未公布的年份不显示未经核对的分钟数。同一年不要同时出现在
> `SOLAR_TERMS_FALLBACK` 和 `SOLAR_TERM_APPROX` 里（前者优先，但重复就是隐患）。

> **曾经的坑**：`.main-content` 用了 `grid-template-areas`，而 `.header` 没有分到区域。
> CSS Grid 的自动放置会把它塞进**最后的隐式行**，于是页头标题跑到了整页最下方
> （实测标题 `y=1547`、页脚 `y=1487`）。
> **新增任何 `.main-content` 的直接子元素，都必须显式指定 `grid-area`，
> 否则它会被自动放到最后一行的下面。**
>
> 另一个坑：网格必须加在**两栏的直接父元素**上。早先写在 `.container` 上，
> 而两栏被 `.main-content` 包着，网格只作用于那唯一一个子元素，双栏会静默退化成单列。

## 关键实现约定

修改代码前请先了解以下几条，它们是这个项目最容易踩坑的地方。

### 1. 时间一律以北京时间（UTC+8）为基准

所有日期用 `time.js` 的 `bjDate(year, month, day, h, m)` 构造，**不要**直接写
`new Date(...)` —— 后者按浏览器本地时区解释，会让非 UTC+8 的用户看到偏移 8 小时的倒计时。
日期文案用 `fmtCnFull` / `fmtCnMonthDay`（内部已固定 `Asia/Shanghai`）。

```js
bjDate(2027, 6, 7, 9, 0).toISOString();   // '2027-06-07T01:00:00.000Z' ← 北京 09:00
```

> **注意「日序号」有两套口径**：
> `cnDayNumber()`（`time.js`）返回**距 1970-01-01** 的天数；
> `lunarEpochDay()`（`lunar.js`）返回**距 2000-01-01** 的天数。
> 两者相差 `LUNAR_EPOCH_DAY = 10957`。混用会让农历查表全部落空且**不报错**，
> 只是静默显示不出农历 —— 踩过一次。

### 2. 高考日期只有一处来源

`time.js` 的 `exams` 数组只配「日 + 时 + 分」，年份由 `GAOKAO_YEAR` 补齐；
`PHASE_CONFIG.final` 的默认日期由同一年推导。每年 **6/10 11:00** 之后
`GAOKAO_YEAR` 自动推进到下一年，**不需要手工改年份**。

> 曾经的坑：`PHASE_CONFIG.final` 硬编码 2027，而总倒计时的年份是动态的，
> 导致 2027-06-10 之后出现「页头 2028 届 / 总倒计时说距 2028 年高考还有 /
> 阶段导航却说高考已结束」的自相矛盾。改动此处请务必跑回归测试。

### 3. 用户在设置里改高考日期时，9 场科目时间跟随起始日整体平移

由 `computeExamDates()` 按**北京时间日历天**平移实现，保证总倒计时、科目卡片、
全屏、小窗四处永远一致。因此改完设置必须调用 `refreshPhaseUI()` 重算 `examDates`。

### 4. 版本号只有一处来源

`time.js` 的 `APP_VERSION`。页脚由它填充；`gaokao.js` 注册 Service Worker 时
把它作为查询串传给 `sw.js`，`sw.js` 用它作为缓存名的一部分。

**改了代码记得提升 `APP_VERSION`**，否则浏览器不会更新 Service Worker，
用户可能继续执行旧缓存中的脚本。

### 5. localStorage 中的用户数据必须容错

键名：`gaokao_phase_settings`、`gaokao_subjects`、`gaokao_theme`。
损坏的 JSON 或字段不合法时必须回退默认值并 `console.warn`，不能白屏
（见 `isSaneOverride`）。

> 曾经的坑：覆盖数据的字段名是 `startYear/startMonth/startDay`，而默认值是
> `{year, month, day}`，两者不同名。`getPhaseDates()` 读错字段会**静默回退**默认值，
> 表现为「设置改了没用」。

### 6. 骨架屏的移除不能只依赖 `transitionend`

骨架屏是 `position:absolute; inset:0; z-index:100` 的全屏遮罩，
若移除失败会直接盖住整页、表现为白屏。

`transitionend` **不保证触发**：标签页在后台、元素未参与绘制、首帧内同时写入
`transition` 与 `opacity` 被浏览器视为终态、或过渡被打断时都不会派发。
因此 `hideSkeleton()` 采用三重保障：

1. `transitionend`（正常路径）
2. 700ms 兜底定时器（`transitionend` 未触发时）
3. 淡出结束后强制 `display: none`，确保即便 `opacity` 从未变化也退出视觉层

用 `requestAnimationFrame` 套两层，先让首帧完成样式计算，再触发淡出。

### 依赖设备本地时间

这是纯静态页面，没有服务端校时。倒计时依据访客设备的系统时钟计算，
用户手动修改系统时间即可改变显示结果 —— 这是静态托管的固有限制，非缺陷。

## 开发与测试

无依赖，无需 `npm install`。

### 1. 冻结回归（随仓库提交）

```bash
# 语法检查
node --check time.js
node --check lunar.js
node --check gaokao.js
node --check sw.js

# 冻结回归（24 项：时间基准、跨年滚动、阶段顺序、覆盖校验、选科相关性）
node tests/gaokao-time.test.mjs
```

测试位于仓库根目录的 `tests/`，**改动 `time.js` 或阶段配置后必须跑**。
也可以 `node --test tests/`；若该命令在受限环境下报 `spawn EPERM`
（子进程管道被沙箱拦截），改用上面直接运行测试文件的方式，效果相同。

### 2. 数据一致性检查（脚本在本地，不入库）

节假日与节气各有一份「内置兜底表 + `data/*.json`」的双副本，
**只改一边会造成静默失效**（节假日已经因此返工过三次）。改完跑对应脚本逐条 diff：

```bash
python .analysis/holiday_check.py   # time.js 的 HOLIDAY_FALLBACK  vs data/holidays.json
python .analysis/solar_check.py     # lunar.js 的 SOLAR_TERMS_FALLBACK vs data/solar-terms.json
```

两个脚本都只读文件、打印比对结果，输出末尾的 `两份数据完全一致 = True` 是唯一的通过标志。

### 3. 页面行为验证（脚本在本地，不入库）

`.analysis/` 下有一组 Playwright 探针（该目录已在 `.gitignore` 中）。
它们需要先起本地服务器，并且**必须在能启动 Chromium 的权限下运行**：

| 脚本 | 检查内容 |
| --- | --- |
| `ids_probe.py` | 68 个静态 id 是否齐全；已移除的 id 是否确实不存在 |
| `prod_probe.py` | 5 主题 × 4 视口的溢出矩阵、主题菜单、旧键迁移、既有功能 |
| `scroll_probe.py` | 左栏吸附行程、计时跳动、选科淡化 |
| `parity_probe.py` | 与 `preview.html` 逐项比对设计量（列宽比、色值、圆角、间距） |
| `lunarjs_probe.py` | 农历换算与 24 条参照逐条比对 |
| `verify_probe.py` | 多视口下的吸附与「回到当前阶段」 |
| `round3_probe.py` | 月份连续性、rail-back、Hero 文案 |
| `b345_probe.py` | Hero/假期卡/日历的渲染与溢出 |
| `cal_probe.py` | 日期选择器「浏览月份不应产生虚假选中」 |

探针把结果写入 `.analysis/*.json` 而不是 stdout —— 沙箱下管道会被拦截，
写文件是唯一可靠的方式。**读断言前先确认报告文件的 mtime 晚于脚本**，
否则你读到的可能是上一轮的旧结果（踩过这个坑，并因此误报过两次「通过」）。

### 4. 本地预览

```bash
cd ..                      # 到仓库根目录
python -m http.server 8080
# 打开 http://localhost:8080/gaokao/
```

**不要用 `file://` 双击打开**来验证完整功能：该协议属非安全上下文，
Service Worker、离线缓存、`manifest.json` 安装提示在此环境下**必然不可用**。
代码已针对 `file://` 做了协议守卫（跳过注册并给出 `console.info`），
页面核心倒计时功能仍可正常显示，但请以 HTTP 环境为准做验收。

> `python -m http.server` 会把 `.js` 当 `text/plain` 发送，因此本地预览时
> 控制台会出现一条 `unsupported MIME type ('text/plain')` —— 那只是
> Service Worker 注册被拒，与页面代码无关。GitHub Pages 会正确发送
> `application/javascript`，线上不会有这条报错。

### 设计对照

`preview.html` 是设计基准 demo，自带主题 / 视口 / 字号切换工具条。
改动视觉时请与它对照，不要只断言「没有溢出」就当通过 ——
**属性通过不代表设计迁移到位**，这一点在第 2.2.0 版踩过。

```bash
# 打开设计基准，逐项比对配色与布局
http://localhost:8080/gaokao/preview.html
```

## 部署

推送到 `main` 分支即可，GitHub Pages 直接发布（仓库根的 `.nojekyll` 已关闭 Jekyll 处理）。
发布后如需验证缓存更新：DevTools → Application → Cache Storage，
应只存在一个 `gaokao-cache-v<APP_VERSION>`。

## 浏览器支持

| 功能 | 支持情况 |
|---|---|
| 倒计时、阶段、选科、主题、日历 | 所有现代浏览器 |
| Hero 大数字的容器查询字号 `cqw` | 支持容器查询的浏览器；不支持时回退到 `--n-fallback`（vw 系数） |
| 全屏模式 | 依赖 Fullscreen API；iOS Safari 对非视频元素支持残缺 |
| 浮动小窗 | 仅 Chromium 116+ 的 Document Picture-in-Picture |
| Service Worker / 离线 / 安装 | 需 http/https |
| 键盘操作、`prefers-reduced-motion` | 已适配 |

## 历史

见 [CHANGELOG.md](./CHANGELOG.md)。当前版本 **v2.5.2**。

初版使用 **AI Generated Content** 完成，项目作者自述「没怎么写过前端，就直接用 AI 了说是」。
