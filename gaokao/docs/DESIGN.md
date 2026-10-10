# 设计语言

本文是**界面设计的权威说明**：token 契约、形状与材质规则、组件规格、
以及视觉相关的坑。改动任何外观前先读本文，并对照 `preview.html`。

> 视觉验收有专门的可复现协议，见 [VISUAL-CHECK.md](VISUAL-CHECK.md)。

---

## 一、设计基准

`gaokao/preview.html` 是**设计基准 demo**，自带主题 / 视口 / 字号切换工具条。
它带 `noindex, nofollow`，不参与搜索引擎收录，也不参与运行时。

**规矩：改任何视觉相关代码后必须与它对照。**
属性断言（无溢出、token 值正确）通过**不代表设计迁移到位** ——
v2.2.0 就是这样漏掉了整个设计层。

打开方式（先起本地服务器，见 [deployment.md](deployment.md#本地预览)）：

```
http://localhost:8080/gaokao/preview.html
```

---

## 二、配色：token 契约

5 套主题全部挂在 `html[data-theme]` 上做 **token 覆盖，组件 CSS 零改动**。

### 26 个 token

| 分组 | token |
| --- | --- |
| 背景 | `--bg` `--bg-soft` `--bg-card` `--bg-card-hover` `--bg-inset` |
| 文字 | `--text` `--text-2` `--text-3` |
| 强调 | `--accent` `--accent-weak` `--accent-text` |
| 语义 | `--info` `--info-weak` `--ok` `--ok-weak` |
| 描边与阴影 | `--border` `--border-strong` `--shadow` `--shadow-lift` |
| 字体 | `--font-display` `--font-heading` |
| 卡片 | `--card-tint` `--card-accent` `--card-solid-bg` `--card-solid-fg` `--card-solid-line` |
| 信息块 | `--info-block` `--info-block-fg` |

### 五套主题

| 主题 | id | 性格 |
| --- | --- | --- |
| 砚台 | `ink` | 暖纸 · 人文衬线 |
| 夜航 | `night` | 深色主导 |
| 白板 | `board` | 极简高对比 |
| 青瓷 | `celadon` | 冷调克制 |
| 露营 | `camp` | 日落橙 + 天蓝 · 温暖户外 |

### 实色卡片的安全复用

**露营主题是唯一「大胆用色」的**，4 个实色块：

```
--camp-sun  #E8892B     --camp-sky  #8FD3E8
--camp-tree #A7D9A0     --camp-sand #F7CE6B
```

前景统一 `#1F1A12`（实测对比度 **6.5–10.9:1**）。

其他 4 套主题里 `--card-solid-bg` 退回 `var(--bg-card)`，
所以**彩块会自动降级成普通卡片** —— 这意味着彩块类可以安全地在所有主题复用，
不需要为主题写例外。

---

## 三、形状与材质语言（反「AI 味」的核心）

### 圆角刻意见三档

| token | 值 | 用途 |
| --- | --- | --- |
| `--r-sharp` | `2px` | 标签 / 图章 / 进度段 / 状态点 |
| `--r-btn` | `5px` | 按钮 / chip / 考试卡 |
| `--r-card` | `12px` | 卡片（唯一的大圆角） |

**不做「一圆到底」。** 统一大圆角是机器味的主要来源。
全页**不允许**出现 `border-radius: 50%` 或 `999px`
（状态圆点已全部改为 `--r-sharp` 方点）。

### 实色描边替代柔和投影

`--bd: 1.5px` 实色描边 + 硬阴影（露营 `0 2px 0`／夜航柔和深影）。
柔和阴影是「AI 味」的另一个主要来源。

### 形状分化

- `.card--notch` —— 右下缺角 + 可见折边（`clip-path`）
- `.cal-day.holiday` —— 单独放大到 `8px` 圆角，与周围方格形成反差

### 材质分化

- **地图网格纹理** —— `repeating-linear-gradient` 双层，纯 CSS 零资源，铺在阶段轨道上
- **45° 斜纹** —— 日程卡与调休日，与其他卡片的纯白拉开材质差

### 卡内页眉

`.card-band` —— 一块窄实色横条，给整卡一个「色块起点」。

---

## 四、组件规格

| 组件 | 关键规格 |
| --- | --- |
| Hero 大数字 | `container-type: inline-size` + `font-size: calc(var(--n) * 1cqw)`；`--n` = 22/24/26 对应三档字号；`white-space: nowrap` **绝不允许折行**；单位随数字 baseline 对齐 |
| Hero 精确行 `.h-sub` | 左侧 `3px` 实色竖线，等宽字体，与数字同色 |
| 状态 pill | `--r-sharp` 直角、`4px 9px` 内边距、`6px` 方点（`.dt.pulse` 呼吸）；Hero 内改 `rgba(255,255,255,.55)` 底 |
| 阶段节点 | **旋转 45° 的方块（菱形）**，不是圆点；已结束 = 实心灰、进行中 = 强调色 + 光晕、当前 = 强调色描边、未来 = 描边 |
| 考试卡 `.exam` | `grid 1fr auto`；**左侧 3px 实色竖条**做状态标记（不用整块淡底）；`.selected` 竖条 + 科名变强调色、`.dimmed` 透明度 `.4` |
| 日期分隔 `.day-head` | 等宽字体日期块（`--r-sharp` 实色底）+ 星期文字 |
| 场次分隔 `.sess` | 左右两条 1px 细线夹住「上午场 / 下午场」 |
| 选科 `.chip` | `--r-btn` 近直角方块，**不是胶囊**；选中 = 强调色实底 |
| 科目标签 `.tag-*` | `2px` 直角、`2px 6px` 内边距、`0.62rem/600`、**实色浅底**（不用半透明叠加） |
| 选科徽章 `.sel-badge` | 与科目标签同规格；`5px` 方点；状态色跟随 `--chip-elective-*` |
| 日历 `.cal-day` | `min-height: 56px`；放假日整格强调色 + `8px` 圆角；调休日 45° 斜纹；预估日天蓝整格；今天 = `2px` 描边 + 底部方点 |
| 节气标签 `.hm-term` | 强调色 + **空心方框**（与图例样例一致）；农历 `.hm-lu` 为最次级文字色纯文字 |

> 新增图例项时，**图例样例必须与实际单元格同源**（复用同一个 `--r-*` 变量与同一处
> border 声明）。v2.4.1 一次修了三处「图例有框、格子没有」，都是两套规则各画各的。

---

## 五、设计相关的坑（务必继承）

以下是 demo 时期与生产端实测踩过的坑，**每条都对应一条可验证的检查**。

| # | 坑 | 后果 | 做法 |
| --- | --- | --- | --- |
| 1 | `overflow: hidden` 裁掉旋转 45° 的菱形顶部 | 节点被削平 | 轨道容器**不加** `overflow` |
| 2 | `clip-path` 在圆角与阴影之后应用 | 外投影被裁掉 | 缺角只用于**不依赖外投影**的卡片 |
| 3 | `flex-wrap: nowrap` 拦不住文字换行 | 整行塌缩 | 必须额外写 `white-space: nowrap` |
| 4 | 字号用 `vw` | 窄卡片里必溢出 | 用 `cqw`（容器查询） |
| 5 | `--card-solid-*` 缺中性兜底 | 非露营主题上彩块变空白 | 必须给中性回退值 |
| 6 | 实色卡上的标题没走卡片前景色 | 浅字压浅底糊成一片 | 标题用 `--card-solid-fg` |
| 7 | Hero 里的 pill 沿用浅底浅字 | 在实色 Hero 上不可读 | Hero 内改 `rgba(255,255,255,.55)` 底 |
| 8 | 给所有东西统一大圆角 | 「AI 味」 | 见上面的三档圆角 |
| 9 | 图例样例与单元格由不同规则控制 | 图例承诺的样式格子里没有 | 图例与单元格复用同一变量与声明 |
| 10 | 覆盖规则权重不足 | 改动看着生效实际被压回 | 先用 computed style 确认真实值，见 [development.md](development.md#css-权重约定) |

---

## 六、对比度要求

实色块上的文字对比度必须 **≥ 4.5:1**。
各主题的 pill 与卡片前景色都已按此选取并实测
（测量方式见 [VISUAL-CHECK.md](VISUAL-CHECK.md)，注意需要做 alpha 合成）。

> **曾经的坑**：夜航主题的 Hero pill 对比度一度只有 1.18:1 ——
> 因为测试脚本**没有把 `rgba` 底色与父元素合成**，算出了一个假的高分，
> 于是错误地「修」了一轮。合成后的正确选择器是
> `html[data-theme="night"] .hero-countdown .stat-row .pill`。

---

## 相关文档

- 视觉验收协议 → [VISUAL-CHECK.md](VISUAL-CHECK.md)
- CSS 权重约定 → [development.md](development.md#css-权重约定)
- 功能的视觉行为 → [modules.md](modules.md)
- 改造视觉的历史与验收记录 → [CHANGELOG.md](../CHANGELOG.md)
