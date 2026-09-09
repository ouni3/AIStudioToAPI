#!/usr/bin/env python3
"""
lint_core_file_format.py — 核心文件格式与 ECT 测算校验门禁
SSOT: 00-evolution-law.md §1.6 & skills/core-file-format-repair/SKILL.md
"""
import re
import sys
from pathlib import Path

CORE_FILES = [
    "memory-bank/productContext.md",
    "memory-bank/systemPatterns.md",
    "memory-bank/plan.md",
    "memory-bank/assets.md",
    "memory-bank/profit.md",
    "memory-bank/aes-history.md",
    "memory-bank/mermaid.md",
    "memory-bank/agents/moe-code/activeContext.md",
]

VALID_ECT_TIERS = {"S", "A", "B", "C", "D"}

def check_evolution_contribution(file_path: Path) -> tuple[bool, str]:
    if not file_path.exists():
        return False, f"File {file_path} not found"

    content = file_path.read_text(encoding="utf-8")

    # 校验 [EVOLUTION_CONTRIBUTION] 测算块
    if "[EVOLUTION_CONTRIBUTION]" not in content:
        return False, f"[EVOLUTION_CONTRIBUTION] block missing in {file_path}"

    # 校验四要素方向性判定: F_{System}, L_{User}, S_{total}, Value_{Delivered}
    # 允许格式形如: - $F_{System}$: **+** 或 - $F_{System}$: +
    f_sys = re.search(r'\$F_\{System\}\$:\s*\**([\+\-0])\**', content)
    l_user = re.search(r'\$L_\{User\}\$:\s*\**([\+\-0])\**', content)
    s_total = re.search(r'\$S_\{total\}\$:\s*\**([\+\-0])\**', content)

    if not f_sys or not l_user or not s_total:
        return False, f"Missing 4-factor direction (+/-0) in {file_path} (F_System, L_User, or S_total)"

    # 校验 ect 等级: `ect`: **S** 或 `ect`: `S` 或 ect: S
    ect_match = re.search(r'`?ect`?:\s*[\*`]*([SABCD])[\*`]*', content)
    if not ect_match:
        return False, f"Invalid or missing `ect` tier in {file_path} (must be S/A/B/C/D)"

    ect_val = ect_match.group(1)
    if ect_val not in VALID_ECT_TIERS:
        return False, f"Unknown ect tier '{ect_val}' in {file_path}"

    return True, f"OK ({ect_val})"

def main() -> int:
    project_root = Path(__file__).resolve().parent.parent.parent
    has_error = False

    print("[CI] Checking core files [EVOLUTION_CONTRIBUTION] format and ECT tiers...")
    for rel_path in CORE_FILES:
        target_file = project_root / rel_path
        ok, msg = check_evolution_contribution(target_file)
        if not ok:
            print(f"  [FAIL] {rel_path}: {msg}")
            has_error = True
        else:
            print(f"  [PASS] {rel_path}: {msg}")

    if has_error:
        print("[FAIL] Core file format verification failed.")
        return 1

    print("[PASS] All core files passed format and ECT validation.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
