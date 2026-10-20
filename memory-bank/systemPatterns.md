# System Patterns: aistudio-to-api

> **[EVOLUTION_CONTRIBUTION]** (Phase 2 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 确立反向代理中枢、多凭据故障转移与 104 双容器架构模式，最大化 Gemini 算力利用率与可用性。
> - $L_{User}$: **+** 统一 API 协议转换、模型参数自适应与智能重试，实现免人工干预的 7x24 高可用代理服务。
> - $S_{total}$: **+** 清晰分层请求处理、凭据管理与协议转换，杜绝 403/404 异常扩散，降低系统状态熵。
> - $Value_{Delivered}$: **+** 为上层 Agent 与开发工具提供高弹性、低延迟的稳定 LLM 推理网关。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心 memory-bank 资产)

- **Baseline Marker**: `BASELINE_PHASE_19` (Phase 19 429 配额用尽熔断升级为直接关闭直到每日 15:00 CST 刷新时间基线已对齐)

## 0. 资产定级标定 (Rating & Asset Profile)
- **项目等级**: **SR (Super Rare - 系统枢纽级)**
- **系统定位**: 全系开发与生产环境之核心 LLM 逆向 API 网关与算力中继中枢
- **自托管与自愈协议**: 满足 100% 自托管自愈 (403 区域风控即时切号 + 404 模型防空 + 429 降频轮换 + 在途请求排空)，$L_{User\_rate} \le 0.05$

## 1. 架构总览 (Architecture Overview)

### 1.1 核心模块功能定位地图 (Repo-Skeleton Function Map)
按照 K5a「全景骨架导航与精准语法重构协同法则」建立骨架拓扑两级索引之第一级 SSOT：

| 模块目录 / 文件 | 核心功能定位 | 架构分层 | 协同依赖 |
|:---|:---|:---|:---|
| `main.js` | 服务初始化、中间件挂载、路由绑定与优雅停机 | 入口编排层 | `ProxyServerSystem`, `ConfigLoader`, `WebRoutes` |
| `src/core/RequestHandler.js` | OpenAI/Claude 协议路由分发、流式聚合、上游 400 即时切号与跨账号同签名 400 早停 | 请求调度中枢 | `FormatConverter`, `BrowserManager`, `ConnectionRegistry`, `AuthSwitcher` |
| `src/core/FormatConverter.js` | 双向协议载荷转换、模型名清洗、Thinking 提取与 Kilocode 兜底 | 协议适配层 | `CustomErrors`, `logger` |
| `src/core/BrowserManager.js` | 逆向 WebSocket 会话管理、Token 刷新、Context 池伸缩 | 逆向会话层 | `AuthSource`, `AuthSwitcher`, `ConnectionRegistry` |
| `src/core/ConnectionRegistry.js` | WebSocket 与 HTTP 在途连接追踪、在途请求平滑排空 (Drain) | 流量守卫层 | `logger` |
| `src/core/QuotaGuardService.js` | 专属模型配额硬熔断追踪、日配额退池与每日 15:00 自动重置 | 配额熔断层 | `ConfigLoader`, `logger` |
| `src/core/UsageStatsService.js` | 请求指标统计、每日 Token/请求数聚合与跨日持久化 | 观测指标层 | `logger` |
| `src/core/ProxyServerSystem.js` | 代理服务实例生命周期编排与健康状态维护 | 系统核心层 | `RequestHandler`, `BrowserManager` |
| `src/relay/playground-wire-encoder.js` | Web UI Playground 载荷纯协议编码 (JSON/RPC 序列化) | 中继协议层 | `logger` |
| `src/relay/playground-frame-decoder.js` | Web UI Playground 流式二进制帧/SSE 解码与解析 | 中继协议层 | `logger` |
| `scripts/client/playground-relay.js` | 浏览器端 Playground 逆向中继通信载体与双通道降级执行 | 客户端中继层 | `playground-wire-encoder.js`, `playground-frame-decoder.js`, `BrowserManager` |
| `src/auth/AuthSource.js` | 账号凭据加载、账号启用/停用状态追踪、轮询索引池构建 | 凭据状态层 | `ConfigLoader`, `logger` |
| `src/auth/AuthSwitcher.js` | 故障转移账号切换决策、手动账号切换与平滑降级 | 调度决策层 | `AuthSource`, `ConnectionRegistry` |
| `scripts/client/playground-relay.js` | Build / Playground 双通道浏览器中继、429 配额状态码保真与权限通道粘性隔离 | 客户端中继层 | `BrowserManager`, `QuotaGuardService`, `AuthSwitcher` |
| `src/auth/CreateAuth.js` | AI Studio 凭据初始化、登录状态抓取与凭据文件写入 | 凭据接入层 | `StickyProxyManager` |
| `src/routes/WebRoutes.js` | API 推理端点路由绑定 (`/v1/chat/completions`, `/v1/messages`, `/v1/models`) | 外部接口层 | `RequestHandler`, `AuthRoutes` |
| `src/routes/StatusRoutes.js` | 管理控制台状态接口与账号启停管理 (`/api/accounts/:index/status`) | 运维管理层 | `BrowserManager`, `QuotaGuardService` |
| `src/routes/AuthRoutes.js` | Web 控制台鉴权中间件与会话免密直通通道 | 安全控制层 | `ConfigLoader` |
| `src/utils/StickyProxyManager.js` | 账号专有黏性代理配置、VNC 端口映射与多网卡隔离 | 网络代理层 | `ProxyUtils` |
| `src/utils/MessageQueue.js` | 异步请求队列调度、背压控制与 STREAM_CHUNK 超时看门狗 | 异步通信层 | `CustomErrors` |

