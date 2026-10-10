# System Patterns: aistudio-to-api

> **[EVOLUTION_CONTRIBUTION]** (Phase 2 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 确立反向代理中枢、多凭据故障转移与 104 双容器架构模式，最大化 Gemini 算力利用率与可用性。
> - $L_{User}$: **+** 统一 API 协议转换、模型参数自适应与智能重试，实现免人工干预的 7x24 高可用代理服务。
> - $S_{total}$: **+** 清晰分层请求处理、凭据管理与协议转换，杜绝 403/404 异常扩散，降低系统状态熵。
> - $Value_{Delivered}$: **+** 为上层 Agent 与开发工具提供高弹性、低延迟的稳定 LLM 推理网关。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心 memory-bank 资产)

- **Baseline Marker**: `BASELINE_PHASE_12` (Phase 12 核心架构基线已对齐)

## 0. 资产定级标定 (Rating & Asset Profile)
- **项目等级**: **SR (Super Rare - 系统枢纽级)**
- **系统定位**: 全系开发与生产环境之核心 LLM 逆向 API 网关与算力中继中枢
- **自托管与自愈协议**: 满足 100% 自托管自愈 (403 区域风控即时切号 + 404 模型防空 + 429 降频轮换 + 在途请求排空)，$L_{User\_rate} \le 0.05$

## 1. 架构总览 (Architecture Overview)

本项目采用模块化 Express + WebSocket 服务架构，整体分为四大核心子系统：

```
+-------------------------------------------------------------------------+
|                              Client Layer                               |
|        OpenAI SDK / Claude SDK / Third-party Tools / Moe Agents         |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                           API Gateway Layer                             |
|  - /v1/chat/completions (OpenAI Compatible)                             |
|  - /v1/messages (Claude Compatible)                                     |
|  - /v1/models (Model Discovery & Capabilities)                          |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                       Request Hub & Orchestration                       |
|  - RequestHandler: 路由分发、流式/非流式响应转换、异常捕获              |
|  - FormatConverter: OpenAI/Claude <-> Google Gemini 请求与响应格式双向映射 |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                  Credential Pool & Failover Manager                     |
|  - Account Pool: 多 Google AI Studio 账号/Cookie 凭据轮询与健康状态检测   |
|  - Failover State Machine: 403 区域受限 / 429 速率限制立即切号重试机制  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                         Upstream Google API                             |
|               Google AI Studio (Gemini-1.5 / 2.0 / 2.5)                 |
+-------------------------------------------------------------------------+
```

## 2. 核心设计模式 (Core Patterns)

### 2.1 协议转换适配器模式 (Protocol Adapter Pattern)
- **FormatConverter**: 负责将标准 OpenAI Completion / Claude Messages 结构转换为 Google AI Studio 原生 `generateContent` / `streamGenerateContent` 载荷。
- **前置路径与模型断言**: 强校验模型标识合法性，过滤前后缀空白与非法字符，严格杜绝模型名为空时拼接出 `/v1beta/models/:streamGenerateContent` 畸形 404 URL。
- **Thinking-Only 兜底注入无害 Kilocode 操作 (Phase 7)**: 当上游模型仅生成 `thought`/`reasoning` 过程而无正文文本回复或原生工具调用时，系统在流式与非流式中自动注入标准的无害 `glob` 工具调用（`name: "glob"`, `arguments: {"pattern":"*"}`），并将结束原因置为 `tool_calls` (OpenAI) / `tool_use` (Claude)，彻底阻断下游 Kilocode 客户端因空文本或无 tool_call 引发的进程崩溃与未捕获中断。

### 2.2 凭据轮询与故障转移状态机 (Failover State Machine)
- **Account State Tracking**: 动态维护凭据健康状态（`HEALTHY`, `COOLING_DOWN`, `REGION_BLOCKED`, `RATE_LIMITED`）。
- **并行请求平滑排空机制 (In-Flight Request Drain Gate)**:
  - 无论自动触发还是手动切换账号，强制调用 `ConnectionRegistry.waitForAuthQueuesToDrain(authIndex)`。
  - 严格等待当前账号的每一个并发在途 WebSocket 请求 100% 流式传输完毕并关闭后，才正式执行切号与清理旧 Context，杜绝并发请求被腰斩。
