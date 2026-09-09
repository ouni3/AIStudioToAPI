#!/usr/bin/env python3
"""
sync_deployment_version.py — 全系交付态部署物版本与 assets.md 档案自动同步管道
SSOT: skills/deployment-artifact-archiving-flow/SKILL.md §3
"""
import re
import sys
import json
from pathlib import Path

def get_active_phase(root: Path) -> str:
    plan_path = root / "memory-bank" / "plan.md"
    if not plan_path.exists():
        return "1"
    content = plan_path.read_text(encoding="utf-8")
    m = re.search(r'Primary Phase:\s*`?Phase\s*(\d+)`?', content, re.I)
    if not m:
        m = re.search(r'ACTIVE_PHASE\*?\*?:\s*`?Phase\s*(\d+)`?', content, re.I)
    if not m:
        m = re.search(r'Phase\s*(\d+)', content)
    return m.group(1) if m else "1"

def get_package_version(root: Path) -> str:
    pkg_path = root / "package.json"
    if not pkg_path.exists():
        return "1.0.0"
    data = json.loads(pkg_path.read_text(encoding="utf-8"))
    return data.get("version", "1.0.0")

def sync_assets_md(root: Path, full_version: str, phase: str) -> bool:
    assets_path = root / "memory-bank" / "assets.md"
    if not assets_path.exists():
        print(f"[WARN] assets.md not found at {assets_path}")
        return False

    content = assets_path.read_text(encoding="utf-8")

    # 1. 替换部署物表格中的版本编号: `vX.Y.Z-p<Phase>`
    content = re.sub(
        r'`v\d+\.\d+\.\d+-p\d+`',
        f'`{full_version}`',
        content
    )
    # 2. 替换归属 Phase 列: | Phase <Phase> |
    content = re.sub(
        r'(\|\s*Phase\s*)\d+(\s*\|)',
        rf'\g<1>{phase}\g<2>',
        content
    )
    # 3. 替换最新探活指纹中的 version: version: `vX.Y.Z-p<Phase>`
    content = re.sub(
        r'(version:\s*)`v\d+\.\d+\.\d+-p\d+`',
        rf'\g<1>`{full_version}`',
        content
    )

    assets_path.write_text(content, encoding="utf-8")
    print(f"[SyncArtifact] Successfully synced assets.md to {full_version}")
    return True

def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    phase = get_active_phase(root)
    pkg_ver = get_package_version(root)
    full_ver = f"v{pkg_ver}-p{phase}"

    print(f"[SyncArtifact] Detected package version: {pkg_ver}, active phase: {phase}")
    print(f"[SyncArtifact] Target version tag: {full_ver}")

    success = sync_assets_md(root, full_ver, phase)
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
