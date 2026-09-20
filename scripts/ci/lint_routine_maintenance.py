#!/usr/bin/env python3
"""
scripts/ci/lint_routine_maintenance.py — 逢 0 Phase 例行维护 CI 强门禁 (G11_ROUTINE_MAINTENANCE)

检查目标项目的 memory-bank/plan.md 和 memory-bank/aes-history.md：
1. 提取最新结算 Phase P_latest；
2. 计算最近的逢 0 Phase P_mod10 = (P_latest // 10) * 10；
3. 若 P_latest == 0 或 P_mod10 == 0，PASS (NO_MOD10_YET)；
4. 若 P_mod10 > 0，断言在 aes-history.md、plan.md 中对应的 P_mod10 具备例保记录标记
   (或包含 [ROUTINE_MAINTENANCE_REMEDIATION: Phase X COMPENSATED] 补偿声明)。
"""

import sys
import re
from pathlib import Path

MAINTENANCE_KEYWORDS = [
    "routinemaintenance",
    "routine_maintenance",
    "例行维护",
    "例保",
    "defat",
    "脱脂",
    "降熵",
]


def extract_latest_settled_phase(plan_text: str, aes_text: str) -> int:
    phases = []
    # 扫描 plan.md 中的 Phase 声明
    for m in re.finditer(r"\*\*Phase\s*(\d+)\s*\((?:SETTLED_RELEASED|COMPLETED|IN_PROGRESS)\)\*\*", plan_text, re.IGNORECASE):
        phases.append(int(m.group(1)))
    for m in re.finditer(r"Phase\s*(\d+)\s*SETTLED", plan_text, re.IGNORECASE):
        phases.append(int(m.group(1)))
    
    # 扫描 aes-history.md 表格第一列中的 Phase 声明
    for line in aes_text.splitlines():
        line_s = line.strip()
        if not line_s.startswith("|"):
            continue
        parts = [p.strip() for p in line_s.split("|")[1:-1]]
        if not parts or any(h in parts[0].lower() for h in ["phase", "---", ":---"]):
            continue
        m_ph = re.search(r"^(?:p|phase\s*)?(\d+)", parts[0], re.IGNORECASE)
        if m_ph:
            phases.append(int(m_ph.group(1)))
        
    return max(phases) if phases else 0


def check_routine_maintenance_for_phase(target_phase: int, plan_text: str, aes_text: str, project_name: str = "") -> bool:
    # 1. 检查是否有历史补偿声明
    remediation_pattern = rf"\[ROUTINE_MAINTENANCE_REMEDIATION:\s*(?:Phase\s*)?{target_phase}\s+COMPENSATED\]"
    if re.search(remediation_pattern, plan_text, re.IGNORECASE) or re.search(remediation_pattern, aes_text, re.IGNORECASE):
        return True

    # 2. 检查 aes-history.md 表格中目标 Phase 的行
    for line in aes_text.splitlines():
        line_s = line.strip()
        if not line_s.startswith("|"):
            continue
        parts = [p.strip() for p in line_s.split("|")[1:-1]]
        if not parts or any(h in parts[0].lower() for h in ["phase", "---", ":---"]):
            continue
        m_ph = re.search(r"^(?:p|phase\s*)?(\d+)", parts[0], re.IGNORECASE)
        if m_ph and int(m_ph.group(1)) == target_phase:
            row_content = " ".join(parts).lower()
            if any(kw in row_content for kw in MAINTENANCE_KEYWORDS):
                return True

    # 3. 检查 plan.md 中目标 Phase 的条目
    phase_pattern = rf"(?:^|\n)[-*\s]*\*\*Phase\s*{target_phase}\b[^\n]*\n([\s\S]*?)(?=\n[-*\s]*\*\*Phase|\n##|\Z)"
    m_block = re.search(phase_pattern, plan_text, re.IGNORECASE)
    if m_block:
        block_content = m_block.group(0).lower()
        if any(kw in block_content for kw in MAINTENANCE_KEYWORDS):
            return True

    # 4. 检查全局是否有针对该 Phase 的例保说明
    global_pattern = rf"Phase\s*{target_phase}\b[^\n]*(?:routinemaintenance|routine|例行维护|例保|defat|脱脂|降熵)"
    if re.search(global_pattern, plan_text, re.IGNORECASE) or re.search(global_pattern, aes_text, re.IGNORECASE):
        return True

    return False


def main():
    repo_root = Path(__file__).resolve().parent.parent.parent
    mb_dir = repo_root / "memory-bank"
    plan_file = mb_dir / "plan.md"
    aes_file = mb_dir / "aes-history.md"

    if not plan_file.exists() and not aes_file.exists():
        print("[ROUTINE_MAINTENANCE_GATE: PASS (NO_MEMORY_BANK_FOUND)]")
        sys.exit(0)

    plan_text = plan_file.read_text(encoding="utf-8") if plan_file.exists() else ""
    aes_text = aes_file.read_text(encoding="utf-8") if aes_file.exists() else ""

    latest_phase = extract_latest_settled_phase(plan_text, aes_text)
    mod10_phase = (latest_phase // 10) * 10

    project_name = repo_root.name
    print(f"[G11_ROUTINE_MAINTENANCE] Target Project: {project_name}, Latest Phase: {latest_phase}, Most Recent Mod-10 Phase: {mod10_phase}")

    if latest_phase == 0 or mod10_phase == 0:
        print(f"[ROUTINE_MAINTENANCE_GATE: PASS (NO_MOD10_YET - Phase {latest_phase})]")
        sys.exit(0)

    # 检查最近逢 0 Phase 是否满足例保要求
    has_maintenance = check_routine_maintenance_for_phase(mod10_phase, plan_text, aes_text, project_name)
    if not has_maintenance:
        print(f"❌ [ROUTINE_MAINTENANCE_MISSING_ON_MOD10_PHASE] Phase {mod10_phase} lacks routine maintenance certification!")
        print(f"   Please record RoutineMaintenance on Phase {mod10_phase} or add [ROUTINE_MAINTENANCE_REMEDIATION: Phase {mod10_phase} COMPENSATED] in memory-bank/plan.md or aes-history.md.")
        sys.exit(1)

    print(f"✅ [ROUTINE_MAINTENANCE_GATE: PASS] Phase {mod10_phase} Routine Maintenance Verified.")
    sys.exit(0)


if __name__ == "__main__":
    main()
