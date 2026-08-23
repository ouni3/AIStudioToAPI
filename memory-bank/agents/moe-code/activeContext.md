# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 修复 AIStudioToAPI 中针对 503 死循环切号与空返回中断的两个核心缺陷，提高网关可靠性。
> - $L_{User}$: **+** 保证下游客户端正常解析流式与非流式响应，降低异常和崩溃引起的维护负载。
> - $S_{total}$: **+** 规范错误代码映射与响应转换格式，维持系统状态低熵。
> - `ect`: **S** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

## 当前进展 (Active Phase)
1. **修复缺陷 1 (503 死循环切号)**:
   - 在 `src/core/RequestHandler.js` 中新增 `_isModelNotFoundError(error)` 精准识别 upstream 返回的由于模型不存在导致的 404/400 错误。
   - 在所有重试/切号逻辑入口 (如 `_executeRequestWithRetries` / streaming loops) 拦截此类错误，设置 `skipAccountSwitch = true` / `skipFinalFailureSwitch = true`，不再映射为 503 且阻止账号轮换与死循环。
   
2. **修复缺陷 2 (流式/非流式空返回/Safety 拦截)**:
   - 在 `src/core/FormatConverter.js` 中重构 OpenAI / Claude 的转换逻辑：
     * **OpenAI Non-Stream**: 候选不存在或被 Prompt 过滤时自动发出 content_filter 响应。当 `candidate.finishReason === "SAFETY"` 时 finish_reason 设置为 `content_filter`，并始终确保 `content` 为 valid string。
     * **OpenAI Stream**: Stream 遇到 `SAFETY` 拦截或空内容且无 FunctionCall 时，注入 `"[Content omitted due to safety filter]"` 提示并发送正确的 `content_filter` finish_reason。对常规完全空流也提供 fallback text 输出防止客户端崩溃。
     * **Claude Non-Stream**: 候选不存在、没有 text 或触发 `SAFETY` 时，保证 `content` 数组至少包含一个有效元素 `{ text: ..., type: "text" }` 而不是空数组。
     * **Claude Stream**: 在 finishReason 触发时，若始终没有发射过 text content block，在 `message_stop` 之前补齐完整的 block_start -> block_delta -> block_stop 事件流，消除了 Claude 兼容层中流式空数组下游客户端越界的问题。

## 工作区状态
- 修改文件：
  * `src/core/RequestHandler.js` (已完成)
  * `src/core/FormatConverter.js` (已完成)
- 状态：已完成纯编辑施工，等待移交 `moe-debug` 进行环境验证与测试。
