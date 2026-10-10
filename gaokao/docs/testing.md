# 测试与验收

本项目有三层验证，**职责不同、运行环境不同、是否入库也不同**。

| 层 | 位置 | 是否入库 | 运行环境 | 用途 |
| --- | --- | --- | --- | --- |
| ① 冻结回归 | `tests/gaokao-time.test.mjs` | ✅ 入库 | 仅需 Node | 时间逻辑与配置的正确性 |
| ② 数据一致性 | `.analysis/*_check.py` | ❌ 本地 | 仅需 Python | 双副本数据是否同步 |
| ③ 浏览器探针 | `.analysis/*_probe.py` | ❌ 本地 | Python + Playwright + 浏览器 | 真实渲染、布局、交互 |

---

## ① 冻结回归（24 项）

```bash
node tests/gaokao-time.test.mjs
```

覆盖：时间基准、跨年滚动、阶段顺序、覆盖校验、选科相关性。
运行方式说明：也可以用 `node --test tests/`，但若在受限环境下报
`spawn EPERM`（子进程管道被沙箱拦截），直接运行测试文件效果相同。

**这是唯一入库的测试，也是唯一每次改代码都必须跑的测试。**
它通过加载 `time.js` 并注入可控的 `now` / `storage` 来验证纯逻辑，
不依赖浏览器。

### 什么时候必须跑

- 改 `time.js` 任何内容
- 改阶段配置（`PHASE_CONFIG`）或考试表（`exams`）
- 改节假日数据（`HOLIDAY_FALLBACK`）
- 发布前

> **教训**：曾经把一诊日期从 `12-22` 改成 `12-21` 后**忘了同步测试里的断言**，
> 导致它一直失败（23/24）却没人发现。改配置时必须同步跑这一套。

---

## ② 数据一致性检查

```bash
python .analysis/holiday_check.py
python .analysis/solar_check.py
```

判断依据：输出末尾的 `两份数据完全一致 = True`。