- **即时切号重试与页面错误精准感知 (Fast Failover & Page Error Detection)**:
  - **扩充即时切号契约**: `immediateSwitchStatusCodes` 囊括 403 区域受限 (`Region not supported` / `PERMISSION_DENIED`)、404 (含 Google Ambiguous Service)、429 速率限制，以及上游服务端异常 500、502、503、504。遇此错误立即标记当前凭据异常并切至下一健康凭据重放，杜绝盲目重试导致客户端长时间阻塞。
  - **切号全局防抖与账号惩罚冷却 (Anti-Thrashing Guard)**: 引入 5 秒全局切换防抖 (`minSwitchIntervalMs: 5000`) 与 60 秒故障账号冷却惩罚 (`accountCooldownMap`)，当发生异常切号时降权故障账号，优先轮询未受限账号；同时在 `handleRequestFailureAndSwitch` 与 `RequestHandler` 中对 400 客户端参数错误实施阻断拦截，杜绝全池账号高速轮转雪崩。
  - **下游 503 弹性降级映射契约**: 在 OpenAI 与 Claude 流式/非流式出口，对上游返回的生成式 404/403 错误，在多轮换号重试耗尽后优雅映射为 503 Service Unavailable，支持下游客户端平滑重试，杜绝客户端直接中断。
  - 精准识别页面硬路由崩溃特征（如 `Page not found` + `Go to Build`），避免将 Google 偶发非阻塞 Toast 提示（如 `Please try again`）误判为致命错误。
  - 设定最大重试轮次（Max Retry Quorum），保障请求不陷入死循环，并在全部凭据耗尽时规范返回标准上游错误。

- **账号手动启用/停用与调度池物理隔离机制 (Phase 12)**:
  - 在 `AuthSource` 中引入 `disabledIndices` 状态追踪，`_buildRotationIndices()` 自动将 `disabled === true` 的账号物理排除在可用轮询池与故障转移（Failover）池之外。
  - `updateAccountStatus(index, { disabled })` 实现配置在磁盘上的原子写盘持久化与内存轮询索引热重载。
  - `AuthSwitcher.switchToSpecificAuth(targetIndex)` 增加防御性校验，严禁手动切换至已停用账号；当停用当前正在使用的活跃账号时，自动平滑切号至下一个可用账号。
  - `BrowserManager.rebalanceContextPool()` 自动排除已停用账号的 Context 预热与资源占用。

### 2.3 异步队列超时看门狗与路径清洗模式 (Async Queue Watchdog & Sanitization)
- **Token 计数异步队列超时注入**: 针对 Claude `countTokens` 与 OpenAI `inputTokens` 等辅助接口，底层的 `messageQueue.dequeue()` 显式绑定超时阈值（`this.timeouts.STREAM_CHUNK`），杜绝因上游连接中断无响应而导致的挂死死锁。
- **代理路径防重规范化清洗**: 网关在 `_buildProxyRequest` 代理转发与 `_extractModelFromPath` 模型提取链路中，通过正则严格清洗 `/models/` 重复前缀（如 `/models/(?:models/)+/` 规范化为 `/models/`），杜绝畸形 404 扩散。

### 2.3 多容器协同拓扑与端口职能分离 (Multi-Container Topology)
在 104 局域网服务器 (192.168.0.104) 采用多容器并行协同与流量分流模式：
1. **8316 端口 (Pro 模型专用专线 / 源码同构容器)**:
   - 宿主机路径: `/home/fy/aistudio-to-api-8316/`
   - 容器镜像: `aistudio-to-api-custom:8316`
   - 端口映射: `8316 -> 7860/tcp`, `9997 -> 9998/tcp` (内部 WS 隔离端口)
   - 定位与职能: **专用于 Pro 模型调用通道**（如 `gemini-2.5-pro`、`gemini-pro-latest`），隔离重型长上下文推理负载，避免与 Flash 等高频轻量请求争抢凭据槽位与并发队列。
2. **8317 端口 (主服务 / 综合模型网关容器)**:
   - 宿主机路径: `/home/fy/aistudio-to-api/`
   - 容器镜像: `aistudio-to-api-custom:latest`
   - 端口映射: `8317 -> 7860/tcp`, `9998 -> 9998/tcp`
   - 定位与职能: 承载源码定制、`ui/dist` 前端管理后台、403/404 补丁与综合模型日常推理。
3. **8318 端口 (备用服务 / 原生稳定镜像容器)**:
   - 宿主机路径: `/home/fy/aistudio-to-api-8318/`
   - 容器镜像: `ibuhub/aistudio-to-api:latest`
   - 端口映射: `8318 -> 7860/tcp`
   - 定位与职能: 作为稳定回退与对照基准节点，常驻按需待命 (`restart: "no"`)。
4. **网络与出墙隔离**: 通过 `host.docker.internal:7890` 挂载宿主机 Mihomo 代理，保障所有容器统一出墙访问 Google AI Studio。

## 3. 防御性编码与韧性原则 (Defensive Engineering)
- **路径与载荷前置断言**: 请求发起前强校验 `model` 字段非空与合法性。
- **流式响应断流自愈**: 对 SSE (Server-Sent Events) 流异常做即时清理与客户端断开监听，防止挂起僵尸连接。
- **Web 控制台免密直通机制**: 局域网管理界面采用免密路由直通模式（`AuthRoutes.isAuthenticated` 默认注入 session 并放行，前端 Vue Router 跳过异步登录拦截），彻底消除管理员日常登录摩擦；同时 `_createAuthMiddleware` 物理隔离保障，所有 `/v1/*` 核心 API 推理接口依然强制校验 API Key。
- **配置与密钥物理隔离**: 凭据严格隔离于本地 `configs/auths/` 与 Docker 外部卷，禁止任何凭据进入版本控制与记忆银行。
