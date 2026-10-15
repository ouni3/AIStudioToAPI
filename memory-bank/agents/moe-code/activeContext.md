# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 14 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 废除机械 100 次使用关闭账号旧逻辑，实现真实 429 RESOURCE_EXHAUSTED 物理关闭账号 2 小时 + 双轨（到期/15:00 CST）自愈，释放健康算力。
> - $L_{User}$: **+** 彻底消除账号在配额充裕时因满 100 次误停用的异常断流，网关自动换号与到期恢复全自托管，人工介入降为 0。
> - $S_{total}$: **+** 统一 8316 与 8317 端口 flash 系列目标模型匹配规则与 429 熔断时延规范，消除跨端口非对称行为。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=quota_guard_429_circuit_breaker_refactor confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **客户端 400 错误与切号状态机隔离**: 400 及 4xx 客户端参数错误（排除 403 区域/权限及 429 限频）严禁增加 `failureCount` 或触发 `switchToNextAuth`，在入口处即时拦截并设置 `skipAccountSwitch = true`，杜绝畸形请求击穿账号池。
2. **切号全局防抖与账号冷却惩罚机制**: `AuthSwitcher` 内置 `minSwitchIntervalMs` (默认 5s) 防止常规自愿轮换高频震荡；故障时打上 `accountCooldownMap` 惩罚标记 (默认 60s)。
3. **故障切号强制豁免防抖铁律 (Debounce Force Bypass on Failure)**: `switchToNextAuth(options)` 必须支持 `{ force: true }` / `{ ignoreDebounce: true }`。当由 403/429/5xx 等故障或 `handleRequestFailureAndSwitch` 发起切号时，当前账号已证明损坏且已进入 cooldown，必须强制绕过 `minSwitchIntervalMs` 防抖限制，严禁因防抖将请求滞留在坏账号上！
4. **账号启用/停用与轮询调度隔离模式**: `AuthSource` 跟踪 `disabledIndices` 与 `disabledUntilMap`，在 `_buildRotationIndices()` 中将已停用账号与已过期账号一并从 `rotationIndices` 中彻底剔除，并在 `AuthSwitcher.switchToSpecificAuth()` 中拦截对停用账号的手动切号；在停用当前正在使用的账号时平滑触发 `_switchToNextAuth()` 切号并安全释放旧 Context。
5. **单元测试纯内存隔离与防脏文件模式**: 测试 `AuthSource` / `AuthSwitcher` 行为时，通过重写 `_discoverAvailableIndices` 和 `_getAuthContent` 构造纯内存 mock 数据源，杜绝在工作区产生临时脏文件与污染现有 `configs/auth` 磁盘目录。
6. **双轨配额恢复与人治隔离铁律 (Dual-Channel Restoration & Manual Ban Invariance)**:
   - 通道 A：2小时到期自动恢复（巡检 `disabledUntil` 到期解封）；
   - 通道 B：每日北京时间 15:00 CST 统一重置兜底；
   - 铁律约束：仅解封 `disabledReason === 'quota_exhausted'` 的账号，严禁恢复人治手动停用的账号（`disabledReason !== 'quota_exhausted'`）。
7. **配额计数闭环晚绑定与成功二值化门禁**: 配额统计 `quotaGuard.recordRequest()` 仅作为遥测指标，严禁用于机械关停账号；仅在 `_finalizeTrackedRequest` 确认成功时晚绑定计数。

## 当前进展 (Active Phase)
1. **完成 QuotaGuardService 与 429 调度链路重构**:
   - `src/auth/AuthSource.js`:
     * 新增 `disabledUntilMap`，支持在 `updateAccountStatus(index, { disabled, disabledReason, disabledUntil })` 中保存与清除 `disabledUntil` 时间戳；
     * 新增 `getDisabledUntil(index)` 查询接口。
   - `src/core/QuotaGuardService.js`:
     * `isTargetModel`: 统一覆盖 8316 与 8317 端口模型（`gemini-flash-latest`、`gemini-3.8-flash` 系列、`gemini-3.7-flash` 系列）；
     * 废除 100 次调用自动关号逻辑，保留调用统计仅作为遥测可观测性；
     * 新增 `handleQuota429(authIndex, modelName)`，标记 `disabled = true, disabledReason = 'quota_exhausted', disabledUntil = Date.now() + 2 * 3600 * 1000` 并触发切号；
     * 双轨恢复：通道 A（`checkAndRestoreExpiredBans` 周期巡检 2 小时到期自动解封） + 通道 B（`resetQuotaCycle` 每日 15:00 CST 统一全量解封）；严格保护人治禁用账号不被恢复。
   - `src/auth/AuthSwitcher.js` & `src/core/RequestHandler.js`:
     * 在 `AuthSwitcher` 中注入 `quotaGuardService`，遇到 429 错误时调用 `quotaGuardService.handleQuota429(authIndex, model)` 实施物理封禁 2 小时并平滑换号；
   - 单测验证：
     * `tests/test_quota_guard_service.mjs` 与 `tests/test_account_enable_disable.mjs` 全量断言通过。

## 工作区状态
- 交付物变更：
  * `src/auth/AuthSource.js` (修改，支持 disabledUntil 持久化与内存跟踪)
  * `src/core/QuotaGuardService.js` (修改，重构 429 熔断与双轨恢复，废除 100 次关闭逻辑)
  * `src/auth/AuthSwitcher.js` (修改，429 错误拦截并触发 handleQuota429 停用 2 小时)
  * `src/core/RequestHandler.js` (修改，绑定 quotaGuardService 引用至 authSwitcher)
  * `tests/test_quota_guard_service.mjs` (修改，更新单测断言 429 封禁 2 小时、双轨恢复与 100 次不熔断)
  * `tests/test_account_enable_disable.mjs` (修改，更新 disabledUntil 字段测试断言)
  * `memory-bank/agents/moe-code/activeContext.md` (记忆沉淀)
- 状态：纯业务工程代码施工完成，无盲搜、无环境污染，移交 NEXT_OWNER: moe-debug 进行环境验证。
