# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 14 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 废除机械 100 次使用关闭账号旧逻辑，实现真实 429 RESOURCE_EXHAUSTED 物理关闭账号 2 小时 + 双轨（到期/15:00 CST）自愈，释放健康算力。
> - $L_{User}$: **+** 彻底消除账号在配额充裕时因满 100 次误停用的异常断流，网关自动换号与到期恢复全自托管，人工介入降为 0。
> - $S_{total}$: **+** 统一 8316 与 8317 端口 flash 系列目标模型匹配规则与 429 熔断时延规范，消除跨端口非对称行为。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=fix_playground_wire_encoder_prettier_formatting confidence=95% hits=2/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **客户端 400 错误与切号状态机隔离**: 400 及 4xx 客户端参数错误（排除 403 区域/权限及 429 限频）严禁增加 `failureCount` 或触发 `switchToNextAuth`，在入口处即时拦截并设置 `skipAccountSwitch = true`，杜绝畸形请求击穿账号池。
2. **切号防抖与冷却惩罚机制 (Debounce & Cooldown)**: `AuthSwitcher` 内置 `minSwitchIntervalMs` (默认 5s) 防止常规自愿轮换高频震荡；故障时打上 `accountCooldownMap` 惩罚标记 (默认 60s)。故障切号必须强制豁免防抖铁律：`switchToNextAuth(options)` 必须支持 `{ force: true }` / `{ ignoreDebounce: true }`——由 403/429/5xx 等故障发起切号时当前账号已损坏并进入 cooldown，必须强制绕过 `minSwitchIntervalMs`，严禁因防抖将请求滞留在坏账号上。
3. **双通道工具声明编码契约 (Build/Playground Wire, kilocode 400 根因修复)**: Build 通道 Gemini REST 函数声明必须仅保留 `parametersJsonSchema`（`parameters` 与之互斥，Google 400 报 `parameters_json_schema must not be set when parameters is set`），归一化含 null 键清除与 `{}`/`true` → `{"type":"object"}`；Playground 通道函数声明走 proto 位置数组（`generate[6]=[null,[[name,desc,paramsWire]]]`，paramsWire `[0]`typeCode…`[7]`required），位置数组无法表达的开放 schema 特征（如 `additionalProperties`）回退追加到 parameters wire`[2]` description：`\nArguments must follow this JSON Schema: ` + JSON.stringify(raw)。
4. **账号启用/停用与轮询调度隔离模式**: `AuthSource` 跟踪 `disabledIndices` 与 `disabledUntilMap`，在 `_buildRotationIndices()` 中将已停用账号与已过期账号一并从 `rotationIndices` 中彻底剔除，并在 `AuthSwitcher.switchToSpecificAuth()` 中拦截对停用账号的手动切号；在停用当前正在使用的账号时平滑触发 `_switchToNextAuth()` 切号并安全释放旧 Context。
5. **单元测试纯内存隔离与防脏文件模式**: 测试 `AuthSource` / `AuthSwitcher` 行为时，通过重写 `_discoverAvailableIndices` 和 `_getAuthContent` 构造纯内存 mock 数据源，杜绝在工作区产生临时脏文件与污染现有 `configs/auth` 磁盘目录。
6. **双轨配额恢复与人治隔离铁律 (Dual-Channel Restoration & Manual Ban Invariance)**:
   - 通道 A：2小时到期自动恢复（巡检 `disabledUntil` 到期解封）；
   - 通道 B：每日北京时间 15:00 CST 统一重置兜底；
   - 铁律约束：仅解封 `disabledReason === 'quota_exhausted'` 的账号，严禁恢复人治手动停用的账号（`disabledReason !== 'quota_exhausted'`）。
7. **配额计数闭环晚绑定与成功二值化门禁**: 配额统计 `quotaGuard.recordRequest()` 仅作为遥测指标，严禁用于机械关停账号；仅在 `_finalizeTrackedRequest` 确认成功时晚绑定计数。

8. **Firefox Camoufox Xray 隔离穿透与鸭子类型适配模式**: Playwright+Firefox 在 `addInitScript` 中受 Xray 隔离，普通 `window` 看不到页面 main world 定义的 expando 全局变量（如 `default_MakerSuite`）；必须通过 `window.wrappedJSObject || window` 获取 `pageWindow`，且对跨 world 传入的 `Headers`/`Request` 严禁使用脆弱的 `instanceof`，必须统一通过 `typeof forEach === 'function'` / `entries` / `get` 鸭子类型提取。

## 当前进展 (Active Phase)
1. **Prettier 格式规范修复 (无语义调整)**:
   - `src/relay/playground-wire-encoder.js`:
     * 第 671 行 `relaySetWireField` 参数表达式超过 `printWidth: 120`（实际 121 字符），按 Prettier 4 空格标准折行拆分参数，无语义变更。
- 状态：施工完成；T3 执行手无 bash 权限，移交 NEXT_OWNER: moe-debug 进行 `npx eslint src/relay/playground-wire-encoder.js` 最终验证。

## 工作区状态
- 交付物变更：
  * `src/relay/playground-wire-encoder.js` (第 671 行 Prettier 折行格式修复)
  * `memory-bank/agents/moe-code/activeContext.md` (记忆沉淀)
- 状态：纯业务代码格式调整完毕，无盲搜、零逻辑改动、零环境污染，移交 NEXT_OWNER: moe-debug 进行环境验证。
