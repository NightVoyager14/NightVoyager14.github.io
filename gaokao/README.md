# 四川高考倒计时 · 3+1+2

一个**纯静态、零依赖、零构建**的新高考倒计时与考试日程页面。
浏览器直接打开就能跑，没有任何依赖要安装。

**线上地址：<https://www.nightvoyager.online/gaokao/>**

---

## 这是什么

给四川新高考考生用的一个小页面，把三件事放在同一屏里：

1. **离高考还有多久** —— 总倒计时，以及 9 场考试各自的倒计时
2. **现在处于哪个阶段** —— 零诊 / 一诊 / 二诊 / 三诊 / 高考 五阶段预报
3. **接下来怎么放假** —— 节假日日历，带农历与二十四节气

它是个人项目，也是长期维护的：项目作者自述没怎么写过前端，
所以这里刻意把「数据只有一处来源」「改错了能被测试抓到」当成硬要求 ——
否则这类页面过一年就没人敢动了。

技术上没有框架、没有构建步骤、没有 `node_modules`：
打开 `index.html` 就是完整应用。全部代码在 `gaokao/` 这一个目录里。

**想改代码** → [`docs/`](docs/README.md)（文档索引与阅读路径）
**AI 协作者** → [`AGENTS.md`](AGENTS.md)

---

## 功能特性

### 倒计时

分三层，一眼看清「还有多久」：

- **总倒计时** —— 大字显示距高考的天数，下面跟精确到秒的时分秒
- **当前/下一场考试** —— 场次名称、时段、剩余时间、进度条
- **逐场倒计时** —— 9 场科目各自还有多久

倒计时**全站只有一处**，不会出现两处在数同一件事。

### 五阶段预报

零诊 / 一诊 / 二诊 / 三诊 / 高考，一条轨道上的五个菱形节点：

- 状态**随时间自动翻转**（已结束 / 进行中 / 当前 / 未来）
- 点任一节点即可查看该阶段，「回到当前阶段」一键返回
- 查看已结束阶段时轨道换色提示

### 考试日程与选科

- 9 场考试按 6/7–6/10 四天分「上午场 / 下午场」列出
- 选科标记：首选（历史 / 物理，互斥）+ 再选（化学 / 地理 / 思想政治 / 生物学，限 2 科）
- 选完后自动**高亮**已选科目、**淡化**未选科目

### 节假日日历

- 右栏常驻月历，放假 / 调休 / 预估**三态着色**
- 左栏「下一个假期」卡，显示假期名、日期区间、剩余天数和进度
- 「假期」按钮打开未来几个假期的时间线速览
- 每格还带**农历**与**二十四节气**（如「霜降 + 十四」）
- 2026 年数据依国务院办公厅正式通知，未公布的年份标「预估」

### 外观

- **五套主题**：砚台 / 夜航 / 白板 / 青瓷 / 露营
- **三档字号** + **明暗自适应**（跟随系统）
- 主题菜单独立，与设置分开

### 其他

- **全屏模式**：大号倒计时 + 进度条，考试时适合放在旁边
- **浮动小窗**：画中画显示，可以盖在其他窗口上面（仅 Chromium）
- **自定义日程**：可改各阶段起止日期，改了之后 9 场考试时间会跟着整体平移
- 骨架屏、PWA 安装、键盘操作、读屏适配、`prefers-reduced-motion`

---

## 快速开始

### 环境要求

| 用途 | 需要什么 |
| --- | --- |
| **只是看页面** | 任意现代浏览器 |
| 本地预览（含 Service Worker / 离线） | Python 3 或任意静态服务器 |
| 跑测试 | Node.js |

**不需要** `npm install` —— 这个项目没有 `package.json`。

### 本地运行

```bash
# 在仓库根目录
python -m http.server 8080
```

然后打开：

- <http://localhost:8080/gaokao/> —— 实际页面
- <http://localhost:8080/gaokao/preview.html> —— 设计基准 demo（改动视觉时对照用）

> **不要用 `file://` 双击打开**来验收完整功能。
> 该协议属非安全上下文，Service Worker、离线缓存、PWA 安装在此环境下必然不可用。
> 页面核心功能仍能显示（代码有协议守卫），但请以 HTTP 环境为准。

### 跑测试

```bash
node tests/gaokao-time.test.mjs      # 冻结回归，24 项
```

---

## 目录结构

```
gaokao/
├── index.html          页面结构
├── style.css           样式、主题 token、响应式布局
├── time.js             时间基准、考试与阶段配置（纯逻辑，不碰 DOM）
├── lunar.js            农历与二十四节气（纯逻辑，不碰 DOM）
├── gaokao.js           渲染、交互、每秒更新
├── sw.js               Service Worker（离线缓存）
├── manifest.json       PWA 清单
├── data/
│   ├── holidays.json       节假日数据
│   └── solar-terms.json    二十四节气数据
├── preview.html        设计基准 demo（不参与运行时）
├── docs/               项目文档 ← 想深入了解从这里开始
├── README.md           你在读的这个文件
├── AGENTS.md           给 AI / 维护者的路由器
└── CHANGELOG.md        版本变更记录
```

