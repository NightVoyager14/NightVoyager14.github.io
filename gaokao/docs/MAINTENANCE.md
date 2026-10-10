# 维护指南：改什么要同步改哪里

本项目的文档与代码有多处**交叉引用**（`docs/` 里引用具体函数名、常量值、行数、
选择器、数据条目数）。改代码而不同步改文档，文档就会变成错的 ——
而错的文档比没有文档更危险。

本文给出**变更类型 → 必须同步的文件**对照表，以及**需要保持一致的数值**清单。

> **数值清单（§2）是最容易被忽略、也最容易悄悄失准的部分**，
> 每次提交前跑 `python .analysis/docs_selfcheck.py` 会自动核对其中几项。
> 命令见 [testing.md](testing.md)。

---

## 一、变更类型 → 必须同步的文件

### 改时间逻辑（`time.js` 的时间基准部分）

例：改 `bjDate` / `cnDayKey` / `splitDuration` / `targetState`。

| 必须同步 | 同步什么 |
| --- | --- |
| **`tests/gaokao-time.test.mjs`** | 断言的期望值。**改配置却忘改测试，测试会一直红着没人发现**（发生过） |
| [architecture.md](architecture.md) | 「时间一律以北京时间」一节、日序号口径表 |
| [implementation.md](implementation.md) | `time.js` 一节里的函数签名与返回值示例 |
| [development.md](development.md) | 项目约定、禁止事项 |
| [AGENTS.md](../AGENTS.md) | 约束表第 1–3 行 |
| [CHANGELOG.md](../CHANGELOG.md) | 新增条目 |

### 改考试科目 / 阶段配置（`exams` / `PHASE_CONFIG` / `PHASE_ORDER`）

| 必须同步 | 同步什么 |
| --- | --- |
| **`tests/gaokao-time.test.mjs`** | 场次数、时刻、阶段顺序断言 |
| [implementation.md](implementation.md) | 考试科目表的 tag 映射、阶段配置说明 |
| [modules.md](modules.md) | 「阶段」一节的节点四态、显隐表 |
| [README.md](../README.md) | 功能特性里若提到场次数 |
| [CHANGELOG.md](../CHANGELOG.md) | 新增条目 |

> 改科目时间后还要确认 `gaokaoEnd` 的推导仍然正确（它取最后一场的结束时刻）。

### 改节假日数据

| 必须同步 | 同步什么 |
| --- | --- |
| **`time.js` 的 `HOLIDAY_FALLBACK`** | 与 `data/holidays.json` **逐条一致** |
| **`data/holidays.json`** | 同上 |
| [data.md](data.md) | 条目数、按年分布、`confirmed` 数、调休日清单、`updatedAt` |
| [README.md](../README.md) | 常见问题里若提到年份与文号 |
| [AGENTS.md](../AGENTS.md) | 数据更新速查表；若调休日数量变了，约束表第 9 行 |

**验证**：`python .analysis/holiday_check.py` → 必须 `完全一致 = True`

### 改节气数据

| 必须同步 | 同步什么 |
| --- | --- |
| **`lunar.js` 的 `SOLAR_TERMS_FALLBACK`** | 与 `data/solar-terms.json` **逐条一致** |
| **`data/solar-terms.json`** | 同上 |
| [data.md](data.md) | 条目数、按年分布、`updatedAt` |
| [implementation.md](implementation.md) | 「节气：两级数据」的年份覆盖表 |
| [modules.md](modules.md) | 「数据分级」表 |
| [overview.md](overview.md) | 已知限制第 3 条（近似年份的范围） |
| [AGENTS.md](../AGENTS.md) | 数据更新速查表 |

**验证**：`python .analysis/solar_check.py` → 必须 `完全一致 = True`

> 把某年从近似表升级为官方值时，**记得把它从 `SOLAR_TERM_APPROX` 移除**，
> 避免同一年同时出现在两张表里。

### 改农历算法或朔表（`NEW_MOON_DAYS`）

