#!/usr/bin/env python3
"""
audit_token_limits.py — G1_TOKEN 门禁: 检查核心 memory-bank 资产 <= 4096 Token
SSOT: rules/or-rules.md & skills/phase-settlement-protocol/SKILL.md
契约: 4 字符 / 1 Token 近似估算; plan.md 允许最大 8192 Token; 其余核心资产上限 4096 Token。
二值化退出码: 通过 0, 失败 1。
"""
import sys
from pathlib import Path

# 核心资产与上限 Token 配置 (SSOT 契约)
TOKEN_LIMITS = {
    "productContext.md": 4096,
    "systemPatterns.md": 4096,
    "assets.md": 4096,
    "profit.md": 4096,
    "mermaid.md": 4096,
    "aes-history.md": 4096,
    "plan.md": 8192,
}

def estimate_tokens(text: str) -> int:
    """标准 4 字符近似 1 Token 算法"""
    return len(text) // 4

def main() -> int:
    project_root = Path(__file__).resolve().parent.parent.parent
    mb_dir = project_root / "memory-bank"

    if not mb_dir.exists() or not mb_dir.is_dir():
        print(f"[FAIL] memory-bank directory not found at: {mb_dir}")
        return 1

    violations = []
    print("[G1_TOKEN] Starting Token Limit Audit on memory-bank assets...")

    for filename, limit in TOKEN_LIMITS.items():
        file_path = mb_dir / filename
        if not file_path.exists():
            continue

        content = file_path.read_text(encoding="utf-8")
        token_count = estimate_tokens(content)

        status = "OK" if token_count <= limit else "EXCEEDED"
        print(f"  - {filename:20s}: {token_count:5d} / {limit} Tokens [{status}]")

        if token_count > limit:
            violations.append((filename, token_count, limit))

    if violations:
        print("\n[FAIL] G1_TOKEN: The following files exceeded token limits:")
        for fn, count, lim in violations:
            print(f"  * {fn}: {count} > {lim} (Over by {count - lim} tokens)")
        return 1

    print("\n[PASS] G1_TOKEN: All memory-bank assets within token limits.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
