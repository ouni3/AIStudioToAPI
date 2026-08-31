# Plan: aistudio-to-api

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 规划高可用双容器与智能切号自愈路线图，确立算力路由中枢的演进与稳定性保障。
> - $L_{User}$: **+** 自动化健康检查、故障转移与配置管理，实现责任主体 $Manual_{IO} \to 0$。
> - $S_{total}$: **+** 规范 Phase 演进节奏与 Canary 门禁，消除无序修改导致的系统状态熵增。
> - $Value_{Delivered}$: **+** 护航稳定持续的 LLM API 算力供给，支持全系产品与开发任务快速迭代。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心 memory-bank 资产)

## 1. 项目愿景与目标 (Vision & Goals)
- **核心定位**: 构建具备多凭据轮询、403/404 智能容错降级与高并发自愈能力的 Google AI Studio 逆向 API 网关。
- **演进路线**:
  - Phase 1: 双容器架构重构、403/404 自愈机制、UI 体验升级与 Memory-Bank 建库。
  - Phase 2 (待规划): 智能加权路由、多节点负载均衡与生产级 Prometheus / Uptime 观测性集成。

---

## 2. 活跃 Phase 2 状态与施工记录

### 2.1 Phase 2 目标 (Model 404/503 Switch Loop & Empty Response Fault Tolerance)
- 修复模型名称错误被误判为 503 从而频繁切号卡死的缺陷，实现 `_isModelNotFoundError` 精准识别与非重试 404 直通。
- 修复模型空返回（空 Candidate / Safety 拦截 / 纯 Thinking 无正文）导致下游客户端 JSON 解析崩溃的问题，完善 OpenAI 与 Claude 流式/非流式响应转换保障。
- 补充单元测试与逻辑断言，确保全协议高可用。

### 2.2 双容器验证明细 (Dual-Container Verification)
- **8317 源码定制容器 (`aistudio-to-api`)**:
  - 宿主机物理路径: `/home/fy/aistudio-to-api/`
  - 镜像: `aistudio-to-api-custom:latest`（本地源码同步 + `ui/dist` 前端构建产物）
  - 端口映射: `192.168.0.104:8317 -> 7860/tcp`, `192.168.0.104:9998 -> 9998/tcp`
  - 挂载/源码: 内置 403 快速切号与 404 模型防空机制，挂载 `configs/auths/` 凭据
  - 验证状态: `Up (healthy)`, `HTTP 200 OK`，通过 `/v1/chat/completions` (OpenAI 协议) 及 `/v1/messages` (Claude 协议) 流式与非流式推理验证。
- **8318 稳定镜像容器 (`aistudio-to-api-8318`)**:
  - 宿主机物理路径: `/home/fy/aistudio-to-api-8318/`
  - 镜像: `ibuhub/aistudio-to-api:latest`（社区原生官方镜像，基准回退节点）
  - 端口映射: `192.168.0.104:8318 -> 7860/tcp`
  - 验证状态: `Up (healthy)`, `HTTP 200 OK`，通过 `/v1/chat/completions` 标准推理验证。

---

## 3. 近期 15 轮 Git 提交分类汇总

| 类别 | 提交范围/特性 | 核心改动说明 |
|:---|:---|:---|
| **自愈与容错** | 403 即时换号自愈 | 捕获上游 403 `Region not supported` / `PERMISSION_DENIED` 立即切号重试 |
| **自愈与容错** | 404 畸形路径清洗 | 严格校验模型名非空，杜绝 `/v1beta/models/:streamGenerateContent` 畸形路径 |
| **自愈与容错** | 并行请求平滑排空 | 切号前强制 `waitForAuthQueuesToDrain`，等待并发在途请求 100% 传输完成 |
| **自愈与容错** | 页面错误识别优化 | 精准判定 `Page not found` + `Go to Build`，消除对 Google 普通 Toast 的误杀 |
| **网络与代理** | 黏性代理隔离 | 解决多账号网络请求中的代理串流与连接污染，隔离 Session 代理上下文 |
| **网络与代理** | 代理死锁优化 | 修复高并发/断流场景下连接池挂起与代理死锁问题，加入自愈超时熔断 |
| **UI 与交互** | 日期过滤与持久化 | Web 控制台日志与账单增加精准日期范围筛选，并支持 LocalStorage 持久化 |
| **UI 与交互** | Dist 构建集成 | 将前端构建产物集成至服务静态托管目录，修复热更新与静态路径偏差 |
| **系统规范** | 架构与记忆建库 | 完善 memory-bank 结构，沉淀系统模式、资产台账与演进度量 |

---

## 4. 任务清单 (Tasks)
- [x] 104 服务器双容器拓扑部署与端口打通 (8317 / 8318)
- [x] 403 区域受限与 404 畸形模型名自愈逻辑落地
- [x] 黏性代理与死锁优化
- [x] 前端 UI 日期筛选与持久化支持
- [x] 8317 容器浏览器连接卡死排查与重启恢复
- [x] 并发在途请求排空切号与 Google 页面错误误杀修复 (`438d776`)
- [x] 双容器 API 推理接口 200 OK 实测闭环
- [x] Memory-Bank 核心资产建库与更新 (productContext / systemPatterns / plan / profit / assets / aes-history / mermaid)
- [x] 修复模型名错误触发 503 频繁切号卡死问题 (`RequestHandler.js`)
- [x] 修复模型空返回 / Safety 过滤 / Thinking-only 导致下游自动化中断问题 (`FormatConverter.js`)
- [x] 补充单测与自动化验证 (`tests/test_request_handler_validation.mjs`, `tests/test_format_converter_validation.mjs`)
- [x] 全局标准化改造：新增 `scripts/dev/` 启动/停止/健康检查运维三件套脚本并配置 `package.json` 标准化 `npm test` 入口
- [x] 项目定级晋升为 SR 级别 (Super Rare - 系统枢纽级)，注入 Yuuka 评分模型与定级契约断言 (得分 95.60)
- [x] 前端统计筛选自定义时间范围收敛为固定最近 15:00 至次日 15:00 跨日区间与 104 部署物同步验证

---

## 5. 多 Phase 并行登记 (Multi-Phase Registry)
- Primary Phase: `Phase 2 (Model 404/503 Switch Loop & Empty Response Fault Tolerance)` [ACTIVE]
- Secondary Phases: 无

---

## 6. Canary 锚点 (Rule Section Canary & Audit Gate)
- `AUDIT_QUORUM_EXHAUSTED` `CHAIRMAN_ESCALATION_REQUIRED` `N_max` `LEGISLATIVE_MANUAL_OVERRIDE` `Phase 218` `Phase 22` `Phase 226` `[a-f0-9]{32}` `verify_git_gate.py`
