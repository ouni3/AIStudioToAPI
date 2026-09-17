# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 7 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 改造 Thinking-only 兜底逻辑为无害 glob 工具调用并补齐流式收尾 finalizeStream 机制，彻底消灭上游断流/思考截断。
> - $L_{User}$: **+** 消除客户端进程因长思考截断无正文而崩溃被动中断，降低调试与重启负担。
> - $S_{total}$: **+** 统一各协议 (OpenAI / Claude / Response API) 的 Thinking-only 降级与流式终结兜底模式。
> - `ect`: **S** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=finalize_stream_glob_fallback confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **上游错误码即时切号契约**: `immediateSwitchStatusCodes` 必须囊括 403, 404, 429 以及上游服务端错误 500, 502, 503, 504，杜绝盲目重试导致客户端长时间阻塞。
2. **异步队列消费超时注入**: 所有 `messageQueue.dequeue()` 调用均须显式指定超时阈值（如 `this.timeouts.STREAM_CHUNK`），避免上游挂起导致 Promise 永久挂死。
3. **网关路径防重清洗**: 代理路径解析须在前置入口与模型提取中过滤重复前缀（如 `/models/(?:models/)+/`），防止客户端穿透构造畸形路由。
4. **模型名强校验与即时拦截**: 非法模型名必须在前置入口执行 400 Bad Request 阻断，杜绝穿透上游导致切号雪崩。
5. **Thinking-only 工具兜底与流式收尾注入**: 遇模型仅产出思考链而无有效文本/工具调用的场景，或发生未收到 `finishReason` 的 `STREAM_END` / 异常截断时，统一在各协议（OpenAI / Claude 流式与非流式）注入无害 glob tool_call 并将 finish/stop_reason 设为 tool_calls/tool_use。
6. **零依赖 CI 门禁矩阵**: 使用 Python 3 标准库（sys, re, json, pathlib）实现 G1~G10 门禁脚本，二值化退出码契约（0/1），彻底杜绝第三方环境依赖。
7. **部署物版本自动同步 (ADVG SSOT)**: 通过 `sync_deployment_version.py` 自动关联 `package.json` 版本与 `plan.md` Phase 编号生成 `v<version>-p<phase>` 并同步写回 `assets.md`。

## 当前进展 (Active Phase)
1. **流式收尾 (finalizeStream) 与 Thinking 兜底补发机制**:
   - `src/core/FormatConverter.js`: 新增 `finalizeOpenAIStream` 和 `finalizeClaudeStream` 方法；严格依据 `streamState.hasEffectiveContent` 判定有效正文，若仅输出思考链而无有效文本/工具调用，在流结束时补发无害 `glob` 工具调用块。
   - `src/core/RequestHandler.js`: 在 `_streamOpenAIResponse` 和 `_streamClaudeResponse` 的 `STREAM_END`、`error` 及 `catch` 收尾处调用对应的 finalize 补发兜底 chunk。

## 工作区状态
- 交付物变更：
  * `src/core/FormatConverter.js` (修改)
  * `src/core/RequestHandler.js` (修改)
  * `memory-bank/agents/moe-code/activeContext.md` (修改)
- 状态：纯编辑原子施工 100% 完成，移交 NEXT_OWNER: moe-debug 进行环境验证。


