# Agent Effectiveness Snapshot History: aistudio-to-api

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀 Phase 级 Agent 协作效能、首通率与算力消耗数据，提供进化度量基准。
> - $L_{User}$: **+** 自动化归集效能报表，无需人工统计任务投入，降低认知负荷。
> - $S_{total}$: **+** 维护规范 AES 历史窗口（单文件 ≤ 4000 Tokens / 16000 字符），保持系统精简负熵。
> - $Value_{Delivered}$: **+** 反馈优化多智能体派发网络，加速后续 API 网关功能演进。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心 memory-bank 资产)

## 1. 历史归档索引 (Historical Archive Index)
- Phase 1~13 详细总结已按 FIFO 归档至 `docs/aes_summaries/p{N}-aes-summary.md`，此处保持最近 6 期热窗口记录（≤ 4000 Tokens / 16000 字符）。

---

## 2. Phase 14 效能快照 (AES Summary)

### [AES_SUMMARY_P14]
- **Phase**: `Phase 14 (废除100次调用上限、429物理关号2小时与UI文案对齐)`
- **结算时间**: `2026-10-05T14:40:00+08:00`
- **主要参与 Agent**: `moe-orchestrator`, `moe-code`, `frontend`, `moe-debug`
- **效能指标**: `avg_effectiveness`: 100%, `first_pass_rate`: 100%, `avg_rework`: 0, `sentinel_triggered`: NONE
- **核心沉淀**: 废除机械调用上限，以真实 429 作为关号信号，建立通道 A (2h) 与通道 B (15:00) 双轨自愈机制。

---

## 3. Phase 15 效能快照 (AES Summary)

### [AES_SUMMARY_P15]
- **Phase**: `Phase 15 (8316/8317物理凭据与统计口径绝对隔离与8317独立部署)`
- **结算时间**: `2026-10-10T18:00:00+08:00`
- **主要参与 Agent**: `moe-orchestrator`, `moe-architect`, `moe-debug`
- **效能指标**: `avg_effectiveness`: 100%, `first_pass_rate`: 100%, `avg_rework`: 0, `sentinel_triggered`: NONE
- **核心沉淀**: 彻底消除双容器共享数据卷串线隐患，将 8316 与 8317 挂载目录物理隔离，实现完全独立的存储与生命周期管理。

---

## 4. Phase 16 效能快照 (AES Summary)

### [AES_SUMMARY_P16]
- **Phase**: `Phase 16 (双通道中继架构支持(Playground+Build)与8316专线独立部署)`
- **结算时间**: `2026-10-15T15:20:00+08:00`
- **主要参与 Agent**: `moe-orchestrator`, `moe-architect`, `moe-code`, `moe-debug`
- **效能指标**: `avg_effectiveness`: 98.0%, `first_pass_rate`: 0%, `avg_rework`: 0, `sentinel_triggered`: NONE
- **核心沉淀**: 支持 Playground 与 Build 双通道中继，解决 400 INVALID_ARGUMENT 阻断，支持完整工具调用；8316 专线容器独立部署。

---

## 5. Phase 17 效能快照 (AES Summary)

### [AES_SUMMARY_P17]
- **Phase**: `Phase 17 (8317 综合网关 400 根治与双通道架构平权升级及金丝雀上线)`
- **结算时间**: `2026-10-18T16:25:00+08:00`
- **主要参与 Agent**: `moe-orchestrator`, `moe-architect`, `moe-debug`, `audit`, `audit_p0`
- **效能指标**: `avg_effectiveness`: 95.0%, `first_pass_rate`: 0%, `avg_rework`: 0, `sentinel_triggered`: NONE
- **核心沉淀**: 解耦上游代理 400 异常与客户端入参错误，遇 Google 远端 400 顺畅触发换号自愈重试；8317 综合网关轻量增量重建平滑上线。

---

## 6. Phase 18 效能快照 (AES Summary)

