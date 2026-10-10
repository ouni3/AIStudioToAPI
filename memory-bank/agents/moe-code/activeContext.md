# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 11 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 区分 Google 上游服务寻址抖动 404 与真实模型不存在 404，在多协议出口处将生成类 403/404 优雅映射为 503，避免客户端不可重试崩溃。
> - $L_{User}$: **+** 避免 Kilo 客户端因 Google AI Studio 偶发 404 内部寻址抖动崩溃中断，实现网关自愈切号与下游透明平滑重试。
> - $S_{total}$: **+** 统一各适配器流式/非流式出口错误码映射契约，消灭非对称透传带来的协议状态熵增。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=account_enable_disable_test_assertions confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **客户端 400 错误与切号状态机隔离**: 400 及 4xx 客户端参数错误（排除 403 区域/权限及 429 限频）严禁增加 `failureCount` 或触发 `switchToNextAuth`，在入口处即时拦截并设置 `skipAccountSwitch = true`，杜绝畸形请求击穿账号池。
2. **切号全局防抖与账号冷却惩罚机制**: `AuthSwitcher` 内置 `minSwitchIntervalMs` (默认 5s) 防止常规自愿轮换高频震荡；故障时打上 `accountCooldownMap` 惩罚标记 (默认 60s)。
3. **故障切号强制豁免防抖铁律 (Debounce Force Bypass on Failure)**: `switchToNextAuth(options)` 必须支持 `{ force: true }` / `{ ignoreDebounce: true }`。当由 403/429/5xx 等故障或 `handleRequestFailureAndSwitch` 发起切号时，当前账号已证明损坏且已进入 cooldown，必须强制绕过 `minSwitchIntervalMs` 防抖限制，严禁因防抖将请求滞留在坏账号上！
4. **账号启用/停用与轮询调度隔离模式**: `AuthSource` 跟踪 `disabledIndices`，在 `_buildRotationIndices()` 中将已停用账号与已过期账号一并从 `rotationIndices` 中彻底剔除，并在 `AuthSwitcher.switchToSpecificAuth()` 中拦截对停用账号的手动切号；在停用当前正在使用的账号时平滑触发 `_switchToNextAuth()` 切号并安全释放旧 Context。
5. **单元测试纯内存隔离与防脏文件模式**: 测试 `AuthSource` / `AuthSwitcher` 行为时，通过重写 `_discoverAvailableIndices` 和 `_getAuthContent` 构造纯内存 mock 数据源，杜绝在工作区产生临时脏文件与污染现有 `configs/auth` 磁盘目录。
6. **生成式错误出口 503 弹性降级契约**: 各协议出口（OpenAI / Claude / Gemini / Response API）在耗尽重试后，对生成类错误（`proxyRequest.is_generative`）的 403 与 404 必须统一优雅映射为 503 Service Unavailable，供下游客户端透明退避重试，严禁将不可重试的 404 透传导致客户端进程崩溃。

## 当前进展 (Active Phase)
1. **完成账号手动启用/停用（Enable/Disable）行为测试补齐**:
   - `tests/test_account_enable_disable.mjs`:
     * 补充多账号内存数据源模拟，测试账号默认全部参与轮询；
     * 测试停用账号 (index 1) 后，`getRotationIndices()` 与 `getAvailableIndices()` 严格排除已停用账号；
     * 验证 `isDisabled(1)` 为 true，`isDisabled(0)` 为 false；
     * 测试 `AuthSwitcher.switchToSpecificAuth(1)` 在账号被 disabled 时被安全拦截并拒绝切号，而健康账号 (index 2) 切号正常成功；
     * 纯内存模拟执行，不污染真实磁盘。

## 工作区状态
- 交付物变更：
  * `tests/test_account_enable_disable.mjs` (修改，补充行为断言)
  * `memory-bank/agents/moe-code/activeContext.md` (记忆沉淀)
- 状态：纯业务工程单测补齐完成，移交 NEXT_OWNER: moe-debug 进行环境验证。
