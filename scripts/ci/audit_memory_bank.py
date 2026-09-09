#!/usr/bin/env python3
"""
audit_memory_bank.py — G2_PURITY 门禁: 检查 memory-bank 纯净度与幽灵文件
SSOT: rules/or-rules.md §or-01 & skills/phase-settlement-protocol/SKILL.md
契约:
1. 必需核心文件存在性校验: productContext.md, systemPatterns.md, plan.md, assets.md, profit.md, aes-history.md
2. 幽灵文件白名单校验: 根目录下仅允许标准 7 个 Markdown 文件 + agents/ 目录，禁止非标准幽灵文件落盘。
3. agents/ 子目录单射结构合法性校验。
二值化退出码: 通过 0, 失败 1。
"""
import sys
from pathlib import Path

REQUIRED_CORE_FILES = [
    "productContext.md",
    "systemPatterns.md",
    "plan.md",
    "assets.md",
    "profit.md",
    "aes-history.md",
]

ALLOWED_TOP_ENTRIES = {
    "productContext.md",
    "systemPatterns.md",
    "plan.md",
    "assets.md",
    "profit.md",
    "aes-history.md",
    "mermaid.md",
    "agents",
}

def main() -> int:
    project_root = Path(__file__).resolve().parent.parent.parent
    mb_dir = project_root / "memory-bank"

    if not mb_dir.exists() or not mb_dir.is_dir():
        print(f"[FAIL] G2_PURITY: memory-bank directory not found at {mb_dir}")
        return 1

    print("[G2_PURITY] Starting memory-bank Purity and Anti-Ghost-File Audit...")
    errors = []

    # 1. 检查必需的核心资产
    for core_file in REQUIRED_CORE_FILES:
        fp = mb_dir / core_file
        if not fp.exists():
            errors.append(f"Missing required core file: memory-bank/{core_file}")
        elif not fp.is_file():
            errors.append(f"Core path is not a file: memory-bank/{core_file}")

    # 2. 检查幽灵文件 (Ghost Files)
    ghost_files = []
    for item in mb_dir.iterdir():
        if item.name.startswith("."):
            continue
        if item.name not in ALLOWED_TOP_ENTRIES:
            ghost_files.append(item.name)

    if ghost_files:
        errors.append(f"Detected unauthorized ghost files in memory-bank: {', '.join(ghost_files)}")

    # 3. 检查 agents/ 目录
    agents_dir = mb_dir / "agents"
    if agents_dir.exists():
        if not agents_dir.is_dir():
            errors.append("memory-bank/agents is not a directory")
        else:
            # 检查 agents 目录下子目录结构
            for sub in agents_dir.iterdir():
                if sub.name.startswith("."):
                    continue
                if sub.is_dir():
                    ac_path = sub / "activeContext.md"
                    if not ac_path.exists():
                        print(f"  [WARN] Agent directory without activeContext.md: agents/{sub.name}")

    if errors:
        print("\n[FAIL] G2_PURITY: Purity violations found:")
        for err in errors:
            print(f"  * {err}")
        return 1

    print("\n[PASS] G2_PURITY: memory-bank purity verified. Zero ghost files.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
