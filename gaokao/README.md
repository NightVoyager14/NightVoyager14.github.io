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
- 深色模式、骨架屏、PWA 安装支持

## 文件构成

| 文件 | 作用 |
|---|---|
| `index.html` | 页面结构与无障碍语义（样式与逻辑均已外置） |
| `style.css` | 全部样式与主题变量（浅色/深色） |
| `time.js` | 时间基准、考试与阶段配置、纯函数 —— **不碰 DOM** |
| `gaokao.js` | DOM 渲染、事件绑定、每秒更新循环 |
| `manifest.json` | PWA 清单（图标为内联 data-URI SVG） |
| `sw.js` | Service Worker（缓存版本化 + 网络优先） |
| `CHANGELOG.md` | 版本变更记录 |

引入顺序有依赖：`time.js` 必须先于 `gaokao.js` 加载。

## 关键实现约定

修改代码前请先了解以下几条，它们是这个项目最容易踩坑的地方。

### 1. 时间一律以北京时间（UTC+8）为基准

所有日期用 `time.js` 的 `bjDate(year, month, day, h, m)` 构造，**不要**直接写
`new Date(...)` —— 后者按浏览器本地时区解释，会让非 UTC+8 的用户看到偏移 8 小时的倒计时。
日期文案用 `fmtCnFull` / `fmtCnMonthDay`（内部已固定 `Asia/Shanghai`）。

```js
bjDate(2027, 6, 7, 9, 0).toISOString();   // '2027-06-07T01:00:00.000Z' ← 北京 09:00
```

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

```bash
# 语法检查
node --check time.js
node --check gaokao.js
node --check sw.js

# 回归测试（24 项：时间基准、跨年滚动、阶段顺序、覆盖校验、选科相关性）
node tests/gaokao-time.test.mjs
```

测试位于仓库根目录的 `tests/`。也可以 `node --test tests/`；若该命令在受限环境下
报 `spawn EPERM`（子进程管道被沙箱拦截），改用上面直接运行测试文件的方式，效果相同。

### 本地预览

```bash
cd ..                      # 到仓库根目录
python -m http.server 8080
# 打开 http://localhost:8080/gaokao/
```

**不要用 `file://` 双击打开**来验证完整功能：该协议属非安全上下文，
Service Worker、离线缓存、`manifest.json` 安装提示在此环境下**必然不可用**。
代码已针对 `file://` 做了协议守卫（跳过注册并给出 `console.info`），
页面核心倒计时功能仍可正常显示，但请以 HTTP 环境为准做验收。

## 部署

推送到 `main` 分支即可，GitHub Pages 直接发布（仓库根的 `.nojekyll` 已关闭 Jekyll 处理）。
发布后如需验证缓存更新：DevTools → Application → Cache Storage，
应只存在一个 `gaokao-cache-v<APP_VERSION>`。

## 浏览器支持

| 功能 | 支持情况 |
|---|---|
| 倒计时、阶段、选科、深色模式 | 所有现代浏览器 |
| 全屏模式 | 依赖 Fullscreen API；iOS Safari 对非视频元素支持残缺 |
| 浮动小窗 | 仅 Chromium 116+ 的 Document Picture-in-Picture |
| Service Worker / 离线 / 安装 | 需 http/https |
| 键盘操作、`prefers-reduced-motion` | 已适配 |

## 历史

见 [CHANGELOG.md](./CHANGELOG.md)。当前版本 **v2.0.3**。

初版使用 **AI Generated Content** 完成，项目作者自述「没怎么写过前端，就直接用 AI 了说是」。
