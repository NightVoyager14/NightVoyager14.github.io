# 文档索引

`gaokao/` 目录下的全部文档，按用途分组。**新读者建议按顺序读前四篇。**

---

## 面向使用者

| 文档 | 内容 |
| --- | --- |
| [../README.md](../README.md) | 项目简介、功能特性、快速开始、目录结构、常见问题。<br>**入口文档**，不涉及实现细节。 |

## 面向维护者 / 贡献者

| 文档 | 内容 |
| --- | --- |
| [overview.md](overview.md) | 项目定位、设计目标与取舍、浏览器支持、边界与已知限制 |
| [architecture.md](architecture.md) | 文件分层、数据流、目录结构、关键设计决策（含「为什么这样做」） |
| [implementation.md](implementation.md) | 逐模块实现说明：核心函数、数据结构、状态机、DOM 契约 |
| [modules.md](modules.md) | 功能模块详解：倒计时、阶段、选科、节假日、日历、农历节气、主题、全屏、小窗 |
| [DESIGN.md](DESIGN.md) | **界面设计语言**：token 契约、形状与材质规则、组件规格、设计坑 |
| [data.md](data.md) | 数据文件格式、双副本策略、年度更新流程、校验脚本 |
| [testing.md](testing.md) | 三层验证体系、验收标准、历次真实缺陷一览 |
| [VISUAL-CHECK.md](VISUAL-CHECK.md) | **视觉验收协议**：可复现的验证步骤、产物、判定标准与失败回退 |
| [deployment.md](deployment.md) | 发布方式、Service Worker 缓存、版本号单一来源、线上验证 |
| [development.md](development.md) | 开发规范、CSS 权重约定、风险登记、项目不做的事、禁改清单 |
| [MAINTENANCE.md](MAINTENANCE.md) | **改什么要同步改哪里**：变更类型 → 必需同步的文件；需保持一致的数值清单 |

## 面向 AI 协作者

| 文档 | 内容 |
| --- | --- |
| [../AGENTS.md](../AGENTS.md) | **路由器**：核心约束 + 每条约束的验证方式 + 文档索引。<br>不含实现细节，细节在 docs 里。 |

## 历史记录

| 文档 | 内容 |
| --- | --- |
| [../CHANGELOG.md](../CHANGELOG.md) | 逐版本变更记录（含 2.1.0 → 2.5.2 的完整演进、各轮补丁与实测结果） |

---

## 阅读路径建议

按你要做的事选：

| 我要…… | 读这些 |
| --- | --- |
| 第一次接触这个项目 | [../README.md](../README.md) → [overview.md](overview.md) → [architecture.md](architecture.md) |
| 改倒计时 / 时间逻辑 | [implementation.md](implementation.md)（时间基准）→ [testing.md](testing.md)（冻结回归） |
| **改视觉 / 主题** | [DESIGN.md](DESIGN.md) → [development.md](development.md#css-权重约定) → [VISUAL-CHECK.md](VISUAL-CHECK.md) |
| 改某个功能的交互 | [modules.md](modules.md) → [implementation.md](implementation.md) |
| **更新节假日 / 节气数据** | [data.md](data.md#四年度更新流程) → 改完按 [testing.md](testing.md) 校验 |
| 发布新版本 | [deployment.md](deployment.md) |
| 排查一个 bug | [testing.md](testing.md#历次真实缺陷一览)（先看是否已踩过）→ [architecture.md](architecture.md) |
| **改完代码，怕漏改文档** | [MAINTENANCE.md](MAINTENANCE.md) |