### [AES_SUMMARY_P18]
- **Phase**: `Phase 18 (8316/8317 双节点 400 早停守卫与 429 配额保真平权升级及金丝雀上线)`
- **结算时间**: `2026-10-19T16:26:00+08:00`
- **主要参与 Agent**: `moe-orchestrator`, `audit`, `audit_p0`, `moe-code`, `moe-debug`
- **效能指标**: `avg_effectiveness`: 100%, `first_pass_rate`: 100%, `avg_rework`: 0, `sentinel_triggered`: NONE
- **核心沉淀**: 落地跨账号同签名 400 早停守卫 (`CROSS_ACCOUNT_400_EARLY_STOP_THRESHOLD = 3`)；彻底修复 Build 429 被降级 400 掩盖漏洞，状态码保真并精准激活 2 小时熔断与切号；收敛 `buildChannelBlocked` 仅在 403 权限不足时生效；8316 与 8317 串行金丝雀独立升级上线，全套 48 项测试 100% PASS。

---

## 7. Phase 19 效能快照 (AES Summary)

### [AES_SUMMARY_P19]
- **Phase**: `Phase 19 (429 配额用尽熔断升级为直接关闭直到每日 15:00 CST 刷新时间与双容器平滑上线)`
- **结算时间**: `2026-10-20T16:15:00+08:00`
- **主要参与 Agent**:
  - `moe-orchestrator` (小奏): 全局统筹调度、任务快照推进、前置两步门禁执行与结算收口
  - `moe-ask` (栞): 探路勘测 429 捕获坐标、关号时长计算与每日 15:00 CST 刷新机制物理坐标
  - `moe-code` (诺诺): 编写 F2P 单测、实现 `getNextResetTimestamp` 权威源、拔除 2 小时旧逻辑并同步文案
  - `moe-debug` (千夏): 单测 49/49 PASS 验证、断言 `LEGACY_REF_COUNT == 0`、恪守串行金丝雀发布铁律先后重启 8317 与 8316 并实测端到端 curl 出字通过
  - `audit` (克莱尔): 关卡 1 Caller DX 微观体验走查与双档案审查 (`CLAIRE_VERDICT: PASS_p19`)
  - `audit_p0` (经济师总监): 关卡 2.1a 商业生命周期与微账本宏观评估 (`AUDIT_P0_VERDICT: PASS`)
- **效能指标**:
  - `avg_effectiveness`: 100%
  - `first_pass_rate`: 100%
  - `avg_rework`: 0
  - `sentinel_triggered`: NONE
  - `settlement_advice`: `[PASS_SETTLEMENT_RECOMMENDED]`
- **双容器健康状态**:
  - 8317 综合网关 (`aistudio-to-api-custom:latest`): 🟢 `DEPLOYED_HEALTHY` (`/health` 200 OK, 增量更新上线，实测 curl 流式出字 `8317 CANARY OK` 200 OK)
  - 8316 专线容器 (`aistudio-to-api-custom:8316`): 🟢 `DEPLOYED_HEALTHY` (`/health` 200 OK, 增量更新上线，实测 curl 流式出字 `8316 CANARY OK` 200 OK)
  - 8318 镜像稳定容器 (`aistudio-to-api-8318`): ⚪ `STANDBY_ON_DEMAND` (按需常驻待命)
- **核心沉淀**: 彻底拔除写死的 2 小时 429 熔断限制 (`banDurationMs = 2 * 3600 * 1000`)，新增 `getNextResetTimestamp` 权威时间源，统一将 429 账号直接关闭直到每日北京时间 15:00 CST 刷新时间；`AuthSwitcher` fallback 路径同等对齐，旧逻辑与文案引用全面清零（`LEGACY_REF_COUNT == 0`）；全量 49 项单测 100% PASS；恪守双容器串行金丝雀发布铁律，8317 综合网关先行构建更新并验证业务出字 200 OK，定型后 8316 专线容器平滑重启并验证业务出字 200 OK，双节点均已健康上线。
