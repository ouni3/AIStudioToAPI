# 跨项目资产变更留痕档案：mermaid.md 废除并全面由 HTML 原型与工程星图替代记录 (Cross-Pillar Asset Migration Record)

> **归档编号**: 2026-10-21-MERMAID-DEPRECATION-AIStudioToAPI  
> **所属项目**: AIStudioToAPI  
> **操作责任人**: L1 系统进化方案师 (伊织 / moe-architect) 模式 A 亲执  
> **关联提案**: `moe-OR/docs/evolution_proposals/2026-10-21-fleetwide-mermaid-md-deprecation-html-prototype-replacement.md`  
> **记录日期**: 2026-10-21  
> **合规立法依据**: Phase 435 跨项目修改代码库留痕防误删铁律 & 00-evolution-law.md §4.1  

---

## 0. 理事长最高指示原意见原样落盘 (SSOT)

> **[CHAIRMAN_EXPLICIT_AUTHORIZATION]**: 依据《00-evolution-law.md》§4.1，涉及到系统重大核心变更与资产清退，100% 原样落盘理事长三条连续最高指示全文：
> 
> **[CHAIRMAN_ORIGINAL_OPINION]**:
> - **指示一**: `"现在全面废除项目内mermaid md，已经被html原型替代了"`
> - **指示二**: `"清理所有托管项目内的mermaid并留痕"`
> - **指示三**: `"现在的产品原型和工程星图html已经完全取代mermaid"`

---

## 1. 变更背景与第一性原理 (Why)

全系产品交互原型（`docs/prototypes/product_interactive_prototype.html` 等）与项目工程全息骨架星图（`docs/prototypes/project_engineering_atlas.html`）已具备人机同源微晶全息展示能力（SSR 级秒开、自包含、支持真实交互与拓扑视口），在直观手感与工程透视上全面碾压并 100% 取代了旧的纯文本 `mermaid.md`。

依据理事长连续三次最高指示：
1. 本项目全面废除 `memory-bank/mermaid.md` 资产，严禁再次引入或生成；
2. `memory-bank/` 核心神谕资产收敛为 6 大法定白名单（`productContext.md`, `systemPatterns.md`, `plan.md`, `profit.md`, `assets.md`, `aes-history.md`，可选 `engineering-atlas.json`）；
3. 项目架构透视与体验验证完全收敛至工程全息星图 HTML 与产品交互原型 HTML。

---

## 2. 变更资产清单与状态

- **废除资产**: `memory-bank/mermaid.md` (已彻底清空/清零)
- **法定替代**: `docs/prototypes/project_engineering_atlas.html` & 产品交互原型 HTML
- **CI 白名单状态**: 已收敛，不再要求 `mermaid.md` 必须在场
