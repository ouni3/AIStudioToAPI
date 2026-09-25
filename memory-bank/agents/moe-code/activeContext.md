# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 9 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 拦截 "-" 及畸形剥离模型名，并在切号状态机前置 `_isModelNotFoundError`，杜绝 404 引发的多账号雪崩式换号。
> - $L_{User}$: **+** 杜绝坏模型名请求导致所有可用账号被无意义轮询锁死的运维与认知损耗。
> - $S_{total}$: **+** 精准收敛模型后缀剥离与错误响应流转，消除异常切号扩散带来的系统状态熵。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=account_switch_debounce_cooldown_and_400_isolation confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **客户端 400 错误与切号状态机隔离**: 400 及 4xx 客户端参数错误（排除 403 区域/权限及 429 限频）严禁增加 `failureCount` 或触发 `switchToNextAuth`，在入口处即时拦截并设置 `skipAccountSwitch = true`，杜绝畸形请求击穿账号池。
2. **切号全局防抖与账号冷却惩罚机制**: `AuthSwitcher` 内置 `minSwitchIntervalMs` (默认 5s) 防止并发错误瞬时多次切号；账号故障时打上 `accountCooldownMap` 惩罚标记 (默认 60s)，轮询时优先跳过冷却中账号，若全部冷却则按剩余时间升序保底。
3. **上游错误码即时切号契约与 404 优先级分流**: `immediateSwitchStatusCodes` 虽包含 404，但当错误归属于 `_isModelNotFoundError` 时，必须判定为客户端入参错误并前置中断，标记 `skipAccountSwitch = true`，严禁触发切号重试以免引发全账号雪崩。
4. **模型名后缀剥离防御性断言**: 在剥离 `-search`、`-code`、`-real`、`-fake`、`-high` 等后缀后，必须校验剩余 `cleanModelName` 是否为合法模型名；若剥离后只剩 `-` 等非法标识，必须回退原样保持原 modelName，交由后续合法性校验拦截。
5. **异步队列消费超时注入**: 所有 `messageQueue.dequeue()` 调用均须显式指定超时阈值（如 `this.timeouts.STREAM_CHUNK`），避免上游挂起导致 Promise 永久挂死。
6. **Thinking-only 工具兜底与流式收尾注入**: 遇模型仅产出思考链而无有效正文或发生截断时，统一注入无害 glob tool_call 并将 finish/stop_reason 设为 tool_calls/tool_use。
7. **同构 Logger 与 FSM 规范**: 在 Node.js 服务端统一封装 LoggingService 并内置 fsmTransition，配合 `@moe-logger-exempt` 满足 G15 静态拦截。

## 当前进展 (Active Phase)
1. **切号防抖、账号惩罚冷却与 400 客户端错误隔离机制落地**:
   - `src/auth/AuthSwitcher.js`:
     * 构造函数新增 `this.lastSwitchTimestamp = 0`，`this.minSwitchIntervalMs = this.config?.minSwitchIntervalMs || 5000`；新增 `this.accountCooldownMs = this.config?.accountCooldownMs || 60000`，`this.accountCooldownMap = new Map()`；
     * `switchToNextAuth`: 增加全局防抖判定，不足 `minSwitchIntervalMs` 则直接拒绝并返回说明；对可用账号集执行冷却过滤，优先轮询就绪账号，全冷却时按剩余时间最少升序保底；切号成功后更新 `this.lastSwitchTimestamp = Date.now()`；
     * 新增 `clearAccountCooldown(index)`、`setAccountCooldown(index, durationMs)`、`isAccountInCooldown(index)` 与 `getAccountRemainingCooldown(index)` 辅助方法；
     * `handleRequestFailureAndSwitch`: 针对 400 以及 (status >= 400 && status < 500 && status !== 403 && status !== 429) 判定为客户端自身参数错误，记录 warning 并直接 return，绝不自增 `failureCount`，不触发换号；因 403/429/5xx 触发切号时，自动给当前账号打上冷却惩罚时间戳；
   - `src/core/RequestHandler.js`:
     * 新增 `_isClientParameterError(error)` 辅助判别方法；
     * `_isImmediateSwitchStatus`: 明确排除 400 以及非 403/429 的 4xx 客户端参数错误；
     * 在 Gemini Real Stream、OpenAI Real Stream、Claude Real Stream、OpenAI Response API Real Stream、`_executeRequestWithRetries`、Count Tokens 等全部异常捕获链路中，前置识别客户端参数错误并置 `skipAccountSwitch = true`，阻断盲目换号；
   - `tests/test_model_dash_sanitization.mjs`: 补充 400 客户端错误隔离、切号防抖、账号冷却过滤的完整单测断言。

## 工作区状态
- 交付物变更：
  * `src/auth/AuthSwitcher.js` (修改)
  * `src/core/RequestHandler.js` (修改)
  * `tests/test_model_dash_sanitization.mjs` (修改)
  * `memory-bank/agents/moe-code/activeContext.md` (修改)
- 状态：业务工程代码纯编辑原子施工 100% 完成，NEXT_OWNER: moe-debug 进行环境验证。
