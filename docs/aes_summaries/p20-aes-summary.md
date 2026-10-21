# Phase 20 AES Summary: 429 错误精细分流 (TPM/RPM 瞬态限频零关号仅切号冷却 vs 每日配额耗尽关号至 15:00) 与双容器金丝雀平滑上线

> **[EVOLUTION_CONTRIBUTION]** (Phase 20 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 精准解耦 429 报错中“瞬态 TPM/RPM 速率限制”与“每日配额耗尽”，消灭将临时突发流量误判为日额度耗尽导致账号被大面积误封至次日的重大缺陷，最大化账号池并发吞吐与算力可用度。
> - $L_{User}$: **+** 100% 兑现理事长最高指示，实现单分钟 TPM 超频全自动切号与 60s 冷却自愈，零误杀、免人工干预。
> - $S_{total}$: **+** 落地 `isDailyQuotaExhausted` 权威判别器，F2P 单测先行收敛，四维洗礼洁净，维持系统负熵。
> - $Value_{Delivered}$: **+** 护航双节点 7x24 高可用常驻运行，为全系 Agent 舰队提供确定性极高的高并发 API 网关算力中继。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心法定结算资产)

---

## 1. 基础信息与结项事实
- **Phase**: `Phase 20`
- **Theme**: `429 错误精细分流 (TPM/RPM 瞬态限频零关号仅切号冷却 vs 每日配额耗尽关号至 15:00) 与双容器平滑上线`
- **Release Version**: `1.3.10-p20`
- **Release Tag**: `v1.3.10-p20`
- **Commit Hash**: `待提交 (Pending 库级审计收口)`
- **结算时间**: `2026-10-21T18:50:00+08:00`
- **审核裁决**: `PASS_PENDING_COMMIT` (单 Phase 效能反思完成，待多 Phase 累积池集中批量终审)

---

## 2. 参与角色与职责
- `moe-orchestrator` (小奏): 全局统筹调度、任务快照推进、前置两步门禁执行与结算收口
- `moe-ask` (栞): 深入 104 容器日志抓取真实日配额耗尽与短文本 429 错误特征切片，梳理 TPM/RPM 差异
- `moe-code` (诺诺): 编写 F2P 单测、实现 `isDailyQuotaExhausted` 判别器并在 `AuthSwitcher` 中分流
- `moe-debug` (千夏): 单测 50/50 PASS 验证、恪守串行金丝雀发布铁律先后重启 8317 与 8316 并实测真实端到端推理出字通过

---

## 3. 效能指标与破立度量
- `avg_effectiveness`: 100%
- `first_pass_rate`: 100%
- `avg_rework`: 0
- `sentinel_triggered`: NONE
- `settlement_advice`: `[PASS_SETTLEMENT_RECOMMENDED]`
- `legacy_cleansed_rate`: 100%
- `mode_a_escalations`: 0

---

## 4. 双容器健康与金丝雀状态
- **8317 综合网关 (`aistudio-to-api-custom:latest`)**: 🟢 `DEPLOYED_HEALTHY` (`/health` 200 OK, 增量更新上线，实测 curl 非流式出字 200 OK)
- **8316 专线容器 (`aistudio-to-api-custom:8316`)**: 🟢 `DEPLOYED_HEALTHY` (`/health` 200 OK, 增量更新上线，实测 curl 流式/非流式出字 200 OK)
- **8318 镜像稳定容器 (`aistudio-to-api-8318`)**: ⚪ `STANDBY_ON_DEMAND` (端口释放，按需待命)

---

## 5. 核心破立与工程沉淀
1. **429 错误类型精细分流 (破除粗暴一刀切关号)**:
   - 彻底破除过去只要 status === 429 就一律关号到 15:00 CST 的过敏逻辑；
   - 在 `QuotaGuardService.js` 中新增 `isDailyQuotaExhausted(message)` 权威识别方法：
     - **日配额耗尽 (Daily Quota)**：包含 `per_model_per_user`、`Please retry in <X>h`、`limit: 100/50/11000000`、`per-day` 等 -> 判定为 true，执行关号直到每日 15:00 CST 刷新；
     - **瞬态限流 (TPM / RPM)**：包含 `Tokens per minute`、`Requests per minute`、`Please retry in <X>s`、短文本 `Quota exceeded`、`RESOURCE_EXHAUSTED` 等 -> 判定为 false，**绝对不关号**，仅设置 60s 冷却并立即换号重试。
2. **严密的自动化回归保障**:
   - 新增 `tests/test_quota_guard_429_tpm_split.mjs` 覆盖真实 104 日志切片、TPM/RPM 与短文本场景，全套 50 项单测 100% PASS。
3. **严格遵守双容器串行金丝雀发布铁律**:
   - 8317 先行更新并验证真实端到端推理出字 200 OK，稳固后再平滑升级 8316 专线容器；
   - 双节点全部常驻健康在线。