| 必须同步 | 同步什么 |
| --- | --- |
| [implementation.md](implementation.md) | 朔表范围、条数、三步算法说明 |
| [overview.md](overview.md) | 已知限制第 4 条（朔表覆盖范围） |
| [data.md](data.md) | 若涉及数据文件 |
| [AGENTS.md](../AGENTS.md) | 约束表第 2 行 |

**验证**：`python .analysis/lunarjs_probe.py` → `match` 必须等于 `total`

### 改视觉 / 主题 / 组件样式

| 必须同步 | 同步什么 |
| --- | --- |
| [DESIGN.md](DESIGN.md) | token 契约、圆角档位、组件规格表、设计坑 |
| **对照 `preview.html`** | 设计基准，不可只改生产页 |
| [CHANGELOG.md](../CHANGELOG.md) | 新增条目（含根因） |

**验证**：**完整流程见 [VISUAL-CHECK.md](VISUAL-CHECK.md)**（6 步，含人眼复核截图）

### 改 DOM 结构 / 移动元素 / 增删 id

| 必须同步 | 同步什么 |
| --- | --- |
| **`.analysis/ids_probe.py`** | 若刻意移除某 id，加入 `REMOVED` 列表；若新增必需 id，加入 `IDS` 列表 |
| [implementation.md](implementation.md) | DOM 契约表、索引生成规则 |
| [architecture.md](architecture.md) | 布局结构一节 |
| [development.md](development.md) | 硬约束（`grid-area` 等） |

**验证**：`python .analysis/ids_probe.py` → `missing` 与 `shouldBeAbsent` 都必须为空

> 这是**最容易造成静默故障**的改动：`cacheDom()` 取到 `null` 时倒计时会停止更新，
> **不报错**。ids 探针里的 15 项结构不变量就是为此存在的。

### 新增静态资源

| 必须同步 | 同步什么 |
| --- | --- |
| **`sw.js` 的 `ASSETS`** | 加入新文件，否则离线拿不到 |
| [deployment.md](deployment.md) | 缓存资源清单、缓存名 |
| [architecture.md](architecture.md) | 目录结构 |
| [README.md](../README.md) | 目录结构 |

### 改版本号

只改 `time.js` 的 `APP_VERSION`，然后**同步以下四处**（缺一处会出现首屏显示旧号或文档与代码不符）：

| 位置 | 说明 |
| --- | --- |
| `time.js` 的 `APP_VERSION` | **权威来源** |
| `index.html` 的 `<span id="versionLabel">` | 首屏占位 |
| [README.md](../README.md) | 「当前版本」 |
| [AGENTS.md](../AGENTS.md) | 项目一节 |
| [CHANGELOG.md](../CHANGELOG.md) | 顶部新增条目 |

**验证**：`python .analysis/docs_selfcheck.py`（§3 版本号一致性）

### 改测试或探针脚本

| 必须同步 | 同步什么 |
| --- | --- |
| [testing.md](testing.md) | 探针清单表、检查内容、产物路径 |
| [VISUAL-CHECK.md](VISUAL-CHECK.md) | 若影响视觉验收步骤，同步命令顺序与判定 |
| [AGENTS.md](../AGENTS.md) | 「快速验证」代码块、约束表的「验证」列 |
| [deployment.md](deployment.md) | 发布前检查清单 |

### 改文档结构（新增/删除/重命名文档）

| 必须同步 | 同步什么 |
| --- | --- |
| [docs/README.md](README.md) | **文档索引**（新文档必须登记，否则等于不存在） |
| [AGENTS.md](../AGENTS.md) | 「约束的完整说明在哪」表 |
| [README.md](../README.md) | 「文档索引」表 |
| [architecture.md](architecture.md) | 目录结构树 |

**验证**：`python .analysis/docs_selfcheck.py` → 链接必须全部有效

