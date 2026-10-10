# 开发规范

面向要改这个项目的人（包括 AI 协作者）。**本文的约定不是风格偏好，多数是踩坑后的结论。**

---

## 环境要求

| 项 | 要求 |
| --- | --- |
| 运行时 | 任意现代浏览器。**项目本身零依赖、零构建** |
| 本地预览 | Python 3（`python -m http.server`）或任意静态服务器 |
| 冻结回归 | Node.js（仅需能跑 `.mjs`） |
| 浏览器探针（可选） | Python + Playwright + Chromium |
| 包管理 | **不需要** —— 没有 `package.json`、没有 `node_modules` |

---

## 项目约定（改代码前必读）

### 1. 时间一律用 `bjDate()`

```js
// ✅ 正确
const t = bjDate(2027, 6, 7, 9, 0);

// ❌ 错误 —— 按浏览器本地时区解释
const t = new Date(2027, 5, 7, 9, 0);
```

日期文案用 `fmtCnFull` / `fmtCnMonthDay`（内部固定 `Asia/Shanghai`）。

### 2. 两套「日序号」口径不可混用

| 函数 | 基准 | 2026-02-04 的值 |
| --- | --- | --- |
| `cnDayNumber()` | 1970-01-01 | `20488` |
| `lunarEpochDay()` | 2000-01-01 | `9531` |

相差 `LUNAR_EPOCH_DAY = 10957`。**混用会让农历查表全部落空且不报错。**

### 3. `cnDayKey()` 不补零，数据文件补零

`cnDayKey()` 返回 `2026-10-2`，`data/*.json` 用 `2026-10-02`。
**不要直接字符串比较**，用 `holidayDateNumber()` 换算成整数日序号。

### 4. 单一数据源

| 数据 | 只改这里 |
| --- | --- |
| 版本号 | `time.js` 的 `APP_VERSION` |
| 高考年份 | `time.js` 的 `GAOKAO_YEAR`（自动滚动，不用改） |
| 考试科目与时间 | `time.js` 的 `exams`（只配日/时/分） |
| 阶段定义 | `time.js` 的 `PHASE_CONFIG` |
| 节假日 | 两处：`time.js` 兜底表 **和** `data/holidays.json` |
| 节气 | 两处：`lunar.js` 兜底表 **和** `data/solar-terms.json` |

### 5. 倒计时只有一处

阶段专有信息写在 Hero 内部（`#heroPhaseLine`）。
**不要为某个阶段另建带倒计时的卡片** —— 那会让页面上并排出现两个相同的倒计时。

### 6. `calState` 的两组字段不要合并

`selYear/selMonth/selDay` 是「已提交的选中日期」，
`year/month/day` 是「浏览中的游标」。
**新增浏览型 UI（月历、周选择、分页）时沿用这个拆分** ——
合并两者会让「只是看看」污染真实状态。

### 7. `.main-content` 的直接子元素必须显式给 `grid-area`

Grid 的自动放置会把未指定区域的孩子塞进**最后的隐式行**。
这条 bug 让页头标题跑到整页最下方过。

### 8. 新增数据需要「兜底 + JSON」两层

任何**每个日历格都要用**的数据都不能只靠 `fetch`。
必须提供同步兜底，并在 `gaokao.js` 启动时异步覆盖。

### 9. 新增资源必须加进 `sw.js` 的 `ASSETS`

否则离线时拿不到。

---

## CSS 权重约定 ⚠️

**这是本项目最容易反复踩的坑，已发生 6 次以上。**

这份样式表是**增量追加**的（新版本追加到文件末尾），
所以「写在后面」通常能覆盖前面 —— 但**只在权重相同时成立**。

### 血的教训清单

| 想覆盖的规则 | 被谁压住 | 后果 |
| --- | --- | --- |
| `.hidden` | `.pg-card`（同权重靠后） | 加了隐藏类仍显示 |
| `html[data-theme="night"] .hero-countdown .stat-row .pill` | `.hero-countdown .stat-row .pill`（同权重靠后） | 主题覆盖失效 |
| `.hm-day.today` | `#calCard.card--notch`（权重更高） | 今天描边比图例细 |
| `.tag-mandatory` | `.exam-card .meta .tag`（权重更高） | 内边距沿用旧值 |
| `.current-exam .ce-header .ce-status-badge` | 单类选择器 | 徽章圆角没改掉 |
| `.exam-card .sel-badge` | `.exam-card.subject-selected .sel-badge` | 徽章样式不生效 |

### 规则

