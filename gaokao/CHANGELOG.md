# Changelog

## [2.0.3] - 2026-07-09

以「修复会随时间失效的逻辑」和「可访问性」为主，**不改变页面外观**（除主题按钮文案）。

### 🐛 修复

- **阶段日期跨年错乱（严重）**：`PHASE_CONFIG.final` 原本硬编码 2027 年，而总倒计时的年份
  由 `GAOKAO_YEAR` 动态推导。2027-06-10 11:00 之后会出现「页头显示 2028 届、总倒计时说
  距 2028 年高考还有、阶段导航却说高考已结束」的自相矛盾。现改为由 `GAOKAO_YEAR` 推导，
  每年自动滚动。
- **设置里修改「高考」日期无效**：各科日程原本只读硬编码常量，与设置解耦。现统一为单一数据源，
  修改高考起始日后 9 场科目时间按北京时间日历天整体平移。
- **Service Worker 缓存永不失效**：原缓存名固定为 `gaokao-cache-v1`，且对 `.js` 采用
  「缓存优先」，导致部署新版本后用户可能长期执行旧脚本。现改为缓存名带版本号，
  HTML/JS/JSON 一律「网络优先」，并提供「有新版本可用」提示条。
- **以 file:// 直接打开时控制台报错**：`file://` 属非安全上下文，`serviceWorker.register()`
  必然失败（此前只在 `.catch` 里吞掉异常，仍会留下红色报错）。现先判断协议，
  非 http/https 直接跳过注册并给出 `console.info` 提示，不再产生错误。
  同时 `navigator.serviceWorker` 的读取也包进 try/catch（部分浏览器在 file:// 下读取即抛错）。
- **Hero「进行中」脉冲动画永不触发**：`ongoing` 类只在一个运行时不可达的分支中被添加
  （属死代码），且进入进行中后不会被移除。现统一在 `updatePhaseHero` 中开关。
- **「恢复默认」按钮需再点一次保存**：`resetSettings` 未刷新界面。现直接绑定并立即生效。
- **本地时区导致倒计时偏移**：所有日期原按浏览器本地时区构造，非 UTC+8 用户偏差 8 小时。
  现统一以北京时间（UTC+8）为基准，日期文案也按 `Asia/Shanghai` 格式化。
- **日历跨月/导航缺陷**：`goMonth` 的 if/else 链改为自然月运算；日期格比较统一补零，
  不再依赖「数字不补零」的巧合；超出再选上限的提示色改用 CSS 变量（原为写死的 `#dc3545`，
  深色主题下不一致）。
- **潜在崩溃点**：`getPhaseDates` 现校验覆盖数据（字段名、范围、起止顺序），
  损坏的 localStorage 只会回退默认值并给出警告，不再产生 `Invalid Date` 或白屏。

### ♿ 可访问性

- 新增 `prefers-reduced-motion` 支持，系统开启「减少动态效果」后不再播放循环动画。
- 新增 `:focus-visible` 焦点样式，键盘导航可见。
- 选科项由 `<span>` 改为真正的 `<button>`，可键盘操作，并带 `aria-pressed`。
- 设置弹窗与全屏层补齐 `role="dialog"` / `aria-modal`，并实现焦点陷阱与关闭后焦点归还。
- 自定义日历支持键盘操作：`Enter` / `Space` / `方向键` 打开，`方向键` 选日，`Esc` 关闭。
- 阶段导航与选科按钮同步 `aria-pressed`；倒计时加 `role="timer"`，并提供每分钟更新一次的
  读屏播报节点，避免每秒播报。
- 骨架屏标记为 `aria-hidden`。

### 📱 移动端适配
- 底部操作栏、全屏层、页面内边距支持 `env(safe-area-inset-*)`，避免被 iPhone 指示条遮挡。
- 全屏层使用 `100dvh`，避免移动端地址栏伸缩时露底。
- 补充大屏（≥900px）与超小屏（≤380px）断点。

### ⚡ 性能

- `favicon.ico` 由单张 256×256（270 KB）改为多尺寸（113 KB，−58%）。
- 引入 `Intl.DateTimeFormat` 实例缓存，不再每秒重复构造格式化器。
- DOM 写入前先比较内容，减少每帧无谓重排。
- 全屏刷新并入主 `requestAnimationFrame` 循环，移除一个常驻 `setInterval`。

### 📦 工程与结构

- **拆分文件**：内联的 1660 行 CSS 移入 `gaokao/style.css`；时间常量与纯函数移入
  `gaokao/time.js`（`index.html` 由 67 KB 降至 13 KB）。
- **版本号单一来源**：`time.js` 的 `APP_VERSION` 同时驱动页脚与 SW 缓存版本。
- 新增 `tests/gaokao-time.test.mjs`：24 项零依赖回归测试（`node tests/gaokao-time.test.mjs`）。
- 根目录新增 `404.html`、`robots.txt`、`sitemap.xml`、`.nojekyll`。
- 修正根 `index.html` 未闭合的 `<dl>` / `<nav>`、非法的 `</br>`，并更新过期的入口名称。
- 补齐 `canonical` 与 Open Graph 元信息；`README.md` 补充项目关键约定。

