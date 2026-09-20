#!/usr/bin/env python3
"""scripts/ci/lint_settlement_evidence_consistency.py — G16 Settlement Evidence Derivation & Cross-Ledger Consistency CI Gate.

Rules-as-Code CI Gate enforcing Phase 224 Legislation (rules/or-rules.md §or-02h and
skills/phase-settlement-protocol/settlement-evidence-derivation.md):
1. SOURCE SSOT: PhaseEvidence (L1) + staged snapshot + git/tag physical facts.
2. Binary First-Pass Truth Formula
3. Cross-Ledger Consistency Assertions
4. Fail-Fast on divergence
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
RESET = "\033[0m"

GATE_TAG = "[G16_SETTLEMENT_CONSISTENCY]"
VETO_TAG = "[VETO_REJECTED: SETTLEMENT_EVIDENCE_DIVERGENCE]"

TERMINAL_STATUSES = frozenset({
    "SETTLED_RELEASED",
    "SETTLED_COMPLETION",
    "RELEASED",
    "COMPLETED",
    "ARCHIVED",
    "ARCHIVED_BY_REPOSITION",
})

NON_TERMINAL_STATUSES = frozenset({
    "IN_PROGRESS",
    "ACTIVE",
    "PENDING_COMMIT",
    "PASS_PENDING_COMMIT",
    "PASS_PENDING_AUDIT",
    "VETO_REMEDIATION_PENDING",
    "BLOCKED",
})


def find_phase_evidence_file(project_root: Path, target_phase: Optional[int] = None) -> Optional[Path]:
    """Find PhaseEvidence JSON in docs/evidence/ or schemas/examples/."""
    evidence_dir = project_root / "docs" / "evidence"
    if target_phase is not None and evidence_dir.exists():
        exact = evidence_dir / f"p{target_phase}.json"
        if exact.exists():
            return exact
        matches = list(evidence_dir.glob(f"p{target_phase}*.json")) + list(evidence_dir.glob(f"phase_{target_phase}*.json"))
        if matches:
            matches.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            return matches[0]

    candidates: List[Path] = []
    if evidence_dir.exists():
        candidates.extend(evidence_dir.glob("*.json"))
    examples_dir = project_root / "schemas" / "examples"
    if examples_dir.exists():
        candidates.extend(examples_dir.glob("*evidence*.json"))

    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def get_active_phase_from_plan(project_root: Path) -> Optional[int]:
    """Extract current active Phase integer from memory-bank/plan.md."""
    plan_path = project_root / "memory-bank" / "plan.md"
    if not plan_path.exists():
        return None
    try:
        content = plan_path.read_text(encoding="utf-8")
        m_active = re.search(r"ACTIVE_PHASE\s*[:：]\s*`?Phase\s*(\d+)", content, re.IGNORECASE)
        if m_active:
            return int(m_active.group(1))
        m_in_prog = re.search(r"-\s*\*\*Phase\s*(\d+)\s*\((?:IN_PROGRESS|PROGRESS|ACTIVE|ACTIVE_PHASE)\)\*\*", content, re.IGNORECASE)
        if m_in_prog:
            return int(m_in_prog.group(1))
        m_head = re.search(r"^Phase\s+(\d+)\s*\([^)]*IN_PROGRESS[^)]*\)", content, re.MULTILINE | re.IGNORECASE)
        if m_head:
            return int(m_head.group(1))
        m_sec = re.search(r"##\s*2\.\s*活跃\s*Phase\s*(\d+)", content, re.IGNORECASE)
        if m_sec:
            return int(m_sec.group(1))
    except Exception:
        pass
    return None


def parse_aes_summary(summary_path: Path) -> Dict[str, Any]:
    if not summary_path.exists():
        return {}
    content = summary_path.read_text(encoding="utf-8")
    res: Dict[str, Any] = {"path": str(summary_path), "raw": content}

    m_phase = re.search(r"(?:-\s*\*\*Phase\*\*|\*\*Phase\*\*|Phase)\s*[:：]\s*[`\*]*([^\n\r`\*]+)", content, re.I)
    if m_phase:
        p_val = m_phase.group(1).strip()
        m_int = re.search(r"\d+", p_val)
        if m_int:
            res["phase"] = int(m_int.group(0))

    m_theme = re.search(r"(?:-\s*\*\*Theme\*\*|\*\*Theme\*\*|Theme)\s*[:：]\s*[`\*]*([^\n\r`\*]+)", content, re.I)
    if m_theme:
        res["theme"] = m_theme.group(1).strip()

    m_grade = re.search(r"(?:-\s*\*\*Task Grade\*\*|\*\*Task Grade\*\*|Task Grade|Task_Grade)\s*[:：]\s*[`\*]*([^\n\r`\*]+)", content, re.I)
    if m_grade:
        res["task_grade"] = m_grade.group(1).strip()

    m_status = re.search(r"(?:-\s*\*\*Status\*\*|\*\*Status\*\*|Status|Verdict)\s*[:：]\s*[`\*]*([^\n\r`\*]+)", content, re.I)
    if m_status:
        res["status"] = m_status.group(1).strip()

    m_commit = re.search(r"(?:-\s*\*\*Commit\*\*|\*\*Commit\*\*|Commit)\s*[:：]\s*[`\*]*([^\n\r`\*]+)", content, re.I)
    if m_commit:
        res["commit"] = m_commit.group(1).strip()

    m_tag = re.search(r"(?:-\s*\*\*Tag\*\*|\*\*Tag\*\*|Tag)\s*[:：]\s*[`\*]*([^\n\r`\*]+)", content, re.I)
    if m_tag:
        res["tag"] = m_tag.group(1).strip()

    m_fpr = re.search(r"(?:首通率|First[ _\-]Pass[ _\-]Rate)[^:：\n]*[:：]\s*[`\*]*([^\n\r`\*]+)", content, re.I)
    if m_fpr:
        res["first_pass_rate"] = m_fpr.group(1).strip()

    m_rounds = re.search(r"(?:多轮审计状态\s*/\s*Audit Rounds|Audit[ _\-]Rounds)[^:：\n]*[:：]\s*[`\*]*([^\n\r`\*]+)", content, re.I)
    if m_rounds:
        res["audit_rounds"] = m_rounds.group(1).strip()

    return res


def parse_aes_history_row(history_path: Path, target_phase: int) -> Optional[Dict[str, Any]]:
    if not history_path.exists():
        return None
    content = history_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    pattern = re.compile(rf"^\|\s*{target_phase}\s*\|", re.IGNORECASE)
    for line in lines:
        if pattern.match(line.strip()):
            parts = [c.strip() for c in line.strip().split("|")]
            if len(parts) >= 2 and parts[0] == "" and parts[-1] == "":
                parts = parts[1:-1]
            row_dict: Dict[str, Any] = {
                "raw_line": line,
                "parts": parts,
            }
            if len(parts) >= 3:
                row_dict["phase"] = target_phase
                row_dict["theme"] = parts[1]
                row_dict["task_grade"] = parts[2]
            if len(parts) >= 5:
                for p in parts[3:]:
                    if "%" in p:
                        row_dict["first_pass_rate"] = p
                        break
            return row_dict
    return None


def parse_plan_active_entry(plan_path: Path, target_phase: int) -> Optional[Dict[str, Any]]:
    if not plan_path.exists():
        return None
    content = plan_path.read_text(encoding="utf-8")

    m = re.search(rf"-\s*\*\*Phase\s+{target_phase}[^*]*\*\*:\s*([^\n]+)", content, re.IGNORECASE)
    if m:
        line = m.group(1).strip()
        status = "UNKNOWN"
        m_status = re.search(r"status\s*[:：]\s*([^\|,\s\]]+)", line, re.I)
        if m_status:
            status = m_status.group(1).strip()
        elif "IN_PROGRESS" in line:
            status = "IN_PROGRESS"
        elif "SETTLED_RELEASED" in line:
            status = "SETTLED_RELEASED"
        elif "PENDING_COMMIT" in line:
            status = "PENDING_COMMIT"
        return {"phase": target_phase, "status": status, "raw": line}

    m_head = re.search(rf"^Phase\s+{target_phase}\s*\(([^)]+)\):\s*([^\n]+)", content, re.MULTILINE | re.IGNORECASE)
    if m_head:
        meta = m_head.group(1)
        status = meta.split(",")[-1].strip() if "," in meta else meta.strip()
        return {"phase": target_phase, "status": status, "raw": m_head.group(0)}

    return None


def check_settlement_consistency(
    evidence: Dict[str, Any],
    project_root: Path,
    strict: bool = False,
) -> Tuple[bool, List[str], Dict[str, Any]]:
    discrepancies: List[str] = []
    phase = evidence.get("phase")
    theme = evidence.get("theme", "")
    task_grade = evidence.get("task_grade", "")
    snapshot = evidence.get("snapshot", {})
    scope = evidence.get("scope", {})
    task_events = evidence.get("task_events", [])
    verification_events = evidence.get("verification_events", [])
    audit_events = evidence.get("audit_events", [])
    derived = evidence.get("derived_metrics", {})
    artifact_evidence = evidence.get("artifact_evidence", {})

    task_recoveries = sum(1 for t in task_events if t.get("recovered_by_task_id", False) or t.get("attempt_count", 1) > 1)
    task_first_attempt_pass = (
        len(task_events) > 0 and
        all(t.get("attempt_count", 1) == 1 and not t.get("recovered_by_task_id", False) and t.get("status") == "SUCCESS" for t in task_events)
    )
    repair_count = sum(1 for v in verification_events if v.get("is_repair_attempt", False) or v.get("outcome") == "FAIL")
    r1_audits = [a for a in audit_events if a.get("round") == 1]
    audit_first_round_pass = len(r1_audits) > 0 and all(a.get("verdict") == "PASS" for a in r1_audits)
    scope_creep_count = scope.get("scope_creep_count", len(scope.get("out_of_scope_files", [])))

    computed_first_pass = (
        task_first_attempt_pass and
        task_recoveries == 0 and
        repair_count == 0 and
        audit_first_round_pass and
        scope_creep_count == 0
    )

    computed_final_pass = (
        snapshot.get("status") == "VALID" and
        not any(t.get("status") == "FAILED" for t in task_events) and
        artifact_evidence.get("deploy_artifact_status") in ["PASS", "EXEMPT"] and
        artifact_evidence.get("ui_artifact_status") in ["PASS", "EXEMPT"]
    )

    declared_first_pass = derived.get("phase_first_pass")
    if declared_first_pass is True and not computed_first_pass:
        reasons = []
        if task_recoveries > 0:
            reasons.append(f"task_recovery_count={task_recoveries} > 0")
        if not task_first_attempt_pass:
            reasons.append("task_first_attempt_pass is false")
        if repair_count > 0:
            reasons.append(f"repair_count={repair_count} > 0")
        if not audit_first_round_pass:
            reasons.append("audit_first_round_pass is false")
        if scope_creep_count > 0:
            reasons.append(f"scope_creep_count={scope_creep_count} > 0")
        discrepancies.append(
            f"PhaseEvidence derived_metrics.phase_first_pass is true but violates truth formula: {', '.join(reasons)}"
        )

    summary_path = project_root / "docs" / "aes_summaries" / f"p{phase}-aes-summary.md"
    summary_data = parse_aes_summary(summary_path)
    if not summary_path.exists():
        if strict:
            discrepancies.append(f"Missing AES Summary ledger at {summary_path}")
    else:
        if summary_data.get("theme") and summary_data["theme"].strip() != theme.strip():
            discrepancies.append(
                f"Summary Theme mismatch: summary='{summary_data.get('theme')}', evidence='{theme}'"
            )
        if task_grade and summary_data.get("task_grade"):
            s_grade = summary_data["task_grade"]
            if task_grade not in s_grade:
                discrepancies.append(
                    f"Summary Task Grade mismatch: summary='{s_grade}', evidence='{task_grade}'"
                )
        s_commit = summary_data.get("commit", "")
        if s_commit:
            is_placeholder = bool(re.search(r"待提交|Pending|PENDING_COMMIT", s_commit, re.I))
            is_valid_hash = bool(re.search(r"^[0-9a-f]{7,40}$", s_commit, re.I))
            if not is_placeholder and not is_valid_hash:
                discrepancies.append(
                    f"Summary Commit violates placeholder decoupling contract: commit='{s_commit}' (must be Pending or valid hash)"
                )
            if not computed_final_pass and is_valid_hash:
                discrepancies.append(
                    f"Summary Commit filled with real hash '{s_commit}' before Phase final pass completion (state inverted)"
                )

        s_fpr = summary_data.get("first_pass_rate", "")
        if not computed_first_pass and s_fpr:
            if "100%" in s_fpr or "一次性通过" in s_fpr:
                discrepancies.append(
                    f"Summary claims 100% first-pass ('{s_fpr}') despite rework/repair/recovery events in PhaseEvidence"
                )

        s_status = summary_data.get("status", "")
        if not computed_final_pass and s_status:
            for term in TERMINAL_STATUSES:
                if term in s_status:
                    discrepancies.append(
                        f"Summary declares terminal status '{s_status}' while PhaseEvidence final pass is not achieved"
                    )

    history_path = project_root / "memory-bank" / "aes-history.md"
    history_row = parse_aes_history_row(history_path, phase)
    if history_row:
        h_theme = history_row.get("theme", "")
        if h_theme and h_theme.strip() != theme.strip():
            discrepancies.append(
                f"AES History Theme mismatch: history='{h_theme}', evidence='{theme}'"
            )
        h_fpr = history_row.get("first_pass_rate", "")
        if not computed_first_pass and h_fpr:
            if "100%" in h_fpr:
                discrepancies.append(
                    f"AES History claims 100% first-pass ('{h_fpr}') despite rework/repair/recovery in PhaseEvidence"
                )

        h_notes = history_row.get("parts", [])[-1] if history_row.get("parts") else ""
        h_audit = history_row.get("parts", [])[-2] if len(history_row.get("parts", [])) >= 2 else ""
        if not computed_final_pass:
            for term in TERMINAL_STATUSES:
                if term in h_notes or term in h_audit or "SETTLED" in h_audit:
                    discrepancies.append(
                        f"AES History records premature settled/terminal state ('{h_audit}') while Phase is still non-terminal / final pass unverified"
                    )

    plan_path = project_root / "memory-bank" / "plan.md"
    plan_entry = parse_plan_active_entry(plan_path, phase)
    if plan_entry:
        plan_status = plan_entry.get("status", "")
        if not computed_final_pass:
            for term in TERMINAL_STATUSES:
                if term in plan_status:
                    discrepancies.append(
                        f"Plan Active Window declares terminal status '{plan_status}' while Phase is still in progress / final pass unverified"
                    )

    actual_files = scope.get("actual_files", [])
    src_modified = any(f.startswith("src/") or "src/" in f for f in actual_files)
    assets_path = project_root / "memory-bank" / "assets.md"
    if assets_path.exists():
        assets_content = assets_path.read_text(encoding="utf-8")
        m_art_ver = re.search(r"v\d+\.\d+\.\d+-p(\d+)", assets_content)
        if m_art_ver:
            art_phase = int(m_art_ver.group(1))
            if not src_modified and art_phase == phase:
                discrepancies.append(
                    f"Deployment artifact in assets.md advanced to p{phase} despite NO src/** modifications (Deploy Artifact No-Op & Test Bypass Gate violation)"
                )

    is_pass = len(discrepancies) == 0
    report = {
        "pass": is_pass,
        "phase": phase,
        "theme": theme,
        "computed_first_pass": computed_first_pass,
        "computed_final_pass": computed_final_pass,
        "discrepancies": discrepancies,
    }
    return is_pass, discrepancies, report


def main() -> int:
    parser = argparse.ArgumentParser(
        description="G16 CI Gate: Lint settlement evidence derivation and cross-ledger consistency."
    )
    parser.add_argument("--project-root", default=".", help="Root directory of the project")
    parser.add_argument("--evidence", default=None, help="Explicit path to PhaseEvidence JSON")
    parser.add_argument("--strict", action="store_true", help="Strict mode (fail if ledger files missing)")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")

    args = parser.parse_args()
    project_root = Path(args.project_root).resolve()

    active_phase = get_active_phase_from_plan(project_root)
    target_evidence_path: Optional[Path] = None

    if args.evidence:
        p = Path(args.evidence)
        target_evidence_path = p if p.is_absolute() else (project_root / p).resolve()
    else:
        target_evidence_path = find_phase_evidence_file(project_root, target_phase=active_phase)

    if not target_evidence_path or not target_evidence_path.exists():
        # Phase < 195: Evidence-First Governance was legislated at Phase 195. Projects at earlier phases (e.g. Phase 8)
        # without an explicit evidence file pass cleanly unless strict is set or active_phase >= 195.
        if active_phase is not None and active_phase >= 195 or args.strict:
            msg = f"{RED}[FAIL]{RESET} {VETO_TAG}\n- REASON: Missing PhaseEvidence file for active Phase {active_phase}\n- ACTION_REQUIRED: Generate docs/evidence/p{active_phase}.json first!"
            if args.json:
                print(json.dumps({"pass": False, "error": f"Missing PhaseEvidence file for Phase {active_phase}"}))
            else:
                print(msg, file=sys.stderr)
            return 1
        else:
            if args.json:
                print(json.dumps({"pass": True, "status": "PASS", "message": f"Settlement consistency check passed. Active Phase ({active_phase}) < 195."}))
            else:
                print(f"{GREEN}[PASS]{RESET} {GATE_TAG} Settlement consistency verified. Active Phase {active_phase} < 195 (Evidence-First optional).")
            return 0

    try:
        evidence_data = json.loads(target_evidence_path.read_text(encoding="utf-8"))
    except Exception as e:
        if args.json:
            print(json.dumps({"pass": False, "error": f"Invalid JSON in {target_evidence_path}: {e}"}))
        else:
            print(f"{RED}[FAIL]{RESET} {VETO_TAG}\n- REASON: JSON parse error in {target_evidence_path}: {e}", file=sys.stderr)
        return 1

    is_pass, discrepancies, report = check_settlement_consistency(evidence_data, project_root, strict=args.strict)

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        if is_pass:
            print(f"{GREEN}[PASS]{RESET} {GATE_TAG} Settlement evidence cross-ledger consistency verified for Phase {evidence_data.get('phase')}.")
            print(f"       Computed first_pass={report['computed_first_pass']}, final_pass={report['computed_final_pass']}")
        else:
            print(f"{RED}[FAIL]{RESET} {VETO_TAG}", file=sys.stderr)
            print(f"- SOURCE_FACT: {target_evidence_path.name} (Phase {evidence_data.get('phase')})", file=sys.stderr)
            print(f"- DIVERGENT_FIELDS ({len(discrepancies)} discrepancy items):", file=sys.stderr)
            for d in discrepancies:
                print(f"  * {d}", file=sys.stderr)

    return 0 if is_pass else 1


if __name__ == "__main__":
    sys.exit(main())
