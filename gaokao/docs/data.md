# 数据文件

本项目有两组「**内置兜底表 + JSON 覆盖**」的数据。本文说明格式、策略与年度更新流程。

---

## 为什么是「兜底 + JSON」两层

```
内置兜底表（同步，永远可用）
      │
      ├── fetch 成功且格式合法 → 整体替换 → 重渲染
      └── fetch 失败 / 格式非法 → 静默保留兜底（console.warn，不抛错）
```

**网络只负责「可能更新一点」，不负责「有没有数据」。**
这两组数据都是**每个日历格都要用**的，不能承受异步失败。

JSON 存在的唯一意义是给「一年一变的官方公告 / 官方表」留一个更新入口。

> **为什么不用第三方 API**：法定节假日一年一变，引入运行时网络依赖
> 会带来可用性耦合、CORS、离线失效与隐私成本。也不符合本项目
> 「零依赖、离线可用」的目标。

---

## 一、节假日 `data/holidays.json`

- `schemaVersion`: `2`
- `updatedAt`: `2026-10-03`
- `days`: **70 条**（放假 64 + 调休 6）
  - 2026 年 39 条，2027 年 31 条
  - `confirmed: true` 共 **42** 条

### 条目格式

```json
{ "date": "2026-10-01", "name": "国庆节", "kind": "holiday", "confirmed": true }
```

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `date` | `YYYY-MM-DD`（**补零**） | 必须补零，与 `holidayKey()` 的产出格式一致 |
| `name` | 字符串 | 节日名或「调休上班」 |
| `kind` | `holiday` / `workday` / `tentative` | 放假日 / 调休上班 / 待定 |
| `confirmed` | 布尔 | `false` 时界面标「预估」 |

### ⚠️ 调休日必须一起写

`kind: "workday"` 是**数据的一部分**。只写放假日会让界面上的「调休」标记整片消失。

> **这是一次真实事故**：早期 `holidays.json` 只写了 1 条调休（`2026-10-10`），
> 而它会**整体替换** `time.js` 的兜底表，于是加载完成后调休标记几乎全部消失。
> 现在 6 个调休日齐全：
> `1/4`、`2/14`、`2/28`、`5/9`、`9/20`、`10/10`。

### 校验规则（`setHolidayData`）

```
必须是对象，且 days 是数组
每一条必须：
  · date 匹配 /^\d{4}-\d{2}-\d{2}$/
  · kind ∈ { holiday, workday, tentative }
只要有一条不合规 → 整包丢弃，保留兜底表，console.warn
```

**是「整包」校验** —— 这也是不能把节气塞进同一个 `days` 数组的原因
（会让整包校验失败，节假日一起失效）。

---

## 二、节气 `data/solar-terms.json`

- `schemaVersion`: `1`
- `updatedAt`: `2026-10-03`
- `terms`: **50 条**，全部 `confirmed: true`
  - 2026 年 24 条、2027 年 24 条、2028 年 1 月 2 条

### 条目格式

```json
{ "date": "2026-02-04", "name": "立春", "time": "04:02", "confirmed": true }
```

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `date` | `YYYY-MM-DD` | 公历日期 |
| `name` | 字符串 | 节气名 |
| `time` | `HH:MM` | **北京时间（UTC+8）**，精确到分；可为空串 |
| `confirmed` | 布尔 | 官方公布值 |

### 时刻的使用范围

界面上**只显示节气名，不显示时刻**。原因：

1. 月历格的三行小字塞不下 `04:02`；
2. 2028 年以后没有官方时刻，显示会造成「有的有没有」的不一致。

时刻保留在日历格的 `aria-label` 中供读屏使用。

### 校验规则（`setSolarTermsData`）

```
必须是对象，且 terms 是数组
每一条必须：
  · date 匹配 /^\d{4}-\d{2}-\d{2}$/
  · name 是非空字符串
  · time 若存在必须是字符串（可为空）
只要有一条不合规 → 整包丢弃，保留兜底表
```

### 近似年份

官方未公布的年份由 `lunar.js` 的 `SOLAR_TERM_APPROX` 提供，**只有日期没有时刻**：

| 年份 | 覆盖 |
| --- | --- |
| 2028 | 全年（除 1 月已由 JSON 提供） |
| 2029 | 全年 |

近似值由标准近似式推算并逐月校正（该式在 7/8/9/10 月需 +2 天经验修正，
已用 2026 / 2027 官方表比对过）。

> **同一年不要同时出现在 `SOLAR_TERMS_FALLBACK` 和 `SOLAR_TERM_APPROX` 里**。
> 前者优先，但重复是隐患。

---

## 三、⚠️ 双副本必须同步

节假日与节气各有两份同内容的副本：

| 数据 | 副本 A（兜底） | 副本 B（覆盖） |
| --- | --- | --- |
| 节假日 | `time.js` 的 `HOLIDAY_FALLBACK` | `data/holidays.json` |
| 节气 | `lunar.js` 的 `SOLAR_TERMS_FALLBACK` | `data/solar-terms.json` |

**只改一边会造成静默失效** —— 页面在 fetch 成功时会用副本 B 覆盖副本 A，
但 fetch 失败时用副本 A。两边不一致意味着「联网与离线看到不同数据」。

> 节假日**已经因为两边不同步返工过三次**，所以校验脚本不是可选项。

### 校验脚本

两个脚本都在 `.analysis/`（不入库，属本地工具），只读文件并逐条 diff：

```bash
python .analysis/holiday_check.py   # holidays：副本 A vs 副本 B
python .analysis/solar_check.py     # 节气：副本 A vs 副本 B
```

**唯一通过标志**是输出中的 `两份数据完全一致 = True`。

脚本还会顺带报告：条数、按年分布、`confirmed` 数、重复日期/名称。

---

## 四、年度更新流程

### 节假日（每年 11 月前后）

国务院办公厅发布次年安排后：

1. **两处都改**：`time.js` 的 `HOLIDAY_FALLBACK` **和** `data/holidays.json`
2. 把对应年份的条目标为 `confirmed: true`
3. **别漏调休日**（`kind: "workday"`）
4. 更新两份文件的 `updatedAt`
5. 跑 `python .analysis/holiday_check.py`，确认 `完全一致 = True`
6. 跑冻结回归：`node tests/gaokao-time.test.mjs`

> 2026 年数据依据：**国办发明电〔2025〕7 号**。2027 年为预估。

### 节气（官方表发布后）

1. **两处都改**：`lunar.js` 的 `SOLAR_TERMS_FALLBACK` **和** `data/solar-terms.json`
2. 若该年已在 `SOLAR_TERM_APPROX` 里，**把它从近似表移除**（避免同一年两处）
3. 更新 `updatedAt`
4. 跑 `python .analysis/solar_check.py`
5. 跑 `node tests/gaokao-time.test.mjs`

---

## 五、`preview.html` 与数据的关系

`preview.html`（设计基准 demo）**自带一份内联的假数据**，用于展示设计。
它**不引用** `data/*.json`，也不参与运行时。

这意味着：**改动数据不需要同步改 `preview.html`**，
但改动**视觉**时必须对照它（见 [development.md](development.md)）。

---

## 相关文档

- 数据层的架构理由 → [architecture.md](architecture.md#3-兜底--json-覆盖数据层策略)
- 校验脚本与验收 → [testing.md](testing.md)
- 数据相关函数签名 → [implementation.md](implementation.md)