节假日与节气各有「内置兜底表 + `data/*.json`」的双副本，
**只改一边会造成静默失效**（联网与离线看到不同数据）。
详见 [data.md](data.md#三-️-双副本必须同步)。

脚本同时报告：条数、按年分布、`confirmed` 数、重复日期/名称。

---

## ③ 浏览器探针

`.analysis/` 下的 Playwright 脚本（**该目录已在 `.gitignore` 中**）。

### 运行前提

1. **先起本地服务器**（在仓库根目录）：

   ```bash
   python -m http.server 8080
   ```

2. **必须在能启动 Chromium 的权限下运行**。
   受限沙箱下 Chromium 会以 `FATAL:mojo ... Check failed: 拒绝访问 (0x5)`
   失败，Playwright 随后报 `PermissionError: [WinError 5]`。

3. Python 环境需已安装 Playwright 与 Chromium。

### 当前在用的探针

| 脚本 | 检查内容 | 产物 |
| --- | --- | --- |
| `ids_probe.py` | 68 个静态 id 是否齐全；**10 个已刻意移除的 id 是否确实不存在**；15 项 DOM/布局结构不变量 | `_shots/ids.json` |
| `prod_probe.py` | 5 主题 × 4 视口（390 / 834 / 1023 / 1280）溢出矩阵、主题菜单、旧键迁移、阶段/选科/设置/全屏/假期弹窗 | `_shots/prod.json` |
| `scroll_probe.py` | 左栏吸附行程（5 个滚动位置）、每秒计时是否推进、选科淡化数量 | `_shots/scroll.json` |
| `round3_probe.py` | 节假日数据、月份标签连续性、rail 初始态与连接线、Hero 文案、5 个阶段 | `round3.json` |
| `lunarjs_probe.py` | 朔表范围与条数、农历与 24 条参照比对、节气时刻 | `lunarjs.json` |
| `parity_probe.py` | 与 `preview.html` 逐项比对设计量（列宽比、色值、圆角、间距、字号系数） | — |
| `final_probe.py` | 5 主题成品截图 + 对比度实测（含 alpha 合成） | `_shots/*.png` |
| `b345_probe.py` | Hero / 假期卡 / 日历卡的渲染与溢出、假期弹窗可用性 | `b345.json` |
| `verify_probe.py` | 多视口下的吸附行程与「回到当前阶段」显隐 | — |
| `cal_probe.py` | 日期选择器「浏览月份不应产生虚假选中」 | — |
| `holiday_check.py` / `solar_check.py` | 见 ② 数据一致性 | stdout |
| `docs_selfcheck.py` / `md_lint.py` | 文档链接有效性、声明值 vs 实际、表格与代码块配平 | stdout |

> `ids_probe.py` 里那 15 项不变量是**结构约束的自动化断言**，包括：
> `heroInsideLeft`（Hero 必须在左栏内）、`phaseNavInsideRail`（阶段导航在轨道内而非左栏）、
> `railFullWidth`（轨道比左栏宽）、`headerAboveCols`（**页头必须在两栏之上** ——
> 这条直接防住「页头标题跑到最下方」）、`leftPosition=sticky`、
> `contentInsideRight`（内容在右栏内）。**改结构后必须看这一份报告。**

### 一次性调试脚本（历史，勿直接复用）

`.analysis/` 下另有约 20 个脚本是**排查特定 bug 时的一次性产物**，例如
`dbg_probe.py` / `dbg2_probe.py` / `dbg3_probe.py`、`issues_probe.py`、
`chips_probe*.py`、`cards*_probe.py`、`lunar_dbg*.py`、`lunar_verify*.py`、
`rail_probe.py`、`runs_probe.py`、`visual_probe.py`、`migrate_probe.py` 等。

它们当时用于定位某个具体缺陷，**结论已沉淀为上面的正式探针或文档**。
保留仅作考古参考，可能已与当前 DOM/类名脱节 ——
**不要拿它们当验收依据。**

还有几个工具脚本：`gen_moon.py` / `gen_solar_json.py`（生成数据表）、
`validate.py`（静态一致性：标签闭合、重复 id、引用完整性）、
`check_live.py`（线上与本地逐字节比对）、`extract_css.py` / `restore_*.py`（一次性迁移工具）。

### ⚠️ 两个必须知道的坑

**坑一：结果写文件，不写 stdout。**
沙箱会拦截命名管道，探针把结果写入 `.analysis/*.json` 而不是打印。
**读断言前先确认报告文件的 mtime 晚于脚本** ——
否则你读到的可能是上一轮的旧结果。

> 这个坑造成过一次**误报**：我曾两次读到陈旧的 `prod.json` 并宣布「通过」，
> 而实际那一轮探针因为缩进错误根本没跑起来。现在流程要求：
> **运行前先删除报告文件，运行后断言文件存在且 mtime 是新的。**

**坑二：`parity_probe.py` 是视觉验收的核心，不要跳过。**
属性断言（无溢出、颜色 token 值）通过**不代表设计迁移到位** ——
v2.2.0 就是因为只断言属性而漏掉了整个设计层，
用户一眼看出「根本没有把配色与布局迁移过来」。

---

## 验收标准（发布前）

| 检查 | 期望值 |
| --- | --- |
| 语法检查 | `node --check` 通过：`time.js` / `lunar.js` / `gaokao.js` / `sw.js` |
| 冻结回归 | **24 / 24** |
| 静态 id 完整性 | 68 项全在，**0 缺失**；10 个已移除 id **0 存在** |
| 主题 × 视口矩阵 | 20 组，**横向溢出 0** |
| 页面溢出 | desktop 0 / phone 0 |
| 吸附行程 | 滚到底部时 `hero.top` 保持 `16`，主倒计时不消失 |
| 日历格 | 35 格（当月），农历/节气标签正常 |
| 农历准确度 | 24/24（2026 参照）+ 26/26（2027 参照） |
| 数据一致性 | `holiday_check.py` / `solar_check.py` 均 `完全一致 = True` |
| 版本号一致 | `time.js` 的 `APP_VERSION` = 页脚 = README = CHANGELOG 顶部 |
| 主题对比度 | 各主题 pill 对比度 ≥ 4.5:1（`final_probe.py`） |
| 页面错误 | 真实 console error **0**（`unsupported MIME` 除外，见下） |

### 关于那条 `unsupported MIME` 报错

本地用 `python -m http.server` 预览时，控制台会出现
`The script has an unsupported MIME type ('text/plain')`。

**这是本地服务器的产物，不是代码问题。** 该服务器把 `.js` 当作 `text/plain` 发送，
导致 Service Worker 注册被拒。GitHub Pages 发送正确的 `application/javascript`，
线上不会有这条报错（已实测确认）。

---

## 视觉验收流程

**完整协议见 [VISUAL-CHECK.md](VISUAL-CHECK.md)** —— 那是一份可复现的验证协议：
有具体命令、具体产物路径、具体判定标准与失败回退。

简版：

1. 起本地服务器，打开 `http://localhost:8080/gaokao/`
2. 同时打开 `http://localhost:8080/gaokao/preview.html`（设计基准）
3. 清空 `.analysis/` 上一轮产物，然后依次跑：
   `parity_probe.py` → `scroll_probe.py` / `verify_probe.py` →
   `prod_probe.py` → `final_probe.py` → `b345_probe.py`
4. **人眼复核 `.analysis/_shots/` 截图**，与 demo 同区域对照

**不要只跑属性断言就宣布通过。**
v2.2.0 就是这样漏掉了整个设计层 —— 属性全绿，用户一眼看出「根本没迁移」。

---

## 历次真实缺陷一览

以下是本项目踩过的**真实缺陷**，每条都有对应检查项。新增测试时优先覆盖同类。

### 时间与数据

| 缺陷 | 症状 | 根因 |
| --- | --- | --- |
| 阶段日期硬编码跨年错乱 | 2027-06-10 后三处自相矛盾 | `PHASE_CONFIG.final` 硬编码 2027 |
| 时区未固定 | 非 UTC+8 用户偏差 8 小时 | 用本地时区构造 `Date` |
| 假期段永不合并 | 假期段始终是单天 | 补零 / 不补零字符串比较 |
| 农历全部落空 | 农历**静默**不显示，无报错 | 1970 基与 2000 基日序号混用 |
| 冬至月判定跨年失效 | 十二月拿不到十一月编号 | 只按起始年取冬至日期 |
| 调休标记整片消失 | 加载后调休日消失 | JSON 只有 1 条调休却整体替换兜底表 |
| 非法数据污染 | 倒计时错乱 | 数据未做整包校验 |
| 设置改了没用 | 高考日期改不动 | 覆盖数据读错字段名（`year` vs `startYear`） |
| 农历朔表整体偏移 11 天 | 自洽但错误，**校验却全通过** | 校验数据与生产代码不同口径 |

### 布局

| 缺陷 | 症状 | 根因 |
| --- | --- | --- |
| 页头标题跑到最下方 | 标题出现在页脚之下 | Grid 自动放置把未指定区域的元素放进隐式行 |
| 双栏静默退化成单列 | 看着是单栏 | 网格加在 `.container` 而非两栏的直接父元素 |
| 吸附的主倒计时消失 | 滚到底部或开弹窗时消失 | sticky 行程用尽 / `overflow:hidden` 改变滚动容器 |
| 覆盖层错位 | 弹窗跑到错误位置 | 用 `body{position:fixed}` 锁滚动，改变了 fixed 包含块 |
| 考试卡重叠 | 信息与倒计时互相盖住 | `min-width:auto` 让 flex 项被压到比内容窄 |
| 阶段轨道连接线歪 | 整条轨道看起来偏 1px | 线用**宽度**算垂直中心，而菱形是 border-box（应按真实渲染高度算） |

### 样式与权重

| 缺陷 | 症状 | 根因 |
| --- | --- | --- |
| `.hidden` 无效 | 加了隐藏类仍显示 | 同权重靠后即胜，被后置的 `.pg-card` 覆盖 |
| 主题覆盖不生效 | 主题色被压回 | 权重不足，被后面的基础规则反超 |
| 图例与实际不一致 | 图例有框、格子没有 | 图例与单元格由不同规则控制 |
| 标签像旧风格 | 看着不像新设计 | 内边距沿用旧值（`2px 10px` 在小字号下读成胶囊） |
| 死类名 | 缺角/折边从未生效 | HTML 写的类名在 CSS 中不存在 |
| 按钮裸用默认外观 | 像上个时代的控件 | `.rail-back` **一条 CSS 规则都没有** |

### 逻辑与交互

| 缺陷 | 症状 | 根因 |
| --- | --- | --- |
| 选科超限 | 允许选 3 科 | 上限判定在 push 之前求值 |
| 翻月产生虚假选中 | 1 号被画成已选 | 浏览游标与已提交值共用字段 |
| 小窗永远浅色 | 深色主题下小窗是浅的 | 判断了 v2.0 的旧主题名 |
| 非高考阶段有残余 | 一屏两套考试 | 日程卡已移出隐藏容器，切换逻辑没跟上 |
| 骨架屏白屏 | 整页被骨架屏盖住 | 只依赖 `transitionend` |
| 脉冲动画不触发 | 死代码 | `ongoing` 类只在不可达分支添加 |
| 月份标签跳过某月 | 标签变成 `10 11 12 1 2 4` | 补的月份只含有假期的月份 |
| 对比度误判 | 错误地「修」了一轮 | 测试脚本未把 `rgba` 与父元素合成 |
| 读到旧报告宣布通过 | 误报「通过」两次 | 探针报告文件未清空，读到上一轮产物 |

---

## 相关文档

- **视觉验收协议** → [VISUAL-CHECK.md](VISUAL-CHECK.md)
- **改了代码要同步改哪些文档** → [MAINTENANCE.md](MAINTENANCE.md)
- 数据更新后的校验 → [data.md](data.md#四年度更新流程)
- 发布前验证 → [deployment.md](deployment.md)
- 开发规范与 CSS 权重约定 → [development.md](development.md)