三个 JS 文件的**加载顺序有依赖**：`time.js` → `lunar.js` → `gaokao.js`，不可颠倒。

---

## 文档索引

**`README.md`（本文）给人看，[`AGENTS.md`](AGENTS.md) 给 AI / 维护者看。**
深入的实现细节都在 [`docs/`](docs/README.md) 里。

| 我想知道…… | 读这个 |
| --- | --- |
| 有哪些功能、怎么跑起来 | 本文 |
| 项目定位、设计目标与取舍、已知限制 | [docs/overview.md](docs/overview.md) |
| 代码怎么分层、**为什么这样设计** | [docs/architecture.md](docs/architecture.md) |
| 某个函数/模块怎么实现的 | [docs/implementation.md](docs/implementation.md) |
| 某个功能具体怎么工作 | [docs/modules.md](docs/modules.md) |
| **界面设计规范**（配色、圆角、组件） | [docs/DESIGN.md](docs/DESIGN.md) |
| 数据文件格式、**每年怎么更新数据** | [docs/data.md](docs/data.md) |
| 怎么测试、验收标准 | [docs/testing.md](docs/testing.md) |
| **改视觉后怎么验收** | [docs/VISUAL-CHECK.md](docs/VISUAL-CHECK.md) |
| 怎么发布、缓存怎么工作 | [docs/deployment.md](docs/deployment.md) |
| 开发规范、改样式要注意什么 | [docs/development.md](docs/development.md) |
| **改了代码要同步改哪些文档** | [docs/MAINTENANCE.md](docs/MAINTENANCE.md) |
| 完整文档索引 | [docs/README.md](docs/README.md) |
| 版本演进历史 | [CHANGELOG.md](CHANGELOG.md) |

---

## 常见问题

### 控制台有一条 `unsupported MIME type ('text/plain')`

**本地预览时的正常现象，不是代码问题。**
`python -m http.server` 把 `.js` 当 `text/plain` 发送，导致 Service Worker 注册被拒。
GitHub Pages 会正确发送 `application/javascript`，线上不会有这条报错。

### 改了代码但浏览器还是旧的

Service Worker 缓存。`APP_VERSION` 是缓存名的一部分，
**改了代码要同时提升 `time.js` 里的 `APP_VERSION`**，否则用户可能继续执行旧缓存。

验证方式：DevTools → Application → Cache Storage，
应该只存在一个 `gaokao-cache-v<版本号>`。

### 倒计时不准 / 和手机系统时间不一致

页面依赖**设备本地时钟**，这是纯静态托管的固有限制。
本项目刻意不做服务端校时（会引入运行时依赖，而收益只覆盖「设备时间本身错误」这一少数场景）。

### 节假日数据是错的 / 明年怎么办

2026 年数据依国务院办公厅正式通知（国办发明电〔2025〕7 号）。
**官方尚未公布的年份会标「预估」**。每年 11 月前后公告发布后，
按 [docs/data.md](docs/data.md#四年度更新流程) 更新即可 ——
注意**两处都要改**（`time.js` 兜底表 + `data/holidays.json`），改完跑校验脚本。

### 节气为什么不显示具体时刻

三行小字里塞不下 `04:02`；而且官方未公布的年份没有权威时刻，
显示会造成「有的有、有的没有」的不一致。
**时刻仍然保留在无障碍标签里**供读屏使用。

### 浮动小窗按钮没反应

Document Picture-in-Picture 目前只有 Chromium 116+ 支持。
其他浏览器下按钮会隐藏或不可用。

### 全屏在 iOS 上能用吗

能用。优先调用 Fullscreen API，**不可用时退化为页面内的全屏覆盖层**，
所以 iOS Safari 也能正常全屏（不依赖它残缺的非视频元素全屏支持）。

### 手机上左边那栏空白很多

左栏只有总倒计时和下一个假期卡，长页面上下留白明显。
这是设计基准 `preview.html` 本身的比例，不是布局 bug。

---

## 浏览器支持

| 功能 | 支持情况 |
| --- | --- |
| 倒计时、阶段、选科、主题、日历、农历节气 | 所有现代浏览器 |
| Hero 大数字的自动字号 | 容器查询 `cqw`；不支持时回退到保守的 `vw` 系数 |
| 全屏模式 | 优先 Fullscreen API，不可用时退化为页面内覆盖层（iOS 可用） |
| 浮动小窗 | 仅 Chromium 116+ 的 Document Picture-in-Picture |
| Service Worker / 离线 / PWA 安装 | 需 http/https |
| 键盘操作、`prefers-reduced-motion` | 已适配 |

---

## 版权与致谢

个人项目，初版由 **AI Generated Content** 完成 ——
项目作者自述「没怎么写过前端，就直接用 AI 了说是」。

「露营」主题的视觉语言参考了《摇曳露营△》（ゆるキャン△）的配色与形状风格。

当前版本 **v2.5.2**，完整历史见 [CHANGELOG.md](CHANGELOG.md)。
