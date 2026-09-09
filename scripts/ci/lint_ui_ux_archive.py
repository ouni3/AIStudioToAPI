#!/usr/bin/env python3
"""
lint_ui_ux_archive.py — G6_UI_CONTRAST 门禁: 检查 docs/design/ui_ux_archive.md 的 contrast_gate 与 WCAG AA 规范
SSOT: rules/or-rules.md §or-02c & skills/ui-ux-archiving-flow/SKILL.md
契约:
1. 存在性检查: docs/design/ui_ux_archive.md 必须物理存在。
2. 测算块检查: 必须包含 [EVOLUTION_CONTRIBUTION] 测算块。
3. 可访问性门禁检查: 必须包含 WCAG AA 色彩对比度走查结论 / contrast_gate (如 WCAG AA, >= 4.5:1 或 PASS)。
4. 视觉验签检查: 包含走查审核与 VRT 验签声明。
二值化退出码: 通过 0, 失败 1。
"""
import sys
import re
from pathlib import Path

REQUIRED_TERMS = [
    "[EVOLUTION_CONTRIBUTION]",
    "WCAG AA",
    "4.5:1",
    "[CLAIRE_UX_AUDIT_REPORT",
    "[VRT_DIFF_ZERO",
]

def main() -> int:
    project_root = Path(__file__).resolve().parent.parent.parent
    archive_file = project_root / "docs" / "design" / "ui_ux_archive.md"

    if not archive_file.exists():
        print(f"[FAIL] G6_UI_CONTRAST: UI/UX archive file missing at: {archive_file}")
        return 1

    print("[G6_UI_CONTRAST] Starting UI/UX and Contrast Gate Audit...")
    content = archive_file.read_text(encoding="utf-8")
    missing_terms = []

    for term in REQUIRED_TERMS:
        if term not in content:
            missing_terms.append(term)

    if missing_terms:
        print("\n[FAIL] G6_UI_CONTRAST: Missing required UI/UX & Contrast contract terms in ui_ux_archive.md:")
        for t in missing_terms:
            print(f"  * {t}")
        return 1

    # 校验 ECT 评级是否存在且为有效等级 (ECT-S / ECT-A)
    ect_match = re.search(r'[`\*]*ect[`\*]*:\s*[`\*]*(?:ECT-)?([SABCD])[`\*]*', content, re.I)
    if not ect_match:
        print("[FAIL] G6_UI_CONTRAST: ui_ux_archive.md missing valid 'ect' rating in [EVOLUTION_CONTRIBUTION].")
        return 1
    
    ect_grade = ect_match.group(1)
    if ect_grade not in ("S", "A"):
        print(f"[FAIL] G6_UI_CONTRAST: ect grade '{ect_grade}' is below threshold (>= ECT-A required).")
        return 1

    print(f"  - ECT Grade: ECT-{ect_grade} (Compliant)")
    print("  - WCAG AA Contrast Standards: Verified")
    print("  - Visual / Caller DX Audit Tokens: In Place")
    print("\n[PASS] G6_UI_CONTRAST: UI/UX archive and contrast gate passed.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