### 📌 兼容性

- 未引入任何运行时依赖，仍为纯静态、零构建部署。
- `gaokao/index.html` 的对外 URL 与 `manifest.json` 的 `start_url` 保持不变。
- 旧版 `localStorage` 数据（`gaokao_phase_settings`、`gaokao_subjects`、`gaokao_theme`）
  格式未变，用户设置可平滑沿用。

---

## [2.0.2] - 2026-07-09

### 📦 项目结构重构
- **文件整理**：将高考倒计时所有文件迁移至 `gaokao/` 子文件夹
- **入口更名**：`gaokao_schedule.html` → `gaokao/index.html`（GitHub Pages 兼容）
- **根目录精简**：根目录仅保留个人主页 `index.html`、CNAME、README 等

### 🔧 路径更新
- `gaokao/manifest.json` — `start_url` 改为 `./index.html`
- `gaokao/sw.js` — 缓存路径更新为 `./index.html`
- `index.html` — 链接从 `gaokao_schedule.html` 改为 `gaokao/`

### 📁 最终目录结构
```
/
├── index.html      ← 个人主页
├── CNAME           ← 自定义域名
├── README.md
├── CHANGELOG.md
└── gaokao/         ← 高考倒计时应用
    ├── index.html  ← 入口
    ├── gaokao.js   ← 逻辑
    ├── manifest.json
    └── sw.js
```

---

## [2.0.1] - 2026-07-09

### 🎨 改进
- **阶段详情显示全名**：进入阶段详情后显示完整名称（如"第一次诊断性考试"代替"一诊"）
- **届数徽章**：标题下方年份徽章固定显示"2027届"（当前考生所属届），不再随选中阶段变化
- **滚动条美化**：全局滚动条采用纤细暖色设计，与页面风格统一
- **自定义日期选择器**：替换原生 `<input type="date">` 为暖色调日历弹窗组件，支持月份导航、今日高亮、选中高亮
- **代码拆分**：JavaScript 移入独立文件 `gaokao.js`，HTML 结构更清晰；同步更新 `sw.js` 缓存策略

### 🔧 修复
- 日历导航 `goMonth` 函数跨月时年份计算错误（2026年7月→上一月应为2026年6月而非2025年6月）

### 📁 修改文件
- `gaokao_schedule.html` — 移除内联 JS，引用外部 `gaokao.js`；新增日历弹窗 HTML；更新徽章文本
- `gaokao.js` — **新建**，包含全部 JavaScript 逻辑（约 1450 行）
- `sw.js` — 新增 `gaokao.js` 到缓存资源列表
- `CHANGELOG.md` — 更新

---

## [2.0.0] - 2026-07-09

### 🎉 新增
- **阶段导航系统**：新增零诊、一诊、二诊、三诊、高考五个考试阶段的 Tab 导航，支持随时切换查看
- **阶段详情页**：为非高考阶段显示专属倒计时、日期范围、状态徽章（即将开始/进行中/已完成）
- **自定义设置弹窗**：用户可自定义各阶段考试的起止日期，支持保存至 localStorage 持久化
- **全屏阶段感知**：全屏模式根据当前选中阶段显示不同内容（高考显示详细日程，其他阶段显示大倒计时）
- **版本标识**：页面底部显示版本号

### 🔧 变更
- **Hero 倒计时**：现在根据选中的考试阶段动态显示目标（如"距 一诊 还有"）
- **页面架构重构**：引入阶段数据模型（`PHASE_CONFIG`），为后续扩展奠定基础
- **高考内容隔离**：将高考专属内容（当前考试、选科标记、日程表）封装在 `gaokaoContent` 容器中

### 📁 修改文件
- `gaokao_schedule.html` — 核心修改，约 +500 行代码
  - CSS：新增阶段导航、阶段详情、设置弹窗样式（约 200 行）
  - HTML：新增阶段导航、阶段详情、设置弹窗结构
  - JavaScript：新增阶段管理模块（配置、状态、导航、设置、全屏适配）
  - 修改 `updateAll` 和 `updateFullscreen` 支持阶段感知
- `CHANGELOG.md` — 新建

### 📌 影响范围
- ✅ 所有现有高考功能保持正常
- ✅ 选科标记系统不受影响
- ✅ PWA / PiP / 深色模式 / 骨架屏 均兼容
- ✅ 设置数据与主题设置数据隔离（不同 localStorage key）

---

## [1.0.0] - 2026-07-?? (Previous Release)

### ✨ 功能
- 四川 3+1+2 新高考倒计时（语文、数学、外语、历史/物理、化学、地理、思想政治、生物学、藏语文/彝语文）
- 选科标记（首选 历史/物理，再选 化学/地理/思想政治/生物学）
- 全屏模式（支持考试进度条、下一场提醒）
- 深色/浅色主题切换
- 浮动小窗（Picture-in-Picture）
- PWA 支持（manifest.json + Service Worker）
- 骨架屏加载动画
- 性能优化（requestAnimationFrame + DOM 缓存）
