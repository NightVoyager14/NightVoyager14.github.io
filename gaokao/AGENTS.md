# AGENTS.md

**这是路由器，不是百科全书。** 只放「不知道就会改错」的信息；
每条约束都附**可执行的验证方式**。细节一律在 [`docs/`](docs/README.md)。

---

## 项目

纯静态、零依赖、零构建的**四川 3+1+2 新高考倒计时**页面。
GitHub Pages 发布，全部代码在 `gaokao/`。

- 线上：<https://www.nightvoyager.online/gaokao/>
- 版本：**v2.5.2**（唯一来源 `time.js` 的 `APP_VERSION`）
- 技术栈：原生 HTML / CSS / JS。**没有** `package.json`、构建步骤、第三方库

**动手前先跑一遍下面的「快速验证」，确认基线是绿的。**

---

## 快速验证

```bash
node tests/gaokao-time.test.mjs                  # 冻结回归，必须 24/24
python .analysis/holiday_check.py                # 节假日双副本一致
python .analysis/solar_check.py                  # 节气双副本一致
python .analysis/docs_selfcheck.py               # 文档链接与声明值
```

需要浏览器渲染的检查（先起 `python -m http.server 8080`，在仓库根目录）：

```bash
python .analysis/ids_probe.py      # id 完整 + DOM 结构不变量 + 布局归属
python .analysis/prod_probe.py     # 5 主题 × 4 视口溢出矩阵 + 交互
python .analysis/scroll_probe.py   # 吸附行程 + 每秒计时 + 选科淡化
python .analysis/lunarjs_probe.py  # 农历准确度（朔表 + 24 条参照）
python .analysis/parity_probe.py   # 与 preview.html 逐项比对设计量
python .analysis/final_probe.py    # 各主题对比度（含 alpha 合成）
```

> **产物是文件不是 stdout**（沙箱拦截管道）：读报告前先确认 `.analysis/**/*.json`
> 的 mtime 是新的，否则你可能读到上一轮的旧结果 —— 这造成过两次误报「通过」。

结果写入位置：`ids/prod/scroll` → `.analysis/_shots/*.json`；
`lunarjs/round3` → `.analysis/*.json`。

---

## 约束 → 验证方式

| # | 约束 | 验证 |
| --- | --- | --- |
| 1 | 时间一律用 `bjDate()`，禁止 `new Date(y,m,d)` | `node tests/gaokao-time.test.mjs`（「bjDate …与世界时区无关」等 24 项） |
| 2 | 两套日序号不可混用：`cnDayNumber()`(1970基) vs `lunarEpochDay()`(2000基)，差 `LUNAR_EPOCH_DAY=10957` | `lunarjs_probe.py` — 混用会让 `match` 掉到 0 |
| 3 | `cnDayKey()` 不补零、数据文件补零，跨格式比较用 `holidayDateNumber()` | `round3_probe.py` — 假期段合并 `data.springDays` |
| 4 | 版本号只在 `time.js` 的 `APP_VERSION`；页脚由它填充；SW 缓存名含它 | `docs_selfcheck.py`（四处一致性）+ `ids_probe.py` |
| 5 | 倒计时只有一处（Hero）；禁止为阶段另建带倒计时的卡片 | `ids_probe.py` — `REMOVED` 列表断言 `phaseDetail` 等 10 个 id **必须不存在** |
| 6 | `.main-content` 直接子元素必须显式 `grid-area` | `ids_probe.py` — `dom.headerAboveCols`（页头必须在两栏之上） |
| 7 | 左栏 `grid-row` 必须跨到页脚行，否则 sticky 行程用尽 | `ids_probe.py`（`leftPosition=sticky`）+ `scroll_probe.py`（5 个滚动位置 `heroVisible` 全为 true） |
| 8 | 新增每格都要用的数据必须「同步兜底 + JSON 覆盖」两层 | `holiday_check.py` / `solar_check.py` 比对双副本 |
| 9 | 调休日（`kind:"workday"`）必须写进节假日数据 | `round3_probe.py` — `data.workdays`（当前应为 6） |
| 10 | 新增资源必须加进 `sw.js` 的 `ASSETS` | 人工 diff：`sw.js` 的 `ASSETS` 与 `gaokao/` 实际资源清单 |
| 11 | 不用 `overflow:hidden` / `body{position:fixed}` 锁滚动 | `prod_probe.py`（弹窗/全屏打开时 `bodyOverflowX`、覆盖层尺寸）+ `scroll_probe.py` |
| 12 | 全页无全圆角（`50%` / `999px`）；状态点用 `--r-sharp` 方点 | 见 [VISUAL-CHECK.md](docs/VISUAL-CHECK.md) 步骤 5 截图复核 |
| 13 | 图例样例必须与实际单元格同源 | 见 [VISUAL-CHECK.md](docs/VISUAL-CHECK.md) 步骤 5 |
| 14 | 实色块上文字对比度 ≥ 4.5:1（**必须做 alpha 合成**） | `final_probe.py` |
| 15 | 改视觉必须与 `preview.html` 对照，属性通过 ≠ 通过 | **完整协议**见 [VISUAL-CHECK.md](docs/VISUAL-CHECK.md) |
| 16 | 改 CSS 覆盖前先用 computed style 确认权重 | `parity_probe.py`（用 computed style 告出真实生效值） |
| 17 | 不引入第三方依赖 / 构建步骤 | `git status` 看是否新增 `package.json` / `node_modules` / lockfile（**无自动断言**） |
| 18 | 不改 `time.js` 的算法与数据结构（除非明确要求） | 代码评审 + `node tests/gaokao-time.test.mjs` 必须仍 24/24 |

