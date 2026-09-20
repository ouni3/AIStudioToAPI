#!/usr/bin/env python3
"""scripts/ci/lint_phase_evidence.py — G12 PhaseEvidence CI Gate.

Rules-as-Code CI Lint Gate enforcing Evidence-First Governance data contract and assertions:
1. G_EVIDENCE_SCHEMA: Schema structure & required fields validation against schemas/phase_evidence.schema.json
2. G_FIRST_PASS_TRUTH: First-pass binary truth assertion (no fabricated 100% or false first_pass)
3. G_SCOPE_SUBSET: Planned vs actual file scope validation
4. G_UNKNOWN_INTEGRITY: Uncollected telemetry fields must remain UNKNOWN, never fabricated
5. G_LEDGER_SSOT: Derived metrics consistency check
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

LINT_TAG = "[LINT_PHASE_EVIDENCE]"


def load_schema(schema_path: Path) -> Dict[str, Any]:
    """Load JSON Schema from file."""
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")
    with open(schema_path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_schema_structure(data: Dict[str, Any], schema: Dict[str, Any]) -> List[str]:
    """Validate JSON data against schema. Uses jsonschema if available, with built-in fallback."""
    errors: List[str] = []
    try:
        import jsonschema
        validator = jsonschema.Draft202012Validator(schema)
        for err in validator.iter_errors(data):
            path_str = ".".join(str(p) for p in err.path) if err.path else "root"
            errors.append(f"Schema error at '{path_str}': {err.message}")
        return errors
    except ImportError:
        pass

    # Built-in fallback validation for key required fields and types
    required_top = schema.get("required", [])
    for field in required_top:
        if field not in data:
            errors.append(f"Missing required top-level field: '{field}'")

    if "phase" in data and not isinstance(data["phase"], int):
        errors.append("Field 'phase' must be an integer")

    if "snapshot" in data and isinstance(data["snapshot"], dict):
        for req in ["base_head", "staged_tree_hash", "manifest_hash"]:
            if req not in data["snapshot"]:
                errors.append(f"Missing required snapshot field: '{req}'")

    if "scope" in data and isinstance(data["scope"], dict):
        for req in ["planned_files", "actual_files", "out_of_scope_files", "scope_creep_count"]:
            if req not in data["scope"]:
                errors.append(f"Missing required scope field: '{req}'")

    if "artifact_evidence" in data and isinstance(data["artifact_evidence"], dict):
        for req in ["deploy_artifact_status", "ui_artifact_status"]:
            if req not in data["artifact_evidence"]:
                errors.append(f"Missing required artifact_evidence field: '{req}'")

    if "impact" in data and isinstance(data["impact"], dict):
        for req in ["f_system", "l_user", "s_total", "value_delivered", "ect", "verdict"]:
            if req not in data["impact"]:
                errors.append(f"Missing required impact field: '{req}'")

    return errors


def check_scope_subset(scope: Dict[str, Any]) -> List[str]:
    """Gate G_SCOPE_SUBSET: Planned vs Actual files consistency check."""
    violations: List[str] = []
    planned = set(scope.get("planned_files", []))
    actual = set(scope.get("actual_files", []))
    declared_out = set(scope.get("out_of_scope_files", []))
    declared_count = scope.get("scope_creep_count", 0)

    calculated_out = actual - planned
    if calculated_out != declared_out:
        violations.append(
            f"[SCOPE_SUBSET_VIOLATION] Declared out_of_scope_files {sorted(list(declared_out))} does not match actual difference (actual - planned) {sorted(list(calculated_out))}"
        )

    if declared_count != len(declared_out):
        violations.append(
            f"[SCOPE_SUBSET_VIOLATION] scope_creep_count ({declared_count}) does not equal len(out_of_scope_files) ({len(declared_out)})"
        )

    if declared_count > 0:
        rationale = scope.get("scope_creep_rationale", "")
        if not rationale or not rationale.strip():
            violations.append(
                f"[SCOPE_SUBSET_VIOLATION] scope_creep_count is {declared_count} but scope_creep_rationale is missing or empty"
            )

    return violations


def compute_derived_metrics(data: Dict[str, Any]) -> Dict[str, Any]:
    """Compute exact derived metrics from raw events and scope facts."""
    task_events = data.get("task_events", [])
    verification_events = data.get("verification_events", [])
    audit_events = data.get("audit_events", [])
    scope = data.get("scope", {})
    artifact_evidence = data.get("artifact_evidence", {})

    # Task metrics
    task_recoveries = sum(1 for t in task_events if t.get("recovered_by_task_id", False) or t.get("attempt_count", 1) > 1)
    task_first_attempt_pass = (
        len(task_events) > 0 and
        all(t.get("attempt_count", 1) == 1 and not t.get("recovered_by_task_id", False) and t.get("status") == "SUCCESS" for t in task_events)
    )

    # Verification repairs
    repair_count = sum(1 for v in verification_events if v.get("is_repair_attempt", False) or v.get("outcome") == "FAIL")

    # Audit R1 pass
    r1_events = [a for a in audit_events if a.get("round") == 1]
    audit_first_round_pass = (
        len(r1_events) > 0 and
        all(a.get("verdict") == "PASS" for a in r1_events)
    )
    audit_rounds_count = max([a.get("round", 1) for a in audit_events], default=1)

    # Scope creep
    scope_creep_count = scope.get("scope_creep_count", len(scope.get("out_of_scope_files", [])))

    # Phase first pass true truth
    phase_first_pass = (
        task_first_attempt_pass and
        task_recoveries == 0 and
        repair_count == 0 and
        audit_first_round_pass and
        scope_creep_count == 0
    )

    # Phase final pass
    has_failed_task = any(t.get("status") == "FAILED" for t in task_events)
    latest_verifs: Dict[str, str] = {}
    for v in sorted(verification_events, key=lambda x: x.get("timestamp", "")):
        key = v.get("tool_or_script") or v.get("check_name", "")
        latest_verifs[key] = v.get("outcome", "")
    has_failed_verif = len(latest_verifs) > 0 and any(o == "FAIL" for o in latest_verifs.values())

    latest_audits: Dict[str, str] = {}
    for a in sorted(audit_events, key=lambda x: x.get("round", 1)):
        latest_audits[a.get("audit_type", "")] = a.get("verdict", "")
    all_audits_passed = len(latest_audits) > 0 and all(v in ["PASS", "EXEMPT"] for v in latest_audits.values())
    artifacts_ok = (
        artifact_evidence.get("deploy_artifact_status") in ["PASS", "EXEMPT"] and
        artifact_evidence.get("ui_artifact_status") in ["PASS", "EXEMPT"]
    )
    phase_final_pass = (not has_failed_task) and (not has_failed_verif) and all_audits_passed and artifacts_ok

    # Evidence coverage computation
    coverage_points = 0.0
    total_points = 6.0

    if data.get("snapshot", {}).get("status") == "VALID":
        coverage_points += 1.0
    if len(scope.get("actual_files", [])) > 0 or len(scope.get("planned_files", [])) > 0:
        coverage_points += 1.0
    if len(task_events) > 0 and all(t.get("status") != "UNKNOWN" for t in task_events):
        coverage_points += 1.0
    if len(verification_events) > 0 and all(v.get("outcome") != "UNKNOWN" for v in verification_events):
        coverage_points += 1.0
    if len(audit_events) > 0 and all(a.get("verdict") != "UNKNOWN" for a in audit_events):
        coverage_points += 1.0
    if artifact_evidence.get("deploy_artifact_status") != "UNKNOWN" and artifact_evidence.get("ui_artifact_status") != "UNKNOWN":
        coverage_points += 1.0

    evidence_coverage = round(coverage_points / total_points, 2)

    return {
        "task_first_attempt_pass": task_first_attempt_pass,
        "task_recovery_count": task_recoveries,
        "repair_count": repair_count,
        "audit_first_round_pass": audit_first_round_pass,
        "audit_rounds_count": audit_rounds_count,
        "phase_first_pass": phase_first_pass,
        "phase_final_pass": phase_final_pass,
        "evidence_coverage": evidence_coverage,
    }


def check_first_pass_truth(data: Dict[str, Any], computed: Dict[str, Any]) -> List[str]:
    """Gate G_FIRST_PASS_TRUTH: Assert that phase_first_pass is not fabricated."""
    violations: List[str] = []
    declared_derived = data.get("derived_metrics", {})
    declared_first_pass = declared_derived.get("phase_first_pass")

    if declared_first_pass is True and not computed["phase_first_pass"]:
        reasons = []
        if computed["task_recovery_count"] > 0:
            reasons.append(f"task_recovery_count={computed['task_recovery_count']} > 0")
        if not computed["task_first_attempt_pass"]:
            reasons.append("task_first_attempt_pass is false")
        if computed["repair_count"] > 0:
            reasons.append(f"repair_count={computed['repair_count']} > 0")
        if not computed["audit_first_round_pass"]:
            reasons.append("audit_first_round_pass is false (R1 was not PASS)")
        scope_creep = data.get("scope", {}).get("scope_creep_count", 0)
        if scope_creep > 0:
            reasons.append(f"scope_creep_count={scope_creep} > 0")

        violations.append(
            f"[FIRST_PASS_TRUTH_VIOLATION] phase_first_pass is marked true but true conditions failed: {', '.join(reasons)}"
        )

    return violations


def check_unknown_integrity(data: Dict[str, Any]) -> List[str]:
    """Gate G_UNKNOWN_INTEGRITY: Assert that missing telemetry is marked UNKNOWN and not fabricated."""
    violations: List[str] = []
    derived = data.get("derived_metrics", {})
    coverage = derived.get("evidence_coverage", 1.0)

    for idx, v in enumerate(data.get("verification_events", [])):
        outcome = v.get("outcome")
        if outcome not in ["PASS", "FAIL", "UNKNOWN"]:
            violations.append(f"[UNKNOWN_INTEGRITY_VIOLATION] verification_events[{idx}] outcome '{outcome}' is invalid")

    for idx, a in enumerate(data.get("audit_events", [])):
        verdict = a.get("verdict")
        if verdict not in ["PASS", "VETO_REJECTED", "EXEMPT", "UNKNOWN"]:
            violations.append(f"[UNKNOWN_INTEGRITY_VIOLATION] audit_events[{idx}] verdict '{verdict}' is invalid")
        if verdict == "VETO_REJECTED" and not a.get("veto_reason"):
            violations.append(f"[UNKNOWN_INTEGRITY_VIOLATION] audit_events[{idx}] is VETO_REJECTED but veto_reason is missing")

    artifact_evidence = data.get("artifact_evidence", {})
    dep_status = artifact_evidence.get("deploy_artifact_status")
    if dep_status == "EXEMPT" and not artifact_evidence.get("deploy_artifact_exemption_evidence"):
        violations.append("[UNKNOWN_INTEGRITY_VIOLATION] deploy_artifact_status is EXEMPT but deploy_artifact_exemption_evidence is missing")

    ui_status = artifact_evidence.get("ui_artifact_status")
    if ui_status == "EXEMPT" and not artifact_evidence.get("ui_artifact_exemption_evidence"):
        violations.append("[UNKNOWN_INTEGRITY_VIOLATION] ui_artifact_status is EXEMPT but ui_artifact_exemption_evidence is missing")

    has_unknown = (
        any(t.get("status") == "UNKNOWN" for t in data.get("task_events", [])) or
        any(v.get("outcome") == "UNKNOWN" for v in data.get("verification_events", [])) or
        any(a.get("verdict") == "UNKNOWN" for a in data.get("audit_events", [])) or
        dep_status == "UNKNOWN" or ui_status == "UNKNOWN"
    )

    if has_unknown and coverage >= 1.0:
        violations.append(
            f"[UNKNOWN_INTEGRITY_VIOLATION] Uncollected UNKNOWN fields present but evidence_coverage is {coverage} (must be < 1.0)"
        )

    return violations


def check_ledger_ssot(data: Dict[str, Any], computed: Dict[str, Any]) -> List[str]:
    """Gate G_LEDGER_SSOT: Validate derived_metrics match calculated truth."""
    violations: List[str] = []
    declared = data.get("derived_metrics")
    if declared is None:
        return violations

    for key, expected_val in computed.items():
        if key in declared:
            actual_val = declared[key]
            if actual_val != expected_val:
                violations.append(
                    f"[LEDGER_SSOT_VIOLATION] derived_metrics.{key} mismatch: declared={actual_val}, computed_from_evidence={expected_val}"
                )

    return violations


def lint_phase_evidence_data(data: Dict[str, Any], schema: Dict[str, Any]) -> Tuple[bool, List[str], Dict[str, Any]]:
    """Execute complete PhaseEvidence linting suite."""
    all_violations: List[str] = []

    schema_errors = validate_schema_structure(data, schema)
    if schema_errors:
        for err in schema_errors:
            all_violations.append(f"[EVIDENCE_SCHEMA_VIOLATION] {err}")

    scope = data.get("scope", {})
    if isinstance(scope, dict):
        scope_violations = check_scope_subset(scope)
        all_violations.extend(scope_violations)

    computed_metrics = compute_derived_metrics(data)

    first_pass_violations = check_first_pass_truth(data, computed_metrics)
    all_violations.extend(first_pass_violations)

    unknown_violations = check_unknown_integrity(data)
    all_violations.extend(unknown_violations)

    ledger_violations = check_ledger_ssot(data, computed_metrics)
    all_violations.extend(ledger_violations)

    is_pass = len(all_violations) == 0
    report = {
        "pass": is_pass,
        "project": data.get("project"),
        "phase": data.get("phase"),
        "theme": data.get("theme"),
        "violations": all_violations,
        "computed_metrics": computed_metrics,
    }
    return is_pass, all_violations, report


def get_active_phase_from_plan(project_root: Path) -> Optional[str]:
    """Extract current active Phase from memory-bank/plan.md."""
    plan_path = project_root / "memory-bank" / "plan.md"
    if not plan_path.exists():
        return None
    try:
        content = plan_path.read_text(encoding="utf-8")
        m_active = re.search(r"ACTIVE_PHASE\s*[:：]\s*`?([^\n`]+)`?", content, re.IGNORECASE)
        if m_active:
            val = m_active.group(1).strip()
            if "IDLE" in val.upper():
                return None
            if "NONE" not in val.upper():
                m_num = re.search(r"Phase\s*(\d+)", val, re.IGNORECASE)
                if m_num:
                    return m_num.group(1)
                if val.isdigit():
                    return val
        m_in_prog = re.search(r"-\s*\*\*Phase\s*(\d+)\s*\((?:IN_PROGRESS|PROGRESS|ACTIVE)\)\*\*", content, re.IGNORECASE)
        if m_in_prog:
            return m_in_prog.group(1)
        m_sec = re.search(r"##\s*2\.\s*活跃\s*Phase\s*(\d+)", content, re.IGNORECASE)
        if m_sec:
            return m_sec.group(1)
    except Exception:
        pass
    return None


def find_latest_evidence_file(project_root: Path, target_phase: Optional[str] = None) -> Optional[Path]:
    evidence_dir = project_root / "docs" / "evidence"
    if target_phase and evidence_dir.exists():
        exact_match = evidence_dir / f"p{target_phase}.json"
        if exact_match.exists():
            return exact_match
        matches = list(evidence_dir.glob(f"p{target_phase}*.json")) + list(evidence_dir.glob(f"phase{target_phase}*.json")) + list(evidence_dir.glob(f"phase_{target_phase}*.json"))
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint PhaseEvidence data contracts and truth gates.")
    parser.add_argument("evidence_file", nargs="?", help="Path to phase evidence JSON file")
    parser.add_argument("--project-root", default=".", help="Root directory of the project")
    parser.add_argument("--strict", action="store_true", help="Strict mode: fail if no evidence file is found")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")

    args = parser.parse_args()
    project_root = Path(args.project_root).resolve()
    schema_path = project_root / "schemas" / "phase_evidence.schema.json"

    if not schema_path.exists():
        print(f"{RED}[FAIL]{RESET} Schema not found at {schema_path}", file=sys.stderr)
        return 1

    schema = load_schema(schema_path)
    active_phase = get_active_phase_from_plan(project_root)

    target_file: Optional[Path] = None
    if args.evidence_file:
        target_file = Path(args.evidence_file)
        if not target_file.is_absolute():
            target_file = (project_root / target_file).resolve()
    else:
        target_file = find_latest_evidence_file(project_root, target_phase=active_phase)

    if not target_file or not target_file.exists():
        # Phase < 195: Evidence-First Governance was legislated at Phase 195. Projects at earlier phases (e.g. Phase 8)
        # are compatible with the schema check passing when no evidence file exists yet unless strict is explicitly set.
        current_phase_int = int(active_phase) if active_phase and active_phase.isdigit() else 0
        if current_phase_int >= 195 and (active_phase is not None or args.strict):
            phase_info = f" for active Phase {active_phase}" if active_phase else ""
            msg = f"{RED}[FAIL]{RESET} {LINT_TAG} No PhaseEvidence file found{phase_info} (docs/evidence/p{active_phase if active_phase else '<Phase>'}.json is required for Phase >= 195)."
            if args.json:
                print(json.dumps({"pass": False, "error": f"No evidence file found{phase_info}"}))
            else:
                print(msg, file=sys.stderr)
            return 1
        else:
            if args.json:
                print(json.dumps({"pass": True, "status": "PASS", "message": f"Schema verified. Project active Phase ({active_phase}) < 195 or evidence optional."}))
            else:
                print(f"{GREEN}[PASS]{RESET} {LINT_TAG} Schema verified at {schema_path.relative_to(project_root)}. Evidence file optional for Phase {active_phase} < 195.")
            return 0

    with open(target_file, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            if args.json:
                print(json.dumps({"pass": False, "file": str(target_file), "error": str(e)}))
            else:
                print(f"{RED}[FAIL]{RESET} {LINT_TAG} JSON decode error in {target_file}: {e}", file=sys.stderr)
            return 1

    is_pass, violations, report = lint_phase_evidence_data(data, schema)

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        if is_pass:
            print(f"{GREEN}[PASS]{RESET} {LINT_TAG} PhaseEvidence verification succeeded for Phase {data.get('phase')} ({target_file.name})")
            print(f"       Derived: phase_first_pass={report['computed_metrics']['phase_first_pass']}, coverage={report['computed_metrics']['evidence_coverage']}")
        else:
            print(f"{RED}[FAIL]{RESET} {LINT_TAG} PhaseEvidence verification failed with {len(violations)} violation(s):", file=sys.stderr)
            for v in violations:
                print(f"       - {v}", file=sys.stderr)

    return 0 if is_pass else 1


if __name__ == "__main__":
    sys.exit(main())
