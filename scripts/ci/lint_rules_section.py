#!/usr/bin/env python3
"""
lint_rules_section.py — Canary 锚点与规则章节校验门禁
SSOT: skills/agents-rules/SKILL.md §9 & or-rules.md §or-07
"""
import sys
from pathlib import Path

CANARY_TERMS = [
    "AUDIT_QUORUM_EXHAUSTED",
    "CHAIRMAN_ESCALATION_REQUIRED",
    "N_max",
    "LEGISLATIVE_MANUAL_OVERRIDE",
    "Phase 218",
    "Phase 22",
    "Phase 226",
    "[a-f0-9]{32}",
    "verify_git_gate.py",
]

def main() -> int:
    project_root = Path(__file__).resolve().parent.parent.parent
    plan_path = project_root / "memory-bank" / "plan.md"

    if not plan_path.exists():
        print(f"[ERROR] memory-bank/plan.md not found at {plan_path}")
        return 1

    content = plan_path.read_text(encoding="utf-8")
    missing_terms = []

    for term in CANARY_TERMS:
        if term not in content:
            missing_terms.append(term)

    if missing_terms:
        print("[FAIL] Canary terms missing in memory-bank/plan.md:")
        for term in missing_terms:
            print(f"  - {term}")
        return 1

    print(f"[PASS] All {len(CANARY_TERMS)} Canary terms verified in memory-bank/plan.md")
    return 0

if __name__ == "__main__":
    sys.exit(main())
