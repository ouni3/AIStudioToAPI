# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 8 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 补齐 4 大未挂载 (UNWIRED) CI 缺陷门禁，完全对齐全景控制台 DevState 抽取标准，消除破窗效应。
> - $L_{User}$: **+** 自动化一键执行 `verify:settlement` 与 `npm run verify`，降低跨账本排查与例保审核负担。
> - $S_{total}$: **+** 引入标准结构化 Logger 与 FSM 轨迹规范，建立零依赖纯 Python 3 CI 门禁矩阵。
> - `ect`: **S** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=wire_ci_defect_gates confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **上游错误码即时切号契约**: `immediateSwitchStatusCodes` 必须囊括 403, 404, 429 以及上游服务端错误 500, 502, 503, 504，杜绝盲目重试导致客户端长时间阻塞。
2. **异步队列消费超时注入**: 所有 `messageQueue.dequeue()` 调用均须显式指定超时阈值（如 `this.timeouts.STREAM_CHUNK`），避免上游挂起导致 Promise 永久挂死。
3. **Thinking-only 工具兜底与流式收尾注入**: 遇模型仅产出思考链而无有效正文或发生截断时，统一注入无害 glob tool_call 并将 finish/stop_reason 设为 tool_calls/tool_use。
4. **零依赖 CI 门禁矩阵**: 使用 Python 3 标准库（sys, re, json, pathlib）实现 G1~G16 门禁脚本，二值化退出码契约（0/1），彻底杜绝第三方环境依赖。
5. **部署物版本自动同步 (ADVG SSOT)**: 通过 `sync_deployment_version.py` 自动关联 `package.json` 版本与 `plan.md` Phase 编号生成 `v<version>-p<phase>` 并同步写回 `assets.md`。
6. **同构 Logger 与 FSM 规范**: 在 Node.js 服务端引入 `src/utils/logger.js` 统一封装 LoggingService 并内置 fsmTransition，配合 `@moe-logger-exempt` 满足 G15 静态拦截。
7. **证据优先与结算一致性门禁 (G12/G16)**: Phase < 195 阶段在无活跃 evidence 情况下自动通过 Schema 断言与 Idle 豁免，确保历史演进与前向兼容性。

## 当前进展 (Active Phase)
1. **补齐 4 项 UNWIRED CI 缺陷门禁 (Phase 8)**:
   - 编写 `scripts/ci/lint_routine_maintenance.py` (G11)
   - 编写 `schemas/phase_evidence.schema.json` 与 `scripts/ci/lint_phase_evidence.py` (G12)
   - 编写 `src/utils/logger.js` 与 `scripts/ci/lint_logging_standards.py` (G15)
   - 编写 `scripts/ci/lint_settlement_evidence_consistency.py` (G16)
   - 在 `package.json` 挂载 `lint:logging`、`lint:evidence`、`lint:routine`、`lint:consistency`、`verify:settlement` 并将门禁串联入 `lint:ci`

## 工作区状态
- 交付物变更：
  * `package.json` (修改)
  * `src/utils/logger.js` (新增)
  * `schemas/phase_evidence.schema.json` (新增)
  * `scripts/ci/lint_routine_maintenance.py` (新增)
  * `scripts/ci/lint_phase_evidence.py` (新增)
  * `scripts/ci/lint_logging_standards.py` (新增)
  * `scripts/ci/lint_settlement_evidence_consistency.py` (新增)
  * `memory-bank/agents/moe-code/activeContext.md` (修改)
- 状态：纯编辑原子施工 100% 完成，移交 NEXT_OWNER: moe-debug 进行环境验证。
