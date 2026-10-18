# Active Context: moe-orchestrator

> **[EVOLUTION_CONTRIBUTION]** (Phase 2 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 统筹协调 AIStudioToAPI 稳定性修复、标准化改造与 SR 等级跃迁，确保核心算力网关高可用。
> - $L_{User}$: **+** 自动化排查与降维派单，降低责任主体排障认知负担。
> - $S_{total}$: **+** 规范上下文生命周期与任务激活快照，维持系统负熵。
> - $Value_{Delivered}$: **+** 护航 API 网关稳定服务，保障下游业务持续可用。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 1. 当前会话状态 (Current Session State)
- **Active Phase**: `Phase 17 (8317 综合网关 400 根治与双通道架构平权升级及金丝雀上线)`
- **Task Goal**: 根治 8317 综合网关因上游 Google API 400 报错打崩下游客户端故障，加固 `src/auth/AuthSwitcher.js` 排除上游代理 400 异常，重新构建部署 8317 容器并验证推理出字。
- **Status**: [DEPLOYED|8317_PASS|8316_ONLINE|VERIFY_PASS]

## 2. 核心架构与编排经验 (Orchestration Insights)
1. **上游 Google API 400 穿透与换号故障转移防线**:
   - 某些特定账户可能由于权限受限（如缺乏 Build API 访问权返回 403），而在 Auto 模式回退到 Playground 通道后因会话特征被 Google 拒绝返回 400 `INVALID_ARGUMENT`；
   - 严禁将来自浏览器 Proxy Relay / Google API 抛出的 400 误判为客户端本地参数错误，服务端 `_isClientParameterError` 必须显式排除包含 `GOOGLE API RETURNED ERROR: 400` 与 `PROXY BROWSER ERROR` 的异常，同时 `_isImmediateSwitchStatus` 必须将其纳入即时切号集合，确保网关自动无缝换号重试，彻底杜绝下游调用方 Agent 因单账号异常而全员瘫痪。
2. **Build 通道 403 权限异常粘性自愈契约**:
   - 在 Playground Relay 中对单账号执行上下文记录 `this.buildChannelBlocked`；
   - 一旦检测到当前账号因权限不足遭遇 Build 403，后续请求自动直通 Playground 通道，彻底消除单请求双重通道往返的时延损耗。
3. **双容器串行金丝雀发布铁律**: 8316 节点完成独立热重构与生产部署，8317 综合网关常驻稳定在线不受任何干扰。

1. **Web 控制台免密直通与 API 严格鉴权物理隔离契约**:
   - `src/routes/AuthRoutes.js`: `isAuthenticated` 中间件默认将 `req.session.isAuthenticated` 置为 `true` 并执行 `next()`，所有 `/api/status`、`/api/accounts/*`、`/api/vnc/*` 管理接口免密直通；
   - `ui/app/router/index.js`: Vue Router 移除阻塞式鉴权探针，访问 `/login` 自动跳回状态页，实现访问即入；
   - **严格 API Key 隔离不变性**: `src/core/ProxyServerSystem.js` 中的 `_createAuthMiddleware` 保持未修改，所有 `/v1/chat/completions`、`/v1/messages` 等核心 API 推理接口依然强制校验 `API_KEYS`，杜绝未授权调用风险。
2. **8316 Pro 模型专用通道架构契约**: 104 服务器部署同构独立容器 `aistudio-to-api-8316`，对外暴露 `8316:7860`，宿主机内部 WebSocket 端口映射调整为 `9997:9998`，彻底避免与 8317 主容器的 `9998` 端口冲突。8316 专职承载 `gemini-2.5-pro`、`gemini-pro-latest` 等重型大模型长上下文推理，实现大模型与高频 Flash/日常请求凭据池与队列的物理隔离。
3. **故障换号穿透防抖契约**: `AuthSwitcher.switchToNextAuth({ force: true })` 支持强制绕过全局 5 秒防抖（`minSwitchIntervalMs`）。常规使用轮询受防抖保护防震荡，但遇到 403 (Region not supported)、429 (Rate limit) 或 5xx 等异常触发的故障切换时，必须无条件穿透防抖立即换号，彻底阻断坏账号连续报错穿透至下游。
4. **切号防抖与账号惩罚冷却契约**: 引入 5 秒全局防抖与 60 秒故障账号冷却惩罚 (`accountCooldownMap`)，当账号故障切走后打上时间戳冷却沉底，优先调度健康账号，阻断全池轮询雪崩。
5. **客户端 400 与 Google Ambiguous Service 错误隔离**: 客户端自身参数错误绝对不可计入账号 `failureCount`；将 Google `Ambiguous request for service ''` 移出不可重试模型错误名单，纳入立即切号自愈重试并在 OpenAI/Claude 出口统一映射 503。
6. **Thinking-Only 兜底契约升级**: 当模型仅输出 thought/reasoning 且未输出正文时注入无害 `glob` 工具调用（`{"pattern":"*"}`），并将 finish_reason 设为 tool_calls/tool_use，彻底阻断下游客户端解析崩溃。
7. **多协议状态机统一**: OpenAI SSE 流、Claude SSE 流、OpenAI Response API 及非流式请求均统一注入 glob tool_call / tool_use。
8. **多节点状态感知运维体系**: 8316 (Pro专线) 与 8317 (主网关) 保持强活跃 HTTP 200，8318 冷备节点在端口未监听时识别为 `[STANDBY]` 合规放行，避免误报。
9. **DevState 探针 100% 合规闭环**: 精准对齐全景控制台 10 大门禁抽取规则，通过零依赖脚本实现 G1 (Token限制)、G2 (Memory-Bank纯净度)、G3 (Git Gate工作流)、G6 (UI对比度) 与 G10 (重构文档同步)，消除所有 UNWIRED 债务。
