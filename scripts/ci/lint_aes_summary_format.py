#!/usr/bin/env python3
"""
lint_aes_summary_format.py — AES Summary 格式与子任务表格强门禁
SSOT: or-rules.md §or-05 & Phase 160 立法
"""
import re
import sys
from pathlib import Path

REQUIRED_SECTIONS = [
    "[EVOLUTION_CONTRIBUTION]",
    "元数据清单",
    "核心",
    "Sub-Tasks",
]

def check_single_summary(file_path: Path) -> tuple[bool, list[str]]:
    content = file_path.read_text(encoding="utf-8")
    errors = []

    # 1. 检查四大核心模块
    for section in REQUIRED_SECTIONS:
        if section not in content:
            errors.append(f"Missing core section: '{section}'")

    # 2. 检查 Sub-Tasks 子任务表格是否存在（必须包含表格行结构 | Agent | 或 | 子任务 | 等）
    if "Sub-Tasks" in content:
        has_table = bool(re.search(r'\|.+\|.+\|', content))
        if not has_table:
            errors.append("Missing Sub-Tasks markdown table structure (| col | col |)")

    # 3. 检查 [EVOLUTION_CONTRIBUTION] 测算合法性
    if "[EVOLUTION_CONTRIBUTION]" in content:
        if not re.search(r'[`\*]*ect[`\*]*:\s*[`\*]*(?:ECT-)?([SABCD])[`\*]*', content, re.I):
            errors.append("Missing or invalid `ect` tier in [EVOLUTION_CONTRIBUTION]")

    return len(errors) == 0, errors

def main() -> int:
    project_root = Path(__file__).resolve().parent.parent.parent
    summaries_dir = project_root / "docs" / "aes_summaries"

    if not summaries_dir.exists() or not any(summaries_dir.glob("*.md")):
        print(f"[INFO] No AES summary files found in {summaries_dir}. Exemption granted.")
        return 0

    summary_files = list(summaries_dir.glob("*.md"))
    print(f"[CI] Validating {len(summary_files)} AES summary file(s)...")

    has_fail = False
    for sm_file in summary_files:
        ok, errors = check_single_summary(sm_file)
        if not ok:
            print(f"  [FAIL] {sm_file.name}:")
            for err in errors:
                print(f"    - {err}")
            has_fail = True
        else:
            print(f"  [PASS] {sm_file.name}")

    if has_fail:
        print("[FAIL] AES summary format verification failed.")
        return 1

    print("[PASS] All AES summary files verified successfully.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