1. **改覆盖前，先用 computed style 确认真实生效值。** 不要靠肉眼或「我写在后面」。
2. **目标权重写进注释。** 例如：
   ```css
   /* 基础规则是 .exam-card .meta .tag（(0,3,0)），
      必须用同级后代选择器才压得住。 */
   .exam-card .meta .tag { padding: 2px 6px; }
   ```
3. **尽量不用 `!important`。** 用等权重 + 更靠后，或用同级后代选择器把权重提上去。
   本项目目前**没有**用 `!important` 做常规覆盖（只有 `.hidden` 兜底用了）。
4. **不要依赖「文件末尾一定在后面」。** 新段落会追加到你后面。

### 权重速查

| 形式 | 权重 |
| --- | --- |
| `.a` | (0,1,0) |
| `.a.b` | (0,2,0) |
| `.a .b` | (0,2,0) |
| `#id` | (1,0,0) |
| `#id.a` | (1,1,0) |
| `html[data-theme="x"] .a .b` | (0,3,2) |

---

## 设计基准：`preview.html`

`preview.html` 是**设计基准 demo**，自带主题 / 视口 / 字号切换工具条。
它带 `noindex, nofollow`，不参与搜索引擎收录，也不参与运行时。

### 规矩

**改任何视觉相关代码后，必须与它对照。**

> **为什么强调**：v2.2.0 版本迁移了配色 token 与网格，却**没有迁移设计本身**
> （Hero 大数字、卡片彩色页眉、各卡色调层次都没做），
> 而当时的验收只断言了「属性正确、没有溢出」——
> 结果用户一眼看出「这根本没有把预览中配色与布局迁移过来」。
>
> **属性通过不代表设计迁移到位。**

