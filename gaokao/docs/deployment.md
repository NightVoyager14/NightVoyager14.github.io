# 部署

## 方式

**推送到 `main` 分支即发布。** GitHub Pages 会自动构建并部署，
仓库根的 `.nojekyll` 已关闭 Jekyll 处理。

```bash
git add -A
git commit -m "type(gaokao): 描述"
git push origin main        # 发布
```

### 打版本 tag

发布一个版本时同步打 tag（与既有 `v2.0.2` 同为 annotated）：

```bash
git tag -a v2.5.2 -m "v2.5.2 — 简要说明"
git push origin v2.5.2
```

**tag 名应与 `time.js` 的 `APP_VERSION` 一致**（`2.5.2` → `v2.5.2`）。

---

## 版本号只有一处来源

```
time.js 的 APP_VERSION
    ├──→ 页脚 #versionLabel          （gaokao.js 启动时写入）
    └──→ Service Worker 缓存名        （注册时作为 ?v= 查询串传给 sw.js）
```

**改版本只需改 `time.js` 一行。** 但发布时还要保证以下位置一致，否则会出现
「首屏骨架期显示旧版本号」或「文档与代码不符」：

| 位置 | 说明 |
| --- | --- |
| `time.js` 的 `APP_VERSION` | **权威来源** |
| `index.html` 的 `<span id="versionLabel">` | 首屏占位，运行时被覆盖 |
| `README.md` 的「当前版本」 | 文档 |
| `CHANGELOG.md` 顶部最新条目 | 变更记录 |

发布前用一条命令核对四处：

```bash
node -e "const s=require('fs').readFileSync('gaokao/time.js','utf8');console.log(s.match(/APP_VERSION = '([^']+)'/)[1])"
grep -o 'id="versionLabel">[^<]*' gaokao/index.html
grep -o '当前版本 \*\*v[0-9.]*\*\*' gaokao/README.md
grep -m1 -o '^## \[[0-9.]*\]' gaokao/CHANGELOG.md
```

---

## Service Worker 缓存

| 项 | 值 |
| --- | --- |
| 缓存名前缀 | `gaokao-cache-` |
| 完整缓存名 | `gaokao-cache-<APP_VERSION>`，如 `gaokao-cache-2.5.2` |
| 缓存资源 | `./`、`index.html`、`style.css`、`time.js`、`lunar.js`、`gaokao.js`、`manifest.json`、`data/holidays.json`、`data/solar-terms.json` |
| HTML / JS / JSON | **网络优先**（改代码能立即生效） |
| 其他静态资源 | 缓存优先 |
| `activate` 行为 | 删除同前缀的旧缓存，只保留当前版本 |

### 新增资源必须加进 `ASSETS`

`sw.js` 的 `ASSETS` 是一个**手工维护的清单**。
新增任何需要离线可用的文件（JS / JSON / 图片）都必须加进去，否则离线时拿不到。

> 例：新增 `lunar.js` 与 `data/solar-terms.json` 时都已同步加入。

### 发布后验证缓存

DevTools → Application → Cache Storage，**应只存在一个** `gaokao-cache-v<APP_VERSION>`。

> **曾经的坑**：缓存名固定为 `gaokao-cache-v1`，且对 `.js` 采用缓存优先，
> 导致部署新版本后用户可能长期执行旧脚本。
> 现在缓存名带版本号 + HTML/JS 网络优先，已解决。

---

## 发布后线上验证

### 1. 静态资源可达性与 MIME

```bash
curl -sI https://www.nightvoyager.online/gaokao/lunar.js | grep -i content-type
# 期望：application/javascript
```

必须确认 `.js` 返回 `application/javascript`、`.json` 返回 `application/json`。
若返回 `text/plain`，Service Worker 无法注册。

### 2. 版本号

```bash
curl -s https://www.nightvoyager.online/gaokao/ | grep -o 'id="versionLabel">[^<]*'
curl -s https://www.nightvoyager.online/gaokao/time.js | grep -o "APP_VERSION = '[^']*'"
```

### 3. 浏览器烟测

用 Playwright 或手动检查：

| 检查 | 期望 |
| --- | --- |
| 页面版本号 | 与 `APP_VERSION` 一致 |
| 阶段 tab / 考试卡 | 5 / 9 |
| 日历格 | 当月格数（如 35），农历标签可见 |
| 节假日 / 节气条数 | 70 / 50（或按当年实际） |
| 横向溢出 | `scrollWidth - clientWidth === 0` |
| 控制台真实报错 | 0 |
| 交互 | 选科淡化生效；假期弹窗可开可关；主题菜单可切 |

### 4. 线上不应出现 `unsupported MIME` 报错

本地 `python -m http.server` 会产生这条报错（它把 `.js` 当 `text/plain`）。
**线上若也出现，说明部署异常**，需要检查 Pages 的 MIME 处理。

---

## 本地预览

```bash
cd ..                      # 到仓库根目录
python -m http.server 8080
# 打开 http://localhost:8080/gaokao/
```

**不要用 `file://` 双击打开**来验证完整功能：该协议属非安全上下文，
Service Worker、离线缓存、`manifest.json` 安装提示在此环境下**必然不可用**。
代码已针对 `file://` 做了协议守卫（跳过注册并给出 `console.info`），
页面核心功能仍可正常显示，但请以 HTTP 环境为准做验收。

---

## 发布前检查清单

- [ ] 语法检查通过（`time.js` / `lunar.js` / `gaokao.js` / `sw.js`）
- [ ] 冻结回归 **24 / 24**（`node tests/gaokao-time.test.mjs`）
- [ ] 数据一致性（`holiday_check.py` / `solar_check.py` 均 `完全一致 = True`）
- [ ] 浏览器探针全绿（id 完整性 / 溢出矩阵 / 吸附 / 农历）
- [ ] 版本号四处一致
- [ ] 新增资源已加入 `sw.js` 的 `ASSETS`
- [ ] **文档已同步**：按 [MAINTENANCE.md](MAINTENANCE.md) 核对变更类型对应的文件与数值
- [ ] `CHANGELOG.md` 已写本次变更
- [ ] 提交信息符合 `type(gaokao): 描述` 格式
- [ ] 打 tag 并推送

---

## 相关文档

- 测试方法 → [testing.md](testing.md)
- 数据更新 → [data.md](data.md#四年度更新流程)
- 开发规范 → [development.md](development.md)
