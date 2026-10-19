# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 15 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 拔除 relay 400 强行改写 503 的降级伪装，消除账号池虚假 503 雪崩并实现真实 400/429 状态码精准透传。
> - $L_{User}$: **+** Build 与 Playground 双通道独立配额容错，只有双通道配额均耗尽时才激活 429 物理熔断，单通道受限自动无缝回退，人工排障损耗降为 0。
> - $S_{total}$: **+** 物理擦除 400->503 hack 代码与临时降级分支，统一代理错误状态码上抛语义，维持负熵。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=update_project_engineering_atlas confidence=95% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **客户端 400 隔离与跨账号同签名早停保真模式**: 本地客户端 400 参数错误入口拦截且 `skipAccountSwitch = true`；对于 Google 上游 400 代理错误，虽允许即时切号自愈，但若同一请求在 ≥3 个不同账号 (`CROSS_ACCOUNT_400_EARLY_STOP_THRESHOLD = 3`) 均返回完全相同的错误签名，则判定为请求级(payload)错误，立即早停终止切号穷举并保真上抛原始 400，严禁盲目遍历全池或伪装为 503。
2. **切号防抖与冷却惩罚机制 (Debounce & Cooldown)**: `AuthSwitcher` 内置 `minSwitchIntervalMs` (默认 5s) 防止常规自愿轮换高频震荡；故障时打上 `accountCooldownMap` 惩罚标记 (默认 60s)。故障切号必须强制豁免防抖铁律：`switchToNextAuth(options)` 必须支持 `{ force: true }` / `{ ignoreDebounce: true }`——由 403/429/5xx 等故障发起切号时当前账号已损坏并进入 cooldown，必须强制绕过 `minSwitchIntervalMs`，严禁因防抖将请求滞留在坏账号上。
3. **双通道配额独立与 429 配额错误不被 400 掩盖契约**: Build 通道与 Playground 网页通道协同。在 auto 模式下首选 Build；仅在遇到 403/Permission 权限不足时才置 `this.buildChannelBlocked = true` 永久降级（429 属瞬态配额耗尽，绝不能永久停用 Build 通道）。当 Build 返回 429/Quota 降级 Playground 时，若 Playground 抛出任何异常（含 400/5xx），最终抛出的状态码必须强制保留为 429 并携带 quota 特征信息，严禁被 Playground 400 掩盖，确保网关 QuotaGuardService 精准触发 2 小时熔断与即时切号。
4. **双通道工具声明编码契约 (Build/Playground Wire, kilocode 400 根因修复)**: Build 通道 Gemini REST 函数声明必须仅保留 `parametersJsonSchema`（`parameters` 与之互斥，Google 400 报 `parameters_json_schema must not be set when parameters is set`），归一化含 null 键清除与 `{}`/`true` → `{"type":"object"}`；Playground 通道函数声明走 proto 位置数组（`generate[6]=[null,[[name,desc,paramsWire]]]`，paramsWire `[0]`typeCode…`[7]`required），位置数组无法表达的开放 schema 特征（如 `additionalProperties`）回退追加到 parameters wire`[2]` description：`\nArguments must follow this JSON Schema: ` + JSON.stringify(raw)。
5. **账号启用/停用与轮询调度隔离模式**: `AuthSource` 跟踪 `disabledIndices` 与 `disabledUntilMap`，在 `_buildRotationIndices()` 中将已停用账号与已过期账号一并从 `rotationIndices` 中彻底剔除，并在 `AuthSwitcher.switchToSpecificAuth()` 中拦截对停用账号的手动切号；在停用当前正在使用的账号时平滑触发 `_switchToNextAuth()` 切号并安全释放旧 Context。
6. **单元测试纯内存隔离与防脏文件模式**: 测试 `AuthSource` / `AuthSwitcher` 行为时，通过重写 `_discoverAvailableIndices` 和 `_getAuthContent` 构造纯内存 mock 数据源，杜绝在工作区产生临时脏文件与污染现有 `configs/auth` 磁盘目录。
7. **双轨配额恢复与人治隔离铁律 (Dual-Channel Restoration & Manual Ban Invariance)**:
   - 通道 A：2小时到期自动恢复（巡检 `disabledUntil` 到期解封）；
   - 通道 B：每日北京时间 15:00 CST 统一重置兜底；
   - 铁律约束：仅解封 `disabledReason === 'quota_exhausted'` 的账号，严禁恢复人治手动停用的账号（`disabledReason !== 'quota_exhausted'`）。
8. **Firefox Camoufox Xray 隔离穿透与鸭子类型适配模式**: Playwright+Firefox 在 `addInitScript` 中受 Xray 隔离，普通 `window` 看不到页面 main world 定义的 expando 全局变量（如 `default_MakerSuite`）；必须通过 `window.wrappedJSObject || window` 获取 `pageWindow`，且对跨 world 传入的 `Headers`/`Request` 严禁使用脆弱的 `instanceof`，必须统一通过 `typeof forEach === 'function'` / `entries` / `get` 鸭子类型提取。

## 当前进展 (Active Phase)
1. **项目工程全息骨架星图增量刷新 (Phase 17 收口与双节点加固)**:
   - `docs/prototypes/project_engineering_atlas.html`:
     * 内嵌 `ssot-engineering-manifest` 增量刷新：`release_tag` 更新为 `v1.3.7-p17`，`commit_hash` 记录为 `ca8a5c0`，`e2e_pass_rate` 对齐 `100% (48/48 PASS)`。
     * 核心工程骨架 L_DOMAIN 补齐 `AuthSwitcher.js` (400 早停阈值 3)、`QuotaGuardService.js` (429 速率守卫与 2 小时熔断解封)、`PlaygroundRelay` (429 配额保真与双通道平权)。
     * 破立对账清单 Built 记录 400 早停机制、429 配额保真、2 小时熔断与 48 项测试集；Eradicated 记录 429 掩盖漏洞拔除、buildChannelBlocked 误标清退与 400->503 篡改拔除。
     * 页面前端视效卡片与双主题切换机制保持 100% 同步且 JSON Manifest 严格合法。
- 状态：施工完成；移交 NEXT_OWNER: moe-debug 进行验证。

## 工作区状态
- 交付物变更：
  * `docs/prototypes/project_engineering_atlas.html` (全息工程骨架图谱与 SSOT Manifest 增量刷新)
  * `memory-bank/agents/moe-code/activeContext.md` (记忆沉淀与当期进展更新)
- 状态：单文件微晶 HTML 施工完成，严格遵循 SSR 模式标准与预算限制，移交 NEXT_OWNER: moe-debug。