### 1.2 系统分层架构交互拓扑 (Subsystem Topology)

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
  - **切号全局防抖与账号惩罚冷却 (Anti-Thrashing Guard)**: 引入 5 秒全局切换防抖 (`minSwitchIntervalMs: 5000`) 与 60 秒故障账号冷却惩罚 (`accountCooldownMap`)，当发生异常切号时降权故障账号，优先轮询未受限账号；
  - **400 错误精准分流与上游故障智能切号 (Phase 16 加固)**:
    - **本地客户端参数 400 阻断**: 对客户端发起的畸形入参或非法的本地请求参数错误（经由 `RequestHandler._isClientParameterError` 判定为非上游异常），严格阻断切号，直接向调用端返回 400，杜绝全池账号高速轮转雪崩；
    - **上游 Google API / 代理通道 400 自动切号重试**: 来自代理层或 Google 上游 API 的 400 故障（如账户风控、通道失效或特定的上游 `INVALID_ARGUMENT` 报错），被系统智能鉴别为账户/信道异常故障，自动纳入即时切号重试集合，触发立即换号重放，彻底阻断下游 Agent 遭遇偶发 400 瘫痪或进程中断；
    - **跨账号同签名 400 上游错误早停守卫 (`CROSS_ACCOUNT_400_EARLY_STOP_THRESHOLD = 3`)**:
      - 单个请求因上游 400 触发换号重试时，`RequestHandler` 实时通过 `_normalizeErrorSignature` 记录错误特征与报错账号集合 (`upstream400Signatures`)；
      - 当在 3 个及以上独立账号中（`accountSet.size >= 3`）观察到完全相同的上游 400 错误签名时，判定该错误为该特定请求载荷本身引发的上游一致性拒绝，而非单账号风控或通道失效；
      - 立即触发早停阻断（Early Stop），就地终止后续换号重试并返回错误响应，彻底杜绝请求级跨全池账号无限空转轮询风暴。
  - **下游 503 弹性降级映射契约**: 在 OpenAI 与 Claude 流式/非流式出口，对上游返回的生成式 404/403 错误，在多轮换号重试耗尽后优雅映射为 503 Service Unavailable，支持下游客户端平滑重试，杜绝客户端直接中断。
  - 精准识别页面硬路由崩溃特征（如 `Page not found` + `Go to Build`），避免将 Google 偶发非阻塞 Toast 提示（如 `Please try again`）误判为致命错误。
  - 设定最大重试轮次（Max Retry Quorum），保障请求不陷入死循环，并在全部凭据耗尽时规范返回标准上游错误。

- **账号手动启用/停用与调度池物理隔离机制 (Phase 12)**:
  - 在 `AuthSource` 中引入 `disabledIndices` 状态追踪，`_buildRotationIndices()` 自动将 `disabled === true` 的账号物理排除在可用轮询池与故障转移（Failover）池之外。
  - `updateAccountStatus(index, { disabled })` 实现配置在磁盘上的原子写盘持久化与内存轮询索引热重载。
  - `AuthSwitcher.switchToSpecificAuth(targetIndex)` 增加防御性校验，严禁手动切换至已停用账号；当停用当前正在使用的活跃账号时，自动平滑切号至下一个可用账号。
  - `BrowserManager.rebalanceContextPool()` 自动排除已停用账号的 Context 预热与资源占用。

