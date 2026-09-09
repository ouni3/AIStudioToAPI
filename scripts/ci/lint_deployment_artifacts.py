#!/usr/bin/env python3
"""
lint_deployment_artifacts.py — ADVG 部署物档案与版本号一致性门禁
SSOT: skills/deployment-artifact-archiving-flow/SKILL.md §2 & §5.2
"""
import re
import sys
import json
from pathlib import Path

REQUIRED_ARTIFACT_IDS = [
    "ART-ASTOAPI-8317",
    "ART-ASTOAPI-8318",
]

SCHEMA_HEADERS = [
    "部署物 ID",
    "部署形态",
    "版本编号 (Version Tag)",
    "访问链接 / 访问入口",
    "运行时镜像/基线",
    "绑定地址与端口",
    "探活端点与契约",
    "归属/更新 Phase",
    "部署状态",
    "最新探活指纹",
]

def get_current_package_version(project_root: Path) -> str:
    pkg_file = project_root / "package.json"
    if not pkg_file.exists():
        return ""
    data = json.loads(pkg_file.read_text(encoding="utf-8"))
    return data.get("version", "")

def get_active_phase(project_root: Path) -> str:
    plan_file = project_root / "memory-bank" / "plan.md"
    if not plan_file.exists():
        return ""
    content = plan_file.read_text(encoding="utf-8")
    # 匹配 Primary Phase: `Phase X` 或 ACTIVE_PHASE: Phase X
    m = re.search(r'Primary Phase:\s*`?Phase\s*(\d+)`?', content, re.I)
    if not m:
        m = re.search(r'ACTIVE_PHASE\*?\*?:\s*`?Phase\s*(\d+)`?', content, re.I)
    if not m:
        m = re.search(r'Phase\s*(\d+)', content)
    return m.group(1) if m else ""

def main() -> int:
    project_root = Path(__file__).resolve().parent.parent.parent
    assets_file = project_root / "memory-bank" / "assets.md"

    if not assets_file.exists():
        print(f"[FAIL] memory-bank/assets.md not found at {assets_file}")
        return 1

    content = assets_file.read_text(encoding="utf-8")

    # 1. 检查 ADVG 10 列 Schema 表头
    header_missing = [h for h in SCHEMA_HEADERS if h not in content]
    if header_missing:
        print(f"[FAIL] assets.md missing ADVG Schema headers: {header_missing}")
        return 1
    print(f"[PASS] assets.md contains all 10 ADVG Schema headers.")

    # 2. 检查必要部署物 ID
    missing_ids = [art_id for art_id in REQUIRED_ARTIFACT_IDS if art_id not in content]
    if missing_ids:
        print(f"[FAIL] Missing required artifact IDs in assets.md: {missing_ids}")
        return 1
    print(f"[PASS] All required artifact IDs present: {REQUIRED_ARTIFACT_IDS}")

    # 3. 校验版本编号格式是否符合 v<version>-p<phase>
    pkg_ver = get_current_package_version(project_root)
    active_phase = get_active_phase(project_root)
    expected_version_tag = f"v{pkg_ver}-p{active_phase}" if pkg_ver and active_phase else ""

    version_pattern = re.compile(r'`v\d+\.\d+\.\d+-p\d+`')
    found_tags = version_pattern.findall(content)

    if not found_tags:
        print("[FAIL] No valid version tags matching `v<version>-p<phase>` found in assets.md")
        return 1

    print(f"[PASS] Found version tags: {set(found_tags)}")
    if expected_version_tag:
        expected_wrapped = f"`{expected_version_tag}`"
        if expected_wrapped not in content:
            print(f"[WARN] Expected target version tag {expected_wrapped} not found in assets.md yet (run sync_deployment_version.py to sync)")
        else:
            print(f"[PASS] Expected target version tag {expected_wrapped} confirmed in assets.md.")

    return 0

if __name__ == "__main__":
    sys.exit(main())