对照方式见 [testing.md](testing.md#视觉验收流程)。

### 设计语言要点

| 项 | 约定 |
| --- | --- |
| 圆角 | 三档：`--r-sharp` 2px（标签/图章/进度段）、`--r-btn` 5px（按钮/chip）、`--r-card` 12px（卡片）。**不做「一圆到底」** |
| 描边 | `--bd` 1.5px **实色**描边替代柔和阴影 |
| 状态点 | 一律 `--r-sharp` **方点**，不用圆点 |
| 全圆角 | 全页**不允许**出现 `border-radius: 50%` / `999px`（状态圆点已改为方点） |
| 形状分化 | 缺角 + 折边（`.card--notch`）；放假日的 8px 圆角与周围 3px 方格形成反差 |
| 材质分化 | 露营主题的轨道铺地图网格纹理；日程卡铺 45° 斜纹 |
| 字号 | 用容器查询 `cqw`，不用 `vw` |

### `clip-path` 的注意点

`.card--notch` 用 `clip-path` 做缺角。**`clip-path` 在圆角与阴影之后应用，
外投影会被裁掉**，所以只用在**不依赖外投影**的卡片上。

---

## 开发流程

### 改代码

```bash
# 1. 改之前先跑一遍，确认基线是绿的
node tests/gaokao-time.test.mjs

# 2. 改代码

# 3. 语法检查
node --check gaokao/time.js
node --check gaokao/lunar.js
node --check gaokao/gaokao.js
node --check gaokao/sw.js

# 4. 冻结回归（改了 time.js/配置必须跑）
node tests/gaokao-time.test.mjs
```

### 改视觉

1. 先读 [architecture.md](architecture.md) 的设计系统一节
2. 改 `style.css`（**看上面的权重约定**）
3. 起本地服务器，与 `preview.html` 并排对照
4. 跑 `parity_probe.py` + `final_probe.py`，**人眼看截图**

### 改数据

按 [data.md](data.md#四年度更新流程) 的流程，**两处都改**并跑校验脚本。

### 提交

提交信息格式（与现有历史一致）：

```
type(gaokao): 简短描述

正文说明改了什么、为什么、验证结果
```

`type` 取值：`feat` / `fix` / `docs` / `perf` / `refactor` / `chore`
破坏性变更加 `!`，如 `feat(gaokao)!:`。

### 发布

见 [deployment.md](deployment.md)。**发布前跑完检查清单。**

---

## 禁止事项

| 禁止 | 原因 |
| --- | --- |
| 用 `new Date(y, m, d)` 构造考试时间 | 按本地时区解释，非 UTC+8 用户偏移 8 小时 |
| 混用 `cnDayNumber()` 与 `lunarEpochDay()` | 相差 10957 天，会静默查表落空 |
| 直接字符串比较 `cnDayKey()` 与数据文件日期 | 一个不补零一个补零，永远不相等 |
| 在 `time.js` / `lunar.js` 里操作 DOM | 这两个文件必须可脱离浏览器测试 |
| 为某个阶段另建带倒计时的卡片 | 会造成重复倒计时 |
| 用 `overflow: hidden` 锁滚动 | 会改变 sticky 的滚动容器，吸附元素消失 |
| 用 `body { position: fixed }` 锁滚动 | 会成为 fixed 包含块，覆盖层错位 |
| 把节气塞进 `data/holidays.json` | 会让节假日整包校验失败 |
| 调休日漏写进节假日数据 | 界面「调休」标记会整片消失 |
| 只改双副本数据的一边 | 联网与离线看到不同数据 |
| 新增资源不加进 `sw.js` 的 `ASSETS` | 离线时拿不到 |
| 在非官方年份显示节气时刻 | 未经核对的分钟数 |
| 引入第三方库或构建步骤 | 破坏「零依赖零构建」的核心目标 |
| 只跑属性断言就宣布视觉改动通过 | 属性通过 ≠ 设计迁移到位，见 [VISUAL-CHECK.md](VISUAL-CHECK.md) |

---

## 风险登记

改动时最需要留意的结构性风险，以及对应的缓解手段。

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| DOM 结构重排导致 `cacheDom()` 取到 `null` | 倒计时**静默停更**（无报错） | 只包裹/移动既有节点，不改任何 id；改完跑 `ids_probe.py` |
| 日历多容器渲染产生重复 id | `getElementById` 取错实例 | 渲染到第二份根时**剥离 id**；id 唯一性由 `ids_probe.py` 断言 |
| `clip-path` 裁掉外投影 | 缺角卡失去阴影 | 缺角只用于无外投影的卡片，见 [DESIGN.md](DESIGN.md#五设计相关的坑务必继承) |
| 实色块上文字对比度不足 | 可读性 | `final_probe.py` 逐主题实测（**必须做 alpha 合成**） |
| 移动端一行标题挤压 | Hero 折行塌缩 | `white-space: nowrap` + 容器查询字号 |
| 1024px 断点附近布局抖动 | 单/双栏突变 | `prod_probe.py` 实测 1023 与 1024 两侧 |
| 双副本数据不同步 | 联网与离线数据不一致 | 改完跑 `holiday_check.py` / `solar_check.py` |
| 覆盖规则权重不足 | 改动看着生效实际被压回 | 先用 computed style 确认真实值 |

---

## 本地专属文件（不入库）

有些内容**只对某台机器成立**（解释器绝对路径、浏览器缓存位置、沙箱限制、
控制台编码问题），写进仓库文档会变成对别人的噪声。

**做法**：放在仓库里一个**已被 `.gitignore` 忽略**的文件中，
需要时在 [AGENTS.md](../AGENTS.md) 里**软提及**（「可能存在，值得看一眼」），
**不做硬链接、不登记进索引**。

本仓库的约定：`gaokao/LOCAL-DEV.md`（已忽略）。

判断标准：**换一台机器还成立吗？**
成立 → 写进 `docs/`；不成立 → 写进本地专属文件。

> **不要**把这类文件登记进任何文档索引，也不要加入 `.analysis/` 里
> `docs_selfcheck.py` 与 `md_lint.py` 的检查清单 ——
> 否则别人 clone 之后跑检查会报「文件缺失」。
> 需要检查它时用临时参数：`python .analysis/md_lint.py LOCAL-DEV.md`

---

## 项目不做的事

这些是**有意的边界**，不是待办。

| 不做 | 理由 |
| --- | --- |
| 不改 `time.js` 的算法与数据结构（除非明确要求） | 它是全站单据来源，改动面最大 |
| 不新增第三方依赖、不引入构建步骤 | 「零依赖零构建」是核心目标 |
| 不请求第三方 API 取节假日/节气 | 会引入可用性耦合、CORS、离线失效与隐私成本 |
| 不做服务端校时 | 同上；收益仅覆盖「设备时间本身错误」 |
| 不把主题切换并进设置弹窗 | 主题是独立菜单（明确的交互决策） |
| 不删除 `preview.html` | 它是设计基准与回归对照，见 [DESIGN.md](DESIGN.md#一设计基准) |
| 不为填满左栏而搬动卡片 | 左栏留白是设计基准本身的比例；改动属信息架构决策 |

---

## 相关文档

- 架构与设计决策 → [architecture.md](architecture.md)
- 界面设计语言 → [DESIGN.md](DESIGN.md)
- 视觉验收协议 → [VISUAL-CHECK.md](VISUAL-CHECK.md)
- **改了代码要同步改哪些文件** → [MAINTENANCE.md](MAINTENANCE.md)
- 测试与验收 → [testing.md](testing.md)
- 数据更新 → [data.md](data.md)
- 发布 → [deployment.md](deployment.md)
- 项目定位与已知限制 → [overview.md](overview.md)