> **只在本机存在的文件（如 `LOCAL-DEV.md`）不要登记进任何索引**，
> 也不要加入 `.analysis/` 里那三个入库检查器的文件清单（`docs_selfcheck.py`
> 与 `md_lint.py`）。否则别人 clone 之后检查会报「文件缺失」。
> 这类文件的做法见 [development.md](development.md) 的相关说明。

---

## 二、需要保持一致的数值清单

以下数值被**多处文档引用**，改代码后必须逐一核对。
括号内是当前值（v2.5.2）。

| 数值 | 出现在 | 当前 |
| --- | --- | --- |
| 版本号 | `time.js`、`index.html`、README、AGENTS、CHANGELOG | `2.5.2` |
| 静态 id 数 | `ids_probe.py` 的 `IDS`、implementation.md、AGENTS.md、architecture.md | 68 |
| 刻意移除的 id 数 | `ids_probe.py` 的 `REMOVED`、AGENTS.md（约束 5） | 10 |
| `cacheDom` 缓存数 | implementation.md | 37 |
| `index.html` 行数 | architecture.md、AGENTS.md | 420 |
| `style.css` 行数 | architecture.md、AGENTS.md | 4019 |
| `gaokao.js` 行数 | architecture.md、AGENTS.md | 2765 |
| `time.js` / `lunar.js` / `sw.js` 行数 | architecture.md | 366 / 278 / 112 |
| 考试场次 | implementation.md、README.md、`ids_probe.py` 的 `examCards` | 9 |
| 阶段数 | implementation.md、modules.md | 5 |
| 选科选项数 | implementation.md、`ids_probe.py` 的 `subjectOptions` | 6 |
| 主题数 × 字号档数 | development.md、testing.md、modules.md | 5 × 3 |
| 溢出矩阵组数 | testing.md、AGENTS.md | 20（5 主题 × 4 视口） |
| 节假日条目数 / 调休数 | data.md、AGENTS.md（约束 9） | 70 / 6 |
| 节气条目数 | data.md | 50（2026:24 / 2027:24 / 2028:2） |
| 冻结回归项数 | README.md、AGENTS.md、testing.md、deployment.md | 24 |
| `LUNAR_EPOCH_DAY` | architecture.md、development.md、AGENTS.md | 10957 |
| 朔表条数与范围 | implementation.md、overview.md | 95 条 |
| token 数 | DESIGN.md | 26 |

> **自动化程度有限**：`docs_selfcheck.py` 目前只自动核对
> **版本号**、**行数**、**id 数**、**`cacheDom` 数**、**数据条目数**。
> 其余（场次、阶段数、主题数、回归项数等）需要人工核对 ——
> 这张表就是人工核对的清单。

---

## 三、每次提交前

```bash
node tests/gaokao-time.test.mjs          # 24/24
python .analysis/docs_selfcheck.py       # 文档链接 + 声明值 + 版本号
python .analysis/md_lint.py              # 表格列数 + 代码块配平
```

改了数据的，加跑对应的 `*_check.py`；
**改了视觉的，走完 [VISUAL-CHECK.md](VISUAL-CHECK.md) 全流程。**

---

## 四、关于本文件与相邻文档的边界

| 文档 | 回答的问题 |
| --- | --- |
| 本文 | **改了 X，要同步改哪些文件 / 哪些数值要保持一致** |
| [development.md](development.md) | 开发时**怎么改才对**（规范、约定、权重、风险、禁止事项） |
| [testing.md](testing.md) | **怎么验证**（三层验证体系与验收标准） |
| [VISUAL-CHECK.md](VISUAL-CHECK.md) | **视觉改动怎么验证**（可复现的 6 步协议） |

四者不重叠：本文只管「改动的辐射面」。

---

## 相关文档

- 开发规范与禁止事项 → [development.md](development.md)
- 测试与验收 → [testing.md](testing.md)
- 视觉验收协议 → [VISUAL-CHECK.md](VISUAL-CHECK.md)
- 文档索引 → [README.md](README.md)
