# 跨项目资产归档与废除留痕档案：Mermaid.md 废除与 HTML 原型全面替代记录 (Asset Deprecation & Migration Record)

> **归档编号**: 2026-10-21-MERMAID-DEPRECATION-AIStudioToAPI
> **操作责任人**: L1 系统进化总师 伊织 (moe-architect) 模式 A 亲执
> **记录日期**: 2026-10-21
> **合规立法依据**: Phase 435 跨项目修改代码库留痕防误删铁律 & 00-evolution-law.md §4.1

---

## 0. 理事长最高指示与原意见原样落盘 (SSOT)

> **[CHAIRMAN_EXPLICIT_AUTHORIZATION]**: 依据理事长针对废除项目内 mermaid.md、全面以 HTML 原型和工程星图替代的最高指示执行全系清理与留痕归档。
> **[CHAIRMAN_ORIGINAL_OPINION]**:
> - **指示一**: `"现在全面废除项目内mermaid md，已经被html原型替代了"`
> - **指示二**: `"清理所有托管项目内的mermaid并留痕"`
> - **指示三**: `"现在的产品原型和工程星图html已经完全取代mermaid"`

---

## 1. 废除动因与第一性原理 (Why)

1. **替代体系已 100% 完备成熟**:
   - **宏观工程星图**: 全系标配单文件微晶 HTML《项目工程全息骨架与慢车道状态图谱》（`docs/prototypes/project_engineering_atlas.html`），内嵌结构化 SSOT Manifest (≤3500 Tokens)，为 L1 架构层与外部 AI 评审提供秒级直读与 AST 依赖全息透视；
   - **微观交互原型**: 各业务项目以产品交互原型（`docs/prototypes/*.html`）为核心驱动，100% 提供真机可把玩、无障碍测试与沉浸式体验打磨，彻底淘汰以往文本 Mermaid 图表的低效与假自洽；
2. **消灭长存废余资产，维持系统负熵 (Negentropy)**:
   - 旧 `memory-bank/mermaid.md` 长期处于静态失修、格式繁重状态，徒增大模型注意力氧化与 4096 Token 红线消耗；
   - 彻底将 `mermaid.md` 移出 `memory-bank/` 核心神谕区并归档，实现物理减熵，保护大模型上下文纯洁度。

---

## 2. 归档与替代资产清单 (Eradicated & Replaced Assets)

- **已移出神谕区并归档资产**:
  - 原路径: `memory-bank/mermaid.md`
  - 现归档路径: `docs/archive/mermaid_legacy_archive_20261021/mermaid.md` (本目录)
- **法定替代 SSOT 资产**:
  - ⓪ 全景工程星图: `docs/prototypes/project_engineering_atlas.html`
  - ① 核心产品交互原型: `docs/prototypes/*.html`
