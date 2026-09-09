# Active Context: moe-orchestrator

> **[EVOLUTION_CONTRIBUTION]** (Phase 2 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 统筹协调 AIStudioToAPI 稳定性修复、标准化改造与 SR 等级跃迁，确保核心算力网关高可用。
> - $L_{User}$: **+** 自动化排查与降维派单，降低责任主体排障认知负担。
> - $S_{total}$: **+** 规范上下文生命周期与任务激活快照，维持系统负熵。
> - $Value_{Delivered}$: **+** 护航 API 网关稳定服务，保障下游业务持续可用。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 1. 当前会话状态 (Current Session State)
- **Active Phase**: `Phase 5 (CI/CD Gates Convergence: G1, G2, G3, G6, G10 Compliance 100%)`
- **Task Goal**: Phase 5 完整结算闭环与全量 CI/CD 缺陷门禁 100% 达标就绪。
- **Status**: [PHASE_5_SETTLED_PENDING_COMMIT|v1.3.5-p5|CI=PASS|DevState=100.0%|AuditExpert=PASS_PENDING_AUDIT|2026-09-09T12:20:00+08:00]

## 2. 核心架构与编排经验 (Orchestration Insights)
1. **统计筛选固定时间窗口**: 自定义时间范围收敛为最近经过的 15:00 至次日 15:00，保持全局 24 小时对齐。
2. **Thinking-Only 兜底契约**: 当模型仅输出 thought/reasoning 且未输出正文时注入 Mock，防止下游客户端空白。
3. **多协议状态机统一**: OpenAI SSE 流、Claude SSE 流、OpenAI Response API 及 Gemini Native 均统一触发 Mock 补齐。
4. **基础设施三件套与远程按需化**: 统一在 `scripts/dev/` 沉淀运维工具，结合 `remote_8318.sh` 实现备用节点按需秒级拉起与停止。
5. **双节点状态感知健康检查**: 8317 主节点强校验 HTTP 200，8318 冷备节点在端口未监听时识别为 `[STANDBY]` 合规放行，避免误报。
6. **轻量化 CI 门禁矩阵**: 在 Node.js 仓库引入标准 Python CI 门禁（Canary 校验、ECT 格式断言、ADVG 部署物对齐与 AES 总结校验），通过 `npm run verify` 实现 100% 自动化闭环。
7. **DevState 探针 100% 合规闭环**: 精准对齐全景控制台 10 大门禁抽取规则，通过零依赖脚本实现 G1 (Token限制)、G2 (Memory-Bank纯净度)、G3 (Git Gate工作流)、G6 (UI对比度) 与 G10 (重构文档同步)，消除所有 UNWIRED 债务。
