#!/usr/bin/env python3
"""scripts/ci/lint_logging_standards.py — Phase 222 G15 Logging & FSM Standards CI Gate.

CI Lint Gate verifying fleet logging standards and FSM observability:
1. Scans src/** for .ts, .tsx, .js, .jsx files.
2. Detects raw console invocations (console.log, console.info, console.warn, console.error, console.debug).
3. Whitelist / Exemption rules:
   - src/utils/logger.js, src/utils/logger.ts, src/utils/LoggingService.js (SDK sources) are exempt;
   - Lines or files containing explicit comment `@moe-logger-exempt` (e.g. `// @moe-logger-exempt` or `/* @moe-logger-exempt */`) are exempt.
4. FSM Observability Check:
   - Detects state machine keyword presence (e.g. `StateMachine`, `FSM`, `transition` in class/file);
   - Verifies usage of transition logging / interceptor.
5. Emits detailed file, line number, and offending content on violation.
6. Returns exit code 1 on violations, 0 on success with pass marker.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

LINT_MARKER = "[LINT_LOGGING_STANDARDS_G15]"
PASS_MESSAGE = "[PASS] Logging & FSM standards verification passed."

# Target file extensions
SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx"}

# Raw console call regex: matches console.log, console.info, console.warn, console.error, console.debug
CONSOLE_CALL_PATTERN = re.compile(
    r"\bconsole\.(log|info|warn|error|debug)\s*\(",
    re.MULTILINE
)

# Exemption markers
EXEMPT_COMMENT_PATTERN = re.compile(r"@moe-logger-exempt")

# FSM Keywords for state machine related files
FSM_CLASS_OR_TYPE_PATTERN = re.compile(
    r"(?:class|interface|type)\s+[A-Za-z0-9_]*(?:StateMachine|FSM|StateTransition)[A-Za-z0-9_]*",
    re.MULTILINE
)
FSM_TRANSITION_INTERCEPTOR_PATTERN = re.compile(
    r"(?:fsmTransition|logger\.fsmTransition|\.fsmTransition)\s*\(",
    re.MULTILINE
)

GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
RESET = "\033[0m"

LOGGER_SDK_WHITELIST = {
    "src/utils/logger.js",
    "src/utils/logger.ts",
    "src/utils/LoggingService.js",
    "src/utils/LoggingService.ts",
}


class LoggingViolation:
    def __init__(self, file_path: str, line_no: int, line_content: str, reason: str):
        self.file_path = file_path
        self.line_no = line_no
        self.line_content = line_content.strip()
        self.reason = reason

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file": self.file_path,
            "line": self.line_no,
            "content": self.line_content,
            "reason": self.reason,
        }


def scan_source_file(
    file_path: Path,
    project_root: Path
) -> Tuple[List[LoggingViolation], List[str]]:
    """Scan a single source file for console calls and FSM compliance."""
    rel_path = file_path.relative_to(project_root).as_posix()
    violations: List[LoggingViolation] = []
    warnings: List[str] = []

    # Whitelist check for logger SDK itself
    if rel_path in LOGGER_SDK_WHITELIST or any(rel_path.endswith(w) for w in LOGGER_SDK_WHITELIST):
        return violations, warnings

    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        violations.append(
            LoggingViolation(rel_path, 0, "", f"Failed to read file: {e}")
        )
        return violations, warnings

    # File-level exemption check
    if EXEMPT_COMMENT_PATTERN.search(content):
        first_10_lines = "\n".join(content.splitlines()[:10])
        if EXEMPT_COMMENT_PATTERN.search(first_10_lines):
            return violations, warnings

    lines = content.splitlines()

    for idx, line in enumerate(lines, start=1):
        if EXEMPT_COMMENT_PATTERN.search(line):
            continue

        if idx > 1 and EXEMPT_COMMENT_PATTERN.search(lines[idx - 2]):
            continue

        m = CONSOLE_CALL_PATTERN.search(line)
        if m:
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
                continue

            violations.append(
                LoggingViolation(
                    file_path=rel_path,
                    line_no=idx,
                    line_content=line,
                    reason=f"Raw '{m.group(0)}' invocation detected without @moe-logger-exempt annotation or MoeLogger SDK."
                )
            )

    if FSM_CLASS_OR_TYPE_PATTERN.search(content):
        if not FSM_TRANSITION_INTERCEPTOR_PATTERN.search(content):
            warnings.append(
                f"File '{rel_path}' defines FSM / StateMachine structures but lacks standard `fsmTransition` logging interceptor."
            )

    return violations, warnings


def run_logging_audit(
    src_dir: Path,
    project_root: Path
) -> Tuple[bool, List[LoggingViolation], List[str], int]:
    """Run full logging standards audit over source directory."""
    all_violations: List[LoggingViolation] = []
    all_warnings: List[str] = []
    scanned_count = 0

    if not src_dir.exists():
        return True, all_violations, all_warnings, scanned_count

    for root, _, files in os.walk(src_dir):
        for f in sorted(files):
            ext = os.path.splitext(f)[1].lower()
            if ext in SOURCE_EXTENSIONS:
                file_path = Path(root) / f
                scanned_count += 1
                v, w = scan_source_file(file_path, project_root)
                all_violations.extend(v)
                all_warnings.extend(w)

    passed = len(all_violations) == 0
    return passed, all_violations, all_warnings, scanned_count


def main() -> int:
    parser = argparse.ArgumentParser(description="G15 Gate: Logging & FSM Standards CI Lint")
    parser.add_argument("--src-dir", default="src", help="Path to source directory (default: src)")
    parser.add_argument("--project-root", default=".", help="Path to project root (default: .)")
    parser.add_argument("--json", action="store_true", help="Output result as JSON")

    args = parser.parse_args()
    project_root = Path(args.project_root).resolve()
    src_dir = (project_root / args.src_dir).resolve()

    passed, violations, warnings, scanned_count = run_logging_audit(src_dir, project_root)

    report: Dict[str, Any] = {
        "gate": "G15_LOGGING_AND_FSM_STANDARDS",
        "scanned_files": scanned_count,
        "violations_count": len(violations),
        "violations": [v.to_dict() for v in violations],
        "warnings": warnings,
        "passed": passed,
    }

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print("=" * 70)
        print(f"  CI LINT: {LINT_MARKER}")
        print("=" * 70)
        print(f"Project Root : {project_root}")
        print(f"Source Dir   : {src_dir}")
        print(f"Scanned Files: {scanned_count}")
        print(f"Violations   : {len(violations)}")
        if warnings:
            print(f"Warnings     : {len(warnings)}")
            for w in warnings:
                print(f"  {YELLOW}[WARN]{RESET} {w}")
        print("-" * 70)

        if not passed:
            print(f"{RED}[FAIL] Logging standards violations found:{RESET}")
            for v in violations:
                print(f"  - {v.file_path}:{v.line_no} -> {v.reason}")
                print(f"    Line: {v.line_content}")
            print("=" * 70)
            return 1
        else:
            print(f"{GREEN}{PASS_MESSAGE}{RESET}")
            print("=" * 70)

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
