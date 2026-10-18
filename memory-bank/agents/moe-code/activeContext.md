# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 15 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 拔除 relay 400 强行改写 503 的降级伪装，消除账号池虚假 503 雪崩并实现真实 400/429 状态码精准透传。
> - $L_{User}$: **+** Build 与 Playground 双通道独立配额容错，只有双通道配额均耗尽时才激活 429 物理熔断，单通道受限自动无缝回退，人工排障损耗降为 0。
> - $S_{total}$: **+** 物理擦除 400->503 hack 代码与临时降级分支，统一代理错误状态码上抛语义，维持负熵。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=dual_channel_quota_and_status_fidelity confidence=95% hits=2/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **客户端 400 错误与切号状态机隔离**: 400 及 4xx 客户端参数错误（排除 403 区域/权限及 429 限频）严禁增加 `failureCount` 或触发 `switchToNextAuth`，在入口处即时拦截并设置 `skipAccountSwitch = true`，杜绝畸形请求击穿账号池。
2. **切号防抖与冷却惩罚机制 (Debounce & Cooldown)**: `AuthSwitcher` 内置 `minSwitchIntervalMs` (默认 5s) 防止常规自愿轮换高频震荡；故障时打上 `accountCooldownMap` 惩罚标记 (默认 60s)。故障切号必须强制豁免防抖铁律：`switchToNextAuth(options)` 必须支持 `{ force: true }` / `{ ignoreDebounce: true }`——由 403/429/5xx 等故障发起切号时当前账号已损坏并进入 cooldown，必须强制绕过 `minSwitchIntervalMs`，严禁因防抖将请求滞留在坏账号上。
3. **双通道配额独立与状态码保真契约**: Build 通道与 Playground 网页通道配额独立。在 auto 模式下首选 Build，若遇 429/403/QuotaExhausted 则记录 `buildChannelBlocked` 并回退 Playground；只有当 Playground 也遇 429/QuotaExhausted 时才判定配额彻底耗尽上抛 429（触发网关 2 小时熔断）。严禁在 relay 中将 upstream 400 伪装成 503，网关已具备 `isUpstreamProxy400` 识别能力。
4. **双通道工具声明编码契约 (Build/Playground Wire, kilocode 400 根因修复)**: Build 通道 Gemini REST 函数声明必须仅保留 `parametersJsonSchema`（`parameters` 与之互斥，Google 400 报 `parameters_json_schema must not be set when parameters is set`），归一化含 null 键清除与 `{}`/`true` → `{"type":"object"}`；Playground 通道函数声明走 proto 位置数组（`generate[6]=[null,[[name,desc,paramsWire]]]`，paramsWire `[0]`typeCode…`[7]`required），位置数组无法表达的开放 schema 特征（如 `additionalProperties`）回退追加到 parameters wire`[2]` description：`\nArguments must follow this JSON Schema: ` + JSON.stringify(raw)。
5. **账号启用/停用与轮询调度隔离模式**: `AuthSource` 跟踪 `disabledIndices` 与 `disabledUntilMap`，在 `_buildRotationIndices()` 中将已停用账号与已过期账号一并从 `rotationIndices` 中彻底剔除，并在 `AuthSwitcher.switchToSpecificAuth()` 中拦截对停用账号的手动切号；在停用当前正在使用的账号时平滑触发 `_switchToNextAuth()` 切号并安全释放旧 Context。
6. **单元测试纯内存隔离与防脏文件模式**: 测试 `AuthSource` / `AuthSwitcher` 行为时，通过重写 `_discoverAvailableIndices` 和 `_getAuthContent` 构造纯内存 mock 数据源，杜绝在工作区产生临时脏文件与污染现有 `configs/auth` 磁盘目录。
7. **双轨配额恢复与人治隔离铁律 (Dual-Channel Restoration & Manual Ban Invariance)**:
   - 通道 A：2小时到期自动恢复（巡检 `disabledUntil` 到期解封）；
   - 通道 B：每日北京时间 15:00 CST 统一重置兜底；
   - 铁律约束：仅解封 `disabledReason === 'quota_exhausted'` 的账号，严禁恢复人治手动停用的账号（`disabledReason !== 'quota_exhausted'`）。
8. **Firefox Camoufox Xray 隔离穿透与鸭子类型适配模式**: Playwright+Firefox 在 `addInitScript` 中受 Xray 隔离，普通 `window` 看不到页面 main world 定义的 expando 全局变量（如 `default_MakerSuite`）；必须通过 `window.wrappedJSObject || window` 获取 `pageWindow`，且对跨 world 传入的 `Headers`/`Request` 严禁使用脆弱的 `instanceof`，必须统一通过 `typeof forEach === 'function'` / `entries` / `get` 鸭子类型提取。

## 当前进展 (Active Phase)
1. **8317 综合网关 400 根治与双通道平权升级**:
   - `src/auth/AuthSwitcher.js`:
     * 排除 `isUpstreamProxy400`，确保 Google 上游 400 异常顺利触发切号自愈重试，而非被误断为本地客户端入参错误。
2. **双通道配额容错与错误上抛保真改造**:
   - `scripts/client/playground-relay.js`:
     * 拔除 `_sendErrorResponse` 中将 upstream 400 强行改写为 503 的 hack，精准保留状态码与错误信息。
     * 增强 `_executeUnaryGenerate` 与 `_executeStreamGenerate` 的双通道配额独立判断：Build 遇 429/QuotaExhausted/403 标记 `buildChannelBlocked` 并回退 Playground；仅当双通道均遭遇 429/QuotaExhausted 时才激活 429 异常，若 Playground 为 400 等状态码则保留真实状态码。
   - `tests/test_relay_channel_behavior.mjs`:
     * 增加针对静态源码 400->503 hack 彻底拔除、`_sendErrorResponse` 状态保真、双通道 429 耗尽判定、Build 429 + Playground 400 状态保真的单元测试。
- 状态：施工完成；移交 NEXT_OWNER: moe-debug 进行单测执行与验证。

## 工作区状态
- 交付物变更：
  * `scripts/client/playground-relay.js` (拔除 400->503 hack，实现双通道独立 429 耗尽逻辑)
  * `tests/test_relay_channel_behavior.mjs` (双通道容错与状态保真单测)
  * `memory-bank/agents/moe-code/activeContext.md` (记忆沉淀)
- 状态：业务代码与单测实现完毕，无越权、零环境操作，移交 NEXT_OWNER: moe-debug 进行测试验证。
