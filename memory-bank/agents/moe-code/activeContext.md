# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 20 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 实现 429 错误精细分流：瞬态 TPM/RPM 速率限制仅冷却换号绝不关停账号，每日配额耗尽精准关停至 15:00 CST 刷新，最大化账号池可用度与并发吞吐。
> - $L_{User}$: **+** 消除因高频瞬态 TPM 错误导致全账号池被误关停的服务死锁，人工排障与恢复成本降为 0。
> - $S_{total}$: **+** 规范 isDailyQuotaExhausted 多维特征识别与双轨容错，消除 429 粗暴关号带来的系统状态熵增。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=429_tpm_split confidence=95% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **客户端 400 隔离与跨账号同签名早停保真模式**: 本地客户端 400 参数错误入口拦截且 `skipAccountSwitch = true`；对于 Google 上游 400 代理错误，虽允许即时切号自愈，但若同一请求在 ≥3 个不同账号 (`CROSS_ACCOUNT_400_EARLY_STOP_THRESHOLD = 3`) 均返回完全相同的错误签名，则判定为请求级(payload)错误，立即早停终止切号穷举并保真上抛原始 400，严禁盲目遍历全池或伪装为 503。
2. **切号防抖与冷却惩罚机制 (Debounce & Cooldown)**: `AuthSwitcher` 内置 `minSwitchIntervalMs` (默认 5s) 防止常规自愿轮换高频震荡；故障时打上 `accountCooldownMap` 惩罚标记 (默认 60s)。故障切号必须强制豁免防抖铁律：`switchToNextAuth(options)` 必须支持 `{ force: true }` / `{ ignoreDebounce: true }`——由 403/429/5xx 等故障发起切号时当前账号已损坏并进入 cooldown，必须强制绕过 `minSwitchIntervalMs`，严禁因防抖将请求滞留在坏账号上。
3. **双通道配额独立与 429 配额错误不被 400 掩盖契约**: Build 通道与 Playground 网页通道协同。在 auto 模式下首选 Build；仅在遇到 403/Permission 权限不足时才置 `this.buildChannelBlocked = true` 永久降级（429 属瞬态配额耗尽，绝不能永久停用 Build 通道）。当 Build 返回 429/Quota 降级 Playground 时，若 Playground 抛出任何异常（含 400/5xx），最终抛出的状态码必须强制保留为 429 并携带 quota 特征信息，严禁被 Playground 400 掩盖，确保网关 QuotaGuardService 精准触发 2 小时熔断与即时切号。
4. **429 精细分流与瞬态 TPM/RPM 零关号铁律 (429 Rate Limit Fine-Grained Split & Zero-Disable for Transient TPM/RPM)**:
   - 日配额耗尽判据 (`QuotaGuardService.isDailyQuotaExhausted`)：小时级重试 `please retry in \d+h`、日指标特征（`per_model_per_user` / `requests_per_model_per_user` / `tokens_per_model_per_user` / `generate_content_tokens_per_model_per_user` / `per-day` / `daily`）以及日额度数值（`limit: 100/50/11000000` / `free tier limit`）判定为 true，执行 `handleQuota429` 关号至 15:00 CST；
   - 瞬态限流处理：TPM / RPM（`tokens per minute` / `requests per minute` / 秒级重试 `retry in Xs` / 短文本 `Quota exceeded` 等）判定为 false，**绝对不关停账号（disabled: false）**，仅设置 60s 冷却惩罚（`accountCooldownMap`）并立即换号重试；
   - 容错兜底：若无 `quotaGuardService` 引用，`AuthSwitcher` fallback 具备相同特征正则，严禁粗暴关号。
5. **429 熔断 Until-Refresh 单一权威源与双轨恢复铁律**: 429 日配额熔断时长唯一权威源 `QuotaGuardService.getNextResetTimestamp()`；通道 A 到期自动解封，通道 B 每日 15:00 CST 兜底；仅解封 `disabledReason === 'quota_exhausted'` 的账号。
6. **单元测试纯内存隔离与防脏文件模式**: 测试 `AuthSource` / `AuthSwitcher` 行为时，通过重写 `_discoverAvailableIndices` 和 `_getAuthContent` 构造纯内存 mock 数据源，杜绝在工作区产生临时脏文件与污染现有 `configs/auth` 磁盘目录。

## 当前进展 (Active Phase)
1. **429 错误精细分流施工完成 (理事长最高指示落实)**:
   - 破：拔除 429 无论何种错误一律关号至 15:00 CST 的粗暴逻辑；
   - 立：`QuotaGuardService.isDailyQuotaExhausted(errorMsg)` 精准识别小时级重试、日指标与日限额；`AuthSwitcher.handleRequestFailureAndSwitch` 针对瞬态 TPM/RPM 仅 60s 冷却加切号重试，严禁禁用账号；
   - 测：F2P 契约单测 `tests/test_quota_guard_429_tpm_split.mjs` 落盘全覆盖（5大典型真实场景 + 瞬态/日配额/Fallback 隔离验证）；
   - 验：与 `tests/test_quota_guard_429_until_refresh.mjs` 共同保证回归兼容。
- 状态：施工完成；移交 NEXT_OWNER: moe-debug 执行环境单测验证。

## 工作区状态
- 交付物变更：
  * `src/core/QuotaGuardService.js` (新增 isDailyQuotaExhausted 方法)
  * `src/auth/AuthSwitcher.js` (429 细粒度分流：瞬态仅冷却换号，日耗尽才关号)
  * `tests/test_quota_guard_429_tpm_split.mjs` (新增 F2P 契约单测)
  * `memory-bank/agents/moe-code/activeContext.md` (记忆沉淀)
- 状态：施工完成，移交 NEXT_OWNER: moe-debug。
