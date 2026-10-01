# NightVoyager 的个人站点

GitHub Pages 静态站点，无构建步骤、无运行时依赖，clone 下来即可修改并直接发布。

## 目录结构

```
/
├── index.html        个人主页（含小工具入口）
├── 404.html          自定义 404 页
├── CNAME             自定义域名 www.nightvoyager.online
├── favicon.ico       多尺寸图标
├── robots.txt
├── sitemap.xml
├── .nojekyll         关闭 GitHub Pages 的 Jekyll 处理（纯静态直发）
├── gaokao/           高考倒计时应用
│   ├── index.html    页面结构
│   ├── style.css     样式
│   ├── time.js       时间基准、配置与纯函数（单一数据源）
│   ├── gaokao.js     渲染与交互
│   ├── manifest.json PWA 清单
│   ├── sw.js         Service Worker
│   └── CHANGELOG.md
└── tests/            零依赖回归测试
```

## 高考倒计时

四川 3+1+2 新高考倒计时与阶段日程：

- **分层倒计时**：高考总倒计时 → 当前/下一场考试进程 → 各科逐场倒计时
- **五阶段预报**：零诊 / 一诊 / 二诊 / 三诊 / 高考，可切换查看，状态徽章随时间自动翻转
- **选科标记**：首选（历史/物理，互斥）+ 再选（化学/地理/思想政治/生物学，限 2 科），自动高亮或淡化相关科目
- **全屏模式**：考试进度条、下一场提醒、已完成/剩余统计
- **浮动小窗**：基于 Document Picture-in-Picture API
- **自定义日程**：可修改各阶段起止日期，保存到 localStorage
- **深色模式**、骨架屏、PWA 安装支持

访问：<https://www.nightvoyager.online/gaokao/>

## 关键实现约定

修改代码前请先了解以下几条，它们是这个项目最容易踩坑的地方：

1. **时间一律以北京时间（UTC+8）为基准。**
   所有日期用 `time.js` 的 `bjDate(year, month, day, h, m)` 构造，**不要**直接写
   `new Date(...)`——后者按浏览器本地时区解释，会让非 UTC+8 的用户看到偏移 8 小时的倒计时。
   日期文案用 `fmtCnFull` / `fmtCnMonthDay`。

2. **高考日期只有一处来源。**
   `time.js` 的 `exams` 数组只配「日 + 时 + 分」，年份由 `GAOKAO_YEAR` 补齐；
   `PHASE_CONFIG.final` 的默认日期由同一年推导。每年的 6/10 11:00 之后 `GAOKAO_YEAR`
   自动推进到下一年，**不需要手工改年份**。

3. **用户在设置里改高考日期时，9 场科目时间会跟随起始日整体平移**
   （`computeExamDates()` 按北京时间日历天平移）。因此改完设置必须调用
   `refreshPhaseUI()` 重算 `examDates`。

4. **版本号只有一处来源：`time.js` 的 `APP_VERSION`。**
   页脚由它填充；`gaokao.js` 注册 Service Worker 时把它作为查询串传给 `sw.js`，
   `sw.js` 用它作为缓存名的一部分。**改了代码记得提升 `APP_VERSION`**，
   否则用户可能继续用旧缓存中的脚本。

5. **localStorage 中的用户数据必须容错。**
   损坏的 JSON 或字段不合法时回退到默认值并 `console.warn`，不能白屏
   （见 `isSaneOverride`）。

### 依赖设备本地时间

这是一个纯静态站点，没有服务端校时。倒计时依据访客设备的系统时钟计算，
用户手动修改系统时间即可改变显示结果——这是静态托管的固有限制，非缺陷。

## 开发与测试

无依赖，无需 `npm install`。

```bash
# 语法检查
node --check gaokao/time.js
node --check gaokao/gaokao.js

# 回归测试（24 项：时间基准、跨年滚动、阶段顺序、覆盖校验、选科相关性）
node tests/gaokao-time.test.mjs
```

> 也可以 `node --test tests/`。若该命令在受限环境下报 `spawn EPERM`
> （子进程管道被沙箱拦截），改用上面直接运行测试文件的方式，效果相同。

本地预览（Service Worker 需要 HTTP 环境，`file://` 下不工作）：

```bash
python -m http.server 8080
# 然后访问 http://localhost:8080/gaokao/
```

## 部署

推送到 `main` 分支即可，GitHub Pages 会直接发布（`.nojekyll` 已关闭 Jekyll 处理）。

## 未来计划

等有时间了想写个个人博客。
