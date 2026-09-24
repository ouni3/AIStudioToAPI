# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 9 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 拦截 "-" 及畸形剥离模型名，并在切号状态机前置 `_isModelNotFoundError`，杜绝 404 引发的多账号雪崩式换号。
> - $L_{User}$: **+** 杜绝坏模型名请求导致所有可用账号被无意义轮询锁死的运维与认知损耗。
> - $S_{total}$: **+** 精准收敛模型后缀剥离与错误响应流转，消除异常切号扩散带来的系统状态熵。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=model_dash_sanitization_and_404_prevention confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **上游错误码即时切号契约与 404 优先级分流**: `immediateSwitchStatusCodes` 虽包含 404，但当错误归属于 `_isModelNotFoundError` 时，必须判定为客户端入参错误并前置中断，标记 `skipAccountSwitch = true`，严禁触发切号重试以免引发全账号雪崩。
2. **模型名后缀剥离防御性断言**: 在剥离 `-search`、`-code`、`-real`、`-fake`、`-high` 等后缀后，必须校验剩余 `cleanModelName` 是否为合法模型名；若剥离后只剩 `-` 等非法标识，必须回退原样保持原 modelName，交由后续合法性校验拦截。
3. **异步队列消费超时注入**: 所有 `messageQueue.dequeue()` 调用均须显式指定超时阈值（如 `this.timeouts.STREAM_CHUNK`），避免上游挂起导致 Promise 永久挂死。
4. **Thinking-only 工具兜底与流式收尾注入**: 遇模型仅产出思考链而无有效正文或发生截断时，统一注入无害 glob tool_call 并将 finish/stop_reason 设为 tool_calls/tool_use。
5. **同构 Logger 与 FSM 规范**: 在 Node.js 服务端统一封装 LoggingService 并内置 fsmTransition，配合 `@moe-logger-exempt` 满足 G15 静态拦截。
6. **零依赖 CI 门禁矩阵**: 使用 Python 3 标准库（sys, re, json, pathlib）实现 G1~G16 门禁脚本，二值化退出码契约（0/1），彻底杜绝第三方环境依赖。

## 当前进展 (Active Phase)
1. **模型名 "-" 与畸形剥离加固及 404 切号雪崩防护**:
   - `FormatConverter.js`: 在 `parseModelWebSearchSuffix`、`parseModelBuiltInToolSuffixes`、`parseModelStreamingModeSuffix` 与 `parseModelThinkingLevel` 中增加剥离后合法性核验，若剥离后结果不符合 `isValidModelName`，保留原样回退，避免产生 `"-"` 穿透；
   - `RequestHandler.js`: 在 `_handleRealStreamResponse`、OpenAI Real Stream、Claude Real Stream、OpenAI Response API Real Stream、`_executeRequestWithRetries`、countTokens 等链路中将 `_isModelNotFoundError` 判定前置于 `_isImmediateSwitchStatus`，遇 404 模型不存在直接阻断切号并置 `skipAccountSwitch = true`；
   - `tests/test_model_dash_sanitization.mjs`: 新增全方位测试用例，覆盖单测断言。

## 工作区状态
- 交付物变更：
  * `src/core/FormatConverter.js` (修改)
  * `src/core/RequestHandler.js` (修改)
  * `tests/test_model_dash_sanitization.mjs` (新增)
  * `memory-bank/agents/moe-code/activeContext.md` (修改)
- 状态：业务工程代码纯编辑原子施工 100% 完成，NEXT_OWNER: moe-debug 进行环境验证。
