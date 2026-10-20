# Phase 19 AES Summary: 429 配额用尽熔断升级为直接关闭直到每日 15:00 CST 刷新时间与双容器平滑上线

> **[EVOLUTION_CONTRIBUTION]** (Phase 19 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 将 429 配额用尽熔断由固定 2 小时升级为严格锁定直到每日 15:00 CST 刷新时间（Until-Refresh），彻底消灭超频账号在同一日重置前被提前放行再次引发 429 报错的算力损耗。
> - $L_{User}$: **+** 100% 兑现理事长最高指示，超额账号全自动关闭并精准在 15:00 CST 统一定时解封，免除任何人工开关干预与排障负担。
> - $S_{total}$: **+** 物理拔除写死的 2 小时逻辑 (`banDurationMs = 2 * 3600 * 1000`) 与遗留文档描述，F2P 单测先行收敛，单期旧逻辑 `LEGACY_REF_COUNT == 0`，维持系统负熵。
> - $Value_{Delivered}$: **+** 护航双节点 (8317 综合网关与 8316 专线) 7x24 高可用常驻运行，为全系 Agent 舰队提供确定性极高的 API 网关算力中继。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心法定结算资产)

---

## 1. 基础信息与结项事实
- **Phase**: `Phase 19`
- **Theme**: `429 配额用尽熔断升级为直接关闭直到每日 15:00 CST 刷新时间与双容器平滑上线`
- **Release Version**: `1.3.8-p19`
- **Release Tag**: `待打标 (Pending Multi-Phase Cumulative Audit Pool)`
- **Commit Hash**: `待提交 (Pending Multi-Phase Cumulative Audit Pool)`
- **Staged / Audited Tree Hash**: `ad2787f2411f9c50c1ad195d79501c66f848b392`
- **结算时间**: `2026-10-20T16:15:00+08:00`
- **审核裁决**: `PASS_PENDING_COMMIT` (单 Phase 效能反思完成，待多 Phase 累积池集中批量终审)

---

## 2. 参与角色与职责
- `moe-orchestrator` (小奏): 全局统筹调度、任务快照推进、前置两步门禁执行与结算收口
- `moe-ask` (栞): 探路勘测 429 捕获坐标、关号时长计算与每日 15:00 CST 刷新机制物理坐标
- `moe-code` (诺诺): 编写 F2P 单测、实现 `getNextResetTimestamp` 权威源、拔除 2 小时旧逻辑并同步文案
- `moe-debug` (千夏): 单测 49/49 PASS 验证、断言 `LEGACY_REF_COUNT == 0`、恪守串行金丝雀发布铁律先后重启 8317 与 8316 并实测端到端 curl 出字通过

---

## 3. 效能指标与破立度量
- `avg_effectiveness`: 100%
- `first_pass_rate`: 100%
- `avg_rework`: 0
- `sentinel_triggered`: NONE
- `settlement_advice`: `[PASS_SETTLEMENT_RECOMMENDED]`
- `legacy_cleansed_rate`: 100% (`LEGACY_REF_COUNT == 0`)
- `mode_a_escalations`: 0

---

## 4. 双容器健康与金丝雀状态
- **8317 综合网关 (`aistudio-to-api-custom:latest`)**: 🟢 `DEPLOYED_HEALTHY` (`/health` 200 OK, 增量更新上线，实测 curl 流式出字 `8317 CANARY OK` 200 OK)
- **8316 专线容器 (`aistudio-to-api-custom:8316`)**: 🟢 `DEPLOYED_HEALTHY` (`/health` 200 OK, 增量更新上线，实测 curl 流式出字 `8316 CANARY OK` 200 OK)
- **8318 镜像稳定容器 (`aistudio-to-api-8318`)**: ⚪ `STANDBY_ON_DEMAND` (端口释放，按需待命)

---

## 5. 核心破立与工程沉淀
1. **429 熔断 Until-Refresh 机制权威收敛**:
   - 在 `src/core/QuotaGuardService.js` 中新增权威源 `getNextResetTimestamp(nowDate)`，基于北京时间 (UTC+8) 精准计算下一个 15:00:00 CST 时间戳（若当前时间未达 15:00 则为今日 15:00，已满 15:00 则为次日 15:00，`diff` 保底 1000ms）；
   - 彻底将 `handleQuota429` 与 `_triggerQuotaExhausted` 赋值点迁移至 `getNextResetTimestamp()`；
   - `src/auth/AuthSwitcher.js` 镜像该算法保障 fallback 路径语义一致。
2. **彻底拔除 2 小时旧逻辑 (LEGACY_REF_COUNT == 0)**:
   - 彻底拔除写死的 `banDurationMs = 2 * 3600 * 1000` 与全部消费点；
   - 国际化文案 (`ui/locales/en.json`) 与相关日志完全对齐为 `next daily 15:00 (UTC+8) quota refresh`；
   - 单期旧符号引用全面清零。
3. **严格遵守双容器串行金丝雀发布铁律**:
   - 8317 节点先行更新并验证真实 Bearer 鉴权端到端流式出字 200 OK；
   - 定型放行后 8316 专线容器平滑重启并验证真实出字 200 OK；
   - 双节点全部常驻健康在线。