**理由与背景**（为什么有这条约束、踩过什么坑）请查下表对应文档，本文不复述。

---

## 约束的完整说明在哪

| 想知道 | 读 |
| --- | --- |
| **改了代码要同步改哪些文档 / 哪些数值要保持一致** | [docs/MAINTENANCE.md](docs/MAINTENANCE.md) |
| 全部禁止事项、风险登记、项目不做的事 | [docs/development.md](docs/development.md) |
| 时间基准、日序号口径、分层与数据流 | [docs/architecture.md](docs/architecture.md) |
| 函数签名、DOM 契约、启动顺序 | [docs/implementation.md](docs/implementation.md) |
| 界面设计语言（token / 圆角 / 组件规格 / 设计坑） | [docs/DESIGN.md](docs/DESIGN.md) |
| **改视觉后的验收步骤** | [docs/VISUAL-CHECK.md](docs/VISUAL-CHECK.md) |
| 数据格式与**年度更新流程** | [docs/data.md](docs/data.md) |
| 三层测试体系、历次真实缺陷 | [docs/testing.md](docs/testing.md) |
| 发布、缓存、版本号 | [docs/deployment.md](docs/deployment.md) |
| 功能行为 | [docs/modules.md](docs/modules.md) |
| 定位、已知限制 | [docs/overview.md](docs/overview.md) |
| 版本历史 | [CHANGELOG.md](CHANGELOG.md) |

---

## 目录

```
gaokao/
├── index.html      ├── time.js      ├── sw.js          ├── docs/    ← 细节都在这
├── style.css       ├── lunar.js     ├── manifest.json  ├── README.md   给人看
├── gaokao.js       ├── data/        ├── preview.html   ├── AGENTS.md   本文件
```

`tests/gaokao-time.test.mjs` 在**仓库根目录**。

**JS 加载顺序是硬依赖**：`time.js` → `lunar.js` → `gaokao.js`，
前两者零 DOM（因此可脱离浏览器测试）。

> 如果你在作者本机工作，可能还存在一份 `LOCAL-DEV.md`（记录本机解释器路径、
> 沙箱限制、控制台编码等环境相关事项）。它**不入库**，所以不一定存在；
> 存在的话值得先看一眼。仓库内的通用内容不在那个文件里。

---

## 数据更新速查

| 改什么 | 改哪几处 | 验证 |
| --- | --- | --- |
| 放假 / 调休 | `time.js` 的 `HOLIDAY_FALLBACK` **和** `data/holidays.json` | `holiday_check.py` |
| 节气（官方年份） | `lunar.js` 的 `SOLAR_TERMS_FALLBACK` **和** `data/solar-terms.json` | `solar_check.py` |
| 节气（未来近似） | 只改 `lunar.js` 的 `SOLAR_TERM_APPROX` | 无需（单副本） |
| 版本号 | 只改 `time.js` 的 `APP_VERSION`，并同步页脚与 README | `docs_selfcheck.py` |

**双副本只改一边会造成静默失效**（联网与离线数据不同）。
节假日已因此返工三次。详见 [docs/data.md](docs/data.md)。

---

## 提交

```bash
git add -A && git commit -m "type(gaokao): 描述"
```

`type`：`feat` / `fix` / `docs` / `perf` / `refactor` / `chore`；破坏性加 `!`。

**改动后必跑**：`node tests/gaokao-time.test.mjs`（24/24）。
改了数据加跑对应 `*_check.py`；改了视觉跑 [VISUAL-CHECK.md](docs/VISUAL-CHECK.md) 全流程。
发布见 [docs/deployment.md](docs/deployment.md)。