- **429 物理熔断停用 2 小时与双轨自愈生命周期 (Phase 14 / 理事长最高指示)**:
  - **废除 100 次机械限制**: 彻底废除按成功调用达到 100 次切断账号的旧逻辑，请求调用统计仅作可观测性展示，不再触发熔断；
  - **429 物理关号 2 小时**: 涵盖 `gemini-3.8-flash`、`gemini-flash-latest` 及 `gemini-3.7-flash` 系列。一旦遇到 429 报错，直接标记 `disabled: true, disabledReason: 'quota_exhausted', disabledUntil: Date.now() + 2 * 3600 * 1000` 并退出轮询池平滑切号；
  - **双轨自愈恢复通道**:
    - 通道 A (2 小时到期自愈): 调度器每 60 秒轻量巡检 `checkAndRestoreExpiredBans()`，超过 `disabledUntil` 自动启用；
    - 通道 B (每日 15:00 CST 兜底重置): 每日北京时间 15:00 统一定时重置解封所有 `quota_exhausted` 账号；
    - 人治免疫防护: 严格隔离手动停用的账号，仅恢复 `disabledReason === 'quota_exhausted'` 的账号。

### 2.3 异步队列超时看门狗与路径清洗模式 (Async Queue Watchdog & Sanitization)
- **Token 计数异步队列超时注入**: 针对 Claude `countTokens` 与 OpenAI `inputTokens` 等辅助接口，底层的 `messageQueue.dequeue()` 显式绑定超时阈值（`this.timeouts.STREAM_CHUNK`），杜绝因上游连接中断无响应而导致的挂死死锁。
- **代理路径防重规范化清洗**: 网关在 `_buildProxyRequest` 代理转发与 `_extractModelFromPath` 模型提取链路中，通过正则严格清洗 `/models/` 重复前缀（如 `/models/(?:models/)+/` 规范化为 `/models/`），杜绝畸形 404 扩散。

### 2.4 双通道中继架构 (Dual-Channel Relay Architecture: Playground + Build - Phase 16)
为了彻底根治上游 `400 INVALID_ARGUMENT` 故障并兼顾流式性能与工具调用能力，系统构建了 Build 逆向端点与 Web UI Playground 双通道中继架构：
1. **通道切流与自适应策略 (`x-upstream-channel: build | playground | auto`)**:
   - `build`: 走传统的 Build API 逆向端点通道，适合纯文本与高吞吐请求；
   - `playground`: 走 Google AI Studio Web UI Playground 逆向通道，具备完整的原生工具调用、原生长上下文与多模态兼容能力；
   - `auto`: 智能自适应调度，默认优先或依据请求特征（如是否携带 tools / function calling）在两通道间自动分流。
2. **Wire 纯编解码与协议解耦**:
   - `src/relay/playground-wire-encoder.js`: 专注于请求协议到 Playground 格式的纯编解码，确保无副作用与可确定性测试；
   - `src/relay/playground-frame-decoder.js`: 专注于二进制流式帧与 SSE 消息的解析和还原，消除跨平台解码乱码。
3. **页面中继与粘性信道跳过 (Sticky Channel Optimization)**:
   - 客户端页面中继脚本 (`scripts/client/playground-relay.js`) 维持逆向 Web 页面长连；
   - **`buildChannelBlocked` 触发范围收敛契约 (Phase 17 加固)**: `buildChannelBlocked` 仅在遇到 **403 权限不足**（如账号缺失 Build API 权限、`PERMISSION_DENIED`）时标记为 `true`，使后续请求持久粘性切换至 Playground 通道；**绝不将 429 配额耗尽误标记为 `buildChannelBlocked`**，因 429 属短时配额超限而非账号通道权限缺失，避免账号在配额重置后丧失 Build 通道的高吞吐能力；
   - 遇粘性信道不可用或中继异常时，自适应跳过故障信道平滑降级，杜绝请求被单一通道故障挂死。
4. **双通道独立配额与 429 配额耗尽错误保真契约 (Phase 16/17 加固 / 理事长最高指示)**:
   - **独立配额与无缝降级**: Build 通道与 Playground 网页通道的配额彼此独立，在 `auto` 模式下 Build 通道遇到 429 配额耗尽时，系统标记 Build 通道单次受限，并无缝降级回退至 Playground 网页端使用其独立配额；
   - **429 错误状态码保真契约 (State Code Fidelity Invariance)**: 严禁将 400 或 429 随意改写成 500/503/504 等模糊错误；若降级至 Playground 后依然失败，且 Build 通道原发错误为 429 / 配额耗尽（`ResourceExhausted` / `quota`），则在客户端中继异常链中**必须严格保真 429 状态码与配额耗尽特征语义**（`Google API returned error: 429 You exceeded your current quota...`）；
   - **Build 配额优先熔断契约**: 若 Build 通道已明确遭遇 429 / 配额耗尽，Playground 降级仅在成功交付时可掩蔽该失败；一旦 Playground 降级也失败（包括返回 400 参数或工具兼容错误），必须仍向服务端上抛保真的 429，以精准激活 `QuotaGuardService.handleQuota429` 关停 2 小时并立即切号，绝不让 Playground 400 掩盖真实配额耗尽。

