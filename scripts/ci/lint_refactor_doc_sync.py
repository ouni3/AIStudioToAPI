#!/usr/bin/env python3
"""
lint_refactor_doc_sync.py — G10_REFACTOR_DOC_SYNC 门禁: 检查重构阶段时架构文档 (systemPatterns.md) 是否同步更新
SSOT: rules/or-rules.md §or-02d
契约:
1. 识别当前 Phase 主题或目标是否包含重构关键词 (refactor, 重构, restructure, decouple, 解耦, architecture, redesign)。
2. 若命中重构条件，断言 systemPatterns.md 存在且具有架构模式与演进测算声明，或在 plan.md 中存在 [ARCH_IMPACT: NONE] 显式豁免。
3. 若未命中重构条件，默认放行通过。
二值化退出码: 通过 0, 失败 1。
"""
import sys
import re
from pathlib import Path

REFACTOR_KEYWORDS = [
    "refactor",
    "重构",
    "restructure",
    "decouple",
    "解耦",
    "architecture",
    "redesign",
]

def main() -> int:
    project_root = Path(__file__).resolve().parent.parent.parent
    plan_path = project_root / "memory-bank" / "plan.md"
    patterns_path = project_root / "memory-bank" / "systemPatterns.md"

    if not plan_path.exists():
        print(f"[FAIL] G10_REFACTOR_DOC_SYNC: plan.md not found at {plan_path}")
        return 1

    print("[G10_REFACTOR_DOC_SYNC] Checking Refactor-Doc Sync Gate...")
    plan_content = plan_path.read_text(encoding="utf-8")

    # 获取活跃 Phase 目标或描述 (提取 "## 2. 活跃 Phase" 之后的内容)
    active_section = plan_content
    match = re.search(r'##\s*2\.\s*活跃\s*Phase.*?(?=##\s*3\.|\Z)', plan_content, re.S | re.I)
    if match:
        active_section = match.group(0)

    is_refactor = any(kw.lower() in active_section.lower() for kw in REFACTOR_KEYWORDS)

    if not is_refactor:
        print("[PASS] G10_REFACTOR_DOC_SYNC: Current phase does not trigger refactor conditions. Gate exempt.")
        return 0

    print("  - Current phase identified as refactor / architectural evolution.")

    # 检查是否有显式无影响豁免
    if "[ARCH_IMPACT: NONE]" in plan_content:
        print("[PASS] G10_REFACTOR_DOC_SYNC: Found [ARCH_IMPACT: NONE] explicit exemption.")
        return 0

    # 验证 systemPatterns.md 是否存在且包含规范架构内容
    if not patterns_path.exists():
        print("[FAIL] G10_REFACTOR_DOC_SYNC: Phase triggers refactor, but memory-bank/systemPatterns.md is missing!")
        return 1

    patterns_content = patterns_path.read_text(encoding="utf-8")
    if "[EVOLUTION_CONTRIBUTION]" not in patterns_content:
        print("[FAIL] G10_REFACTOR_DOC_SYNC: memory-bank/systemPatterns.md missing [EVOLUTION_CONTRIBUTION].")
        return 1

    print("  - memory-bank/systemPatterns.md is present with [EVOLUTION_CONTRIBUTION].")
    print("[PASS] G10_REFACTOR_DOC_SYNC: Refactor documentation sync verified.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
