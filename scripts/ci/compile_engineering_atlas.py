#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
compile_engineering_atlas.py — 全系项目工程全息骨架星图编译器与 JSON 双态派生器

职责契约 (P0 / 理事长最高指示):
1. 在泳道 B 关卡 2.1c 执行，增量刷新 docs/prototypes/project_engineering_atlas.html
2. 注入真实 source_tree_hash 与破立行数 (added_lines, deleted_lines)
3. 单源派生导出纯 JSON 快照 memory-bank/engineering-atlas.json (≤ 3500 Tokens)，
   供全域 L1 接单第 1 步零噪点极速直读，彻底消除 Token 爆炸与上下文氧化。
"""

import os
import sys
import json
import re
import subprocess
import argparse
from pathlib import Path

MANIFEST_SCRIPT_REGEX = re.compile(
    r'(<script\s+id=["\']ssot-engineering-manifest["\']\s+type=["\']application/json["\']>)(.*?)(</script>)',
    re.DOTALL
)

def get_git_churn(repo_path: Path):
    """通过 git diff --numstat 统计当前未暂存 + 暂存区总变更行数"""
    added = 0
    deleted = 0
    try:
        # 统计暂存区
        res_cached = subprocess.run(
            ["git", "diff", "--cached", "--numstat"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=False
        )
        for line in res_cached.stdout.strip().splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                added += int(parts[0])
                deleted += int(parts[1])

        # 统计工作区未暂存
        res_unstaged = subprocess.run(
            ["git", "diff", "--numstat"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=False
        )
        for line in res_unstaged.stdout.strip().splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                added += int(parts[0])
                deleted += int(parts[1])
    except Exception as e:
        sys.stderr.write(f"[WARN] 统计 git churn 失败: {e}\n")
    return added, deleted

def get_tree_hash(repo_path: Path):
    """获取当前暂存区树哈希，若暂存区为空则回退到 HEAD 树"""
    try:
        res = subprocess.run(
            ["git", "write-tree"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=False
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass

    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD^{tree}"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=False
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass
    return "0000000000000000000000000000000000000000"

def compile_atlas(
    html_path: Path,
    json_path: Path,
    source_tree_hash: str = None,
    batch_info: str = None,
    check_only: bool = False
):
    if not html_path.exists():
        sys.stderr.write(f"[ERROR] 目标 HTML 不存在: {html_path}\n")
        sys.exit(1)

    content = html_path.read_text(encoding="utf-8")
    match = MANIFEST_SCRIPT_REGEX.search(content)
    if not match:
        sys.stderr.write(f"[ERROR] 未在 {html_path} 中找到 <script id=\"ssot-engineering-manifest\"> 标签！\n")
        sys.exit(1)

    raw_json = match.group(2).strip()
    try:
        manifest_data = json.loads(raw_json)
    except Exception as e:
        sys.stderr.write(f"[ERROR] 解析 Manifest JSON 失败: {e}\n")
        sys.exit(1)

    repo_path = html_path.parent.parent
    added_lines, deleted_lines = get_git_churn(repo_path)
    if not source_tree_hash:
        source_tree_hash = get_tree_hash(repo_path)

    # 增量更新 settlement_seal
    if "settlement_seal" not in manifest_data:
        manifest_data["settlement_seal"] = {}

    seal = manifest_data["settlement_seal"]
    if source_tree_hash and source_tree_hash != "0000000000000000000000000000000000000000":
        seal["source_tree_hash"] = source_tree_hash

    if batch_info:
        seal["batch_pool_size"] = batch_info

    # 仅当检测到真实变动时更新行数
    if added_lines > 0 or deleted_lines > 0:
        net_delta = added_lines - deleted_lines
        status = "NEGENTROPY_FLOW" if net_delta <= 0 else "CONTROLLED_EXPANSION"
        seal["net_entropy_ratio"] = {
            "added_lines": added_lines,
            "deleted_lines": deleted_lines,
            "net_delta": net_delta,
            "status": status
        }

    formatted_json = json.dumps(manifest_data, ensure_ascii=False, indent=2)
    estimated_tokens = len(formatted_json) / 2.5
    print(f"[INFO] Manifest 结构化快照估算 Tokens: ~{int(estimated_tokens)} (限额: ≤ 3500 Tokens)")

    if estimated_tokens > 3500:
        sys.stderr.write(f"[WARN] Manifest 体积逼近或超过 3500 Tokens 上限: ~{int(estimated_tokens)} Tokens\n")

    if check_only:
        print("[CHECK_MODE] 校验通过，未写入任何文件。")
        return

    # 1. 替换回写 HTML
    new_script_tag = f"{match.group(1)}\n  {formatted_json}\n  {match.group(3)}"
    new_html = MANIFEST_SCRIPT_REGEX.sub(lambda m: new_script_tag, content, count=1)
    html_path.write_text(new_html, encoding="utf-8")
    print(f"[COMPILED] 已增量刷新工程星图 HTML: {html_path}")

    # 2. 单源派生导出纯 JSON 快照
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(formatted_json + "\n", encoding="utf-8")
    print(f"[EXPORTED] 已单源派生纯 JSON 架构快照: {json_path}")

def main():
    parser = argparse.ArgumentParser(description="Moe特遣舰队工程星图编译器与 JSON 双态派生器")
    parser.add_argument("--html", type=str, default="docs/prototypes/project_engineering_atlas.html", help="目标 HTML 路径")
    parser.add_argument("--output-json", type=str, default="memory-bank/engineering-atlas.json", help="派生 JSON 路径")
    parser.add_argument("--source-tree-hash", type=str, default=None, help="显式指定源码树哈希")
    parser.add_argument("--batch", type=str, default=None, help="批次信息描述，如 'Batch 1/3 (L_GOV & L_INFRA)'")
    parser.add_argument("--check", action="store_true", help="仅校验，不修改文件")

    args = parser.parse_args()
    compile_atlas(
        html_path=Path(args.html),
        json_path=Path(args.output_json),
        source_tree_hash=args.source_tree_hash,
        batch_info=args.batch,
        check_only=args.check
    )

if __name__ == "__main__":
    main()
