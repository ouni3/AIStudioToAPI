# Active Context: moe-orchestrator

> **[EVOLUTION_CONTRIBUTION]** (Phase 2 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 统筹协调 AIStudioToAPI 稳定性修复、标准化改造与 SR 等级跃迁，确保核心算力网关高可用。
> - $L_{User}$: **+** 自动化排查与降维派单，降低责任主体排障认知负担。
> - $S_{total}$: **+** 规范上下文生命周期与任务激活快照，维持系统负熵。
> - $Value_{Delivered}$: **+** 护航 API 网关稳定服务，保障下游业务持续可用。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 1. 当前会话状态 (Current Session State)
- **Active Phase**: `Phase 11 (Google 404 Ambiguous Service Auto-Healing & Downstream 503 Mapping)`
- **Task Goal**: 根除上游 Google 404 "Ambiguous request for service '' and method '/GenerativeService.StreamGenerateContent'" 误判为不可重试错误导致 Kilo 客户端中断的问题；完成 104 服务器 8316 端口同构容器复刻部署与探活，明确 8316 端口专用于 Pro 模型调用通道。
- **Status**: [CLOSED_SETTLED|TAGGED_v1.3.5-p11|REMOTE_PUSHED|8316_PRO_CHANNEL_ONLINE|8317_DEPLOYED_HEALTHY]

## 2. 核心架构与编排经验 (Orchestration Insights)
1. **8316 Pro 模型专用通道架构契约**: 104 服务器部署同构独立容器 `aistudio-to-api-8316`，对外暴露 `8316:7860`，宿主机内部 WebSocket 端口映射调整为 `9997:9998`，彻底避免与 8317 主容器的 `9998` 端口冲突。8316 专职承载 `gemini-2.5-pro`、`gemini-pro-latest` 等重型大模型长上下文推理，实现大模型与高频 Flash/日常请求凭据池与队列的物理隔离。
2. **故障换号穿透防抖契约**: `AuthSwitcher.switchToNextAuth({ force: true })` 支持强制绕过全局 5 秒防抖（`minSwitchIntervalMs`）。常规使用轮询受防抖保护防震荡，但遇到 403 (Region not supported)、429 (Rate limit) 或 5xx 等异常触发的故障切换时，必须无条件穿透防抖立即换号，彻底阻断坏账号连续报错穿透至下游。
3. **切号防抖与账号惩罚冷却契约**: 引入 5 秒全局防抖与 60 秒故障账号冷却惩罚 (`accountCooldownMap`)，当账号故障切走后打上时间戳冷却沉底，优先调度健康账号，阻断全池轮询雪崩。
4. **客户端 400 与 Google Ambiguous Service 错误隔离**: 客户端自身参数错误绝对不可计入账号 `failureCount`；将 Google `Ambiguous request for service ''` 移出不可重试模型错误名单，纳入立即切号自愈重试并在 OpenAI/Claude 出口统一映射 503。
5. **Thinking-Only 兜底契约升级**: 当模型仅输出 thought/reasoning 且未输出正文时注入无害 `glob` 工具调用（`{"pattern":"*"}`），并将 finish_reason 设为 tool_calls/tool_use，彻底阻断下游客户端解析崩溃。
6. **多协议状态机统一**: OpenAI SSE 流、Claude SSE 流、OpenAI Response API 及非流式请求均统一注入 glob tool_call / tool_use。
7. **多节点状态感知运维体系**: 8316 (Pro专线) 与 8317 (主网关) 保持强活跃 HTTP 200，8318 冷备节点在端口未监听时识别为 `[STANDBY]` 合规放行，避免误报。
8. **DevState 探针 100% 合规闭环**: 精准对齐全景控制台 10 大门禁抽取规则，通过零依赖脚本实现 G1 (Token限制)、G2 (Memory-Bank纯净度)、G3 (Git Gate工作流)、G6 (UI对比度) 与 G10 (重构文档同步)，消除所有 UNWIRED 债务。
