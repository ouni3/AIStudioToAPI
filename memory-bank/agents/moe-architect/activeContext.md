# Active Context: moe-architect

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 架构师上下文维护，记录双容器部署模式与 403/404 自愈系统设计。
> - $L_{User}$: **+** 精准沉淀系统模式与资产拓扑，降维排障与演进设计复杂度。
> - $S_{total}$: **0** 严格控制体积（≤ 50 行），遵循负熵流原则。
> - $Value_{Delivered}$: **+** 护航核心算力网关的架构确定性。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

## 1. 焦点与当前任务 (Focus & Active Task)
- **项目**: `AIStudioToAPI`
- **活跃 Phase**: `Phase 1 (Dual-Container Refactoring & Memory-Bank Setup)`
- **职责范围**: Tier 0/1/2 核心架构资产设计、双容器部署模式规范化与 Memory-Bank 7 大白名单文件建库。

## 2. 架构决策与拓扑记录 (Architectural Decisions)
- `[ARCH_DECISION_01]`: 固化 104 局域网服务器 (192.168.0.104) 双容器主备部署模式：
  - 8317: `aistudio-to-api` (基于最新源码与 UI dist 构建的定制容器，内置 403 即时切号与 404 模型清洗兜底)
  - 8318: `aistudio-to-api-8318` (基于社区稳定镜像的基准回退容器)
- `[ARCH_DECISION_02]`: 设计 403 区域风控秒级换号 (`_isImmediateSwitchStatus`) 与 404 畸形路径防护状态机，根治代理死锁。
- `[ARCH_DECISION_03]`: 建立 memory-bank 7 大核心白名单资产 (`productContext.md`, `systemPatterns.md`, `plan.md`, `profit.md`, `assets.md`, `aes-history.md`, `mermaid.md`)，全部达成 ECT-S 评级与 4096 Token 红线合规。

(End of file - total 26 lines)