### 2.5 多容器协同拓扑与端口职能分离 (Multi-Container Topology)
在 104 局域网服务器 (192.168.0.104) 采用多容器并行协同与流量分流模式：
1. **8316 端口 (Pro 模型专用专线 / 源码同构容器)**:
   - 宿主机路径: `/home/fy/aistudio-to-api-8316/`
   - 容器镜像: `aistudio-to-api-custom:8316`
   - 端口映射: `8316 -> 7860/tcp`, `9997 -> 9998/tcp` (内部 WS 隔离端口)
   - 挂载卷: `/home/fy/aistudio-to-api-8316/configs/auth:/app/configs/auth` 与 `/home/fy/aistudio-to-api-8316/data:/app/data` (完全物理独立)
   - 定位与职能: **专用于 Pro 模型调用通道**（如 `gemini-2.5-pro`、`gemini-pro-latest`），隔离重型长上下文推理负载，避免与 Flash 等高频轻量请求争抢凭据槽位与并发队列。
2. **8317 端口 (主服务 / 综合模型网关容器)**:
   - 宿主机路径: `/home/fy/aistudio-to-api/`
   - 容器镜像: `aistudio-to-api-custom:latest`
   - 端口映射: `8317 -> 7860/tcp`, `9998 -> 9998/tcp`
   - 挂载卷: `/home/fy/aistudio-to-api/configs/auth:/app/configs/auth` 与 `/home/fy/aistudio-to-api/data:/app/data` (完全物理独立)
   - 定位与职能: 承载源码定制、`ui/dist` 前端管理后台、403/404 补丁与综合模型日常推理。
3. **8316/8317 数据卷与凭据绝对物理隔离铁律 (Phase 15 立法)**:
   - 8316 与 8317 容器的 `configs/auth/` 与 `data/` 目录强制采用绝对路径挂载，严禁共享同一个物理目录或建立任何形式的软链接；
   - 账号开关（`disabled`）与调用量统计（`quota-guard-state.json` / `usage-stats.jsonl`）实现 100% 独立的物理存储与生命周期管理，两容器互不干扰。
3. **8318 端口 (备用服务 / 原生稳定镜像容器)**:
   - 宿主机路径: `/home/fy/aistudio-to-api-8318/`
   - 容器镜像: `ibuhub/aistudio-to-api:latest`
   - 端口映射: `8318 -> 7860/tcp`
   - 定位与职能: 作为稳定回退与对照基准节点，常驻按需待命 (`restart: "no"`)。
4. **网络与出墙隔离**: 通过 `host.docker.internal:7890` 挂载宿主机 Mihomo 代理，保障所有容器统一出墙访问 Google AI Studio。
5. **双容器串行金丝雀发布铁律 (Serial Canary Update Protocol - 理事长最高指示 2026-10-12, P0)**:
   - **严禁同时更新双容器**: 绝对禁止对 8316 与 8317 容器同时触发构建、重启或覆盖操作，消灭双节点同时离线与服务雪崩风险；
   - **单节点先行验证原则**: 必须且仅能先更新其中一个容器（如 8317 主节点），等待构建启动就绪并执行真实 HTTP `/health` 探活与真实业务推理（curl 测试出字成功）、确认状态完全稳定且工作正常后；
   - **放行后方可推进次节点**: 仅在前置节点获得稳定放行凭据后，方可启动第二个节点（如 8316 节点）的独立构建与平滑重启验证，保障整个集群时刻保有至少一个高可用在线节点。

## 3. 防御性编码与韧性原则 (Defensive Engineering)
- **路径与载荷前置断言**: 请求发起前强校验 `model` 字段非空与合法性。
- **流式响应断流自愈**: 对 SSE (Server-Sent Events) 流异常做即时清理与客户端断开监听，防止挂起僵尸连接。
- **Web 控制台免密直通机制**: 局域网管理界面采用免密路由直通模式（`AuthRoutes.isAuthenticated` 默认注入 session 并放行，前端 Vue Router 跳过异步登录拦截），彻底消除管理员日常登录摩擦；同时 `_createAuthMiddleware` 物理隔离保障，所有 `/v1/*` 核心 API 推理接口依然强制校验 API Key。
- **配置与密钥物理隔离**: 凭据严格隔离于本地 `configs/auths/` 与 Docker 外部卷，禁止任何凭据进入版本控制与记忆银行。
