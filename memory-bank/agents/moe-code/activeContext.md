# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 11 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 区分 Google 上游服务寻址抖动 404 与真实模型不存在 404，在多协议出口处将生成类 403/404 优雅映射为 503，避免客户端不可重试崩溃。
> - $L_{User}$: **+** 避免 Kilo 客户端因 Google AI Studio 偶发 404 内部寻址抖动崩溃中断，实现网关自愈切号与下游透明平滑重试。
> - $S_{total}$: **+** 统一各适配器流式/非流式出口错误码映射契约，消灭非对称透传带来的协议状态熵增。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=upstream_ambiguous_service_404_switch_and_503_mapping confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **客户端 400 错误与切号状态机隔离**: 400 及 4xx 客户端参数错误（排除 403 区域/权限及 429 限频）严禁增加 `failureCount` 或触发 `switchToNextAuth`，在入口处即时拦截并设置 `skipAccountSwitch = true`，杜绝畸形请求击穿账号池。
2. **切号全局防抖与账号冷却惩罚机制**: `AuthSwitcher` 内置 `minSwitchIntervalMs` (默认 5s) 防止常规自愿轮换高频震荡；故障时打上 `accountCooldownMap` 惩罚标记 (默认 60s)。
3. **故障切号强制豁免防抖铁律 (Debounce Force Bypass on Failure)**: `switchToNextAuth(options)` 必须支持 `{ force: true }` / `{ ignoreDebounce: true }`。当由 403/429/5xx 等故障或 `handleRequestFailureAndSwitch` 发起切号时，当前账号已证明损坏且已进入 cooldown，必须强制绕过 `minSwitchIntervalMs` 防抖限制，严禁因防抖将请求滞留在坏账号上！
4. **上游错误码即时切号契约与 404 优先级分流**: `immediateSwitchStatusCodes` 包含 404；真正 `_isModelNotFoundError` 时前置中断并标记 `skipAccountSwitch = true`；但上游 Google 偶发内部服务寻址抖动 (`Ambiguous request for service`) 虽为 404，却绝非客户端模型不存在，必须允许走即时切号重试状态机。
5. **生成式错误出口 503 弹性降级契约**: 各协议出口（OpenAI / Claude / Gemini / Response API）在耗尽重试后，对生成类错误（`proxyRequest.is_generative`）的 403 与 404 必须统一优雅映射为 503 Service Unavailable，供下游客户端透明退避重试，严禁将不可重试的 404 透传导致客户端进程崩溃。
6. **模型名后缀剥离防御性断言**: 在剥离 `-search`、`-code`、`-real`、`-fake`、`-high` 等后缀后，必须校验剩余 `cleanModelName` 是否为合法模型名；若剥离后只剩 `-` 等非法标识，必须回退原样保持原 modelName，交由后续合法性校验拦截。
7. **异步队列消费超时注入**: 所有 `messageQueue.dequeue()` 调用均须显式指定超时阈值（如 `this.timeouts.STREAM_CHUNK`），避免上游挂起导致 Promise 永久挂死。
8. **Thinking-only 工具兜底与流式收尾注入**: 遇模型仅产出思考链而无有效正文或发生截断时，统一注入无害 glob tool_call 并将 finish/stop_reason 设为 tool_calls/tool_use。

## 当前进展 (Active Phase)
1. **修复 8317 网关在遇到上游 Google 404 "Ambiguous request for service" 时未重试直接透传导致客户端中断问题**:
   - `src/core/RequestHandler.js`:
     * `_isModelNotFoundError(error)`: 显式拦截并排除 `AMBIGUOUS REQUEST FOR SERVICE`，使其不被误判为模型不存在，不设置 `skipAccountSwitch = true`；
     * `_isImmediateSwitchStatus(status, message)`: 在 `statusCode === 404` 且包含 `AMBIGUOUS REQUEST FOR SERVICE` 时，允许放行进入后续切号重试逻辑；
     * 对齐出口处 503 映射: 在 OpenAI Real Stream、OpenAI Fake/Non-Stream、OpenAI Response API Real Stream、OpenAI Response API Fake/Non-Stream、Claude Real Stream 以及 Claude Fake/Non-Stream 出口处，统一将生成类（`is_generative`）非模型不存在的 404 以及 403 映射为 503 Service Unavailable。
   - `tests/test_model_dash_sanitization.mjs`:
     * 更新断言：验证 `ambiguousServicePayload` 判定为 `_isModelNotFoundError` 为 false；
     * 验证 `_isImmediateSwitchStatus(404, ambiguousServicePayload.message)` 为 true，且真实模型不存在为 false。

## 工作区状态
- 交付物变更：
  * `src/core/RequestHandler.js` (修改)
  * `tests/test_model_dash_sanitization.mjs` (修改)
  * `memory-bank/agents/moe-code/activeContext.md` (修改)
- 状态：业务工程代码纯编辑原子施工 100% 完成，NEXT_OWNER: moe-debug 进行环境验证。
