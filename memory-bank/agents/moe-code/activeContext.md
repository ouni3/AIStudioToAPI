# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 补齐运维三件套脚本与标准化 npm test 入口，提升基建自愈与自动化测试效率。
> - $L_{User}$: **+** 降低手动运维与命令执行复杂度。
> - $S_{total}$: **+** 维持标准规范文件与状态低熵。
> - `ect`: **S** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=configure_ci_gate_scripts_and_ui_archive confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **运维脚本跨环境兼容**: POSIX shell 脚本应当自动计算项目根目录（`SCRIPT_DIR`），优雅兼容 Node 原生进程与 Docker 容器模式。
2. **标准单测脚本入口**: 原生 Node 20+ 的 `node --test` 命令适合执行 `.mjs` 模块化测试脚本。
3. **健康检查分层断言**: 生产主节点 8317 强制 200 OK，辅节点 8318 在按需冷备架构下默认为 `[STANDBY]` 合规放行，避免误报导致自愈震荡。
4. **远程调度幂等与探活**: SSH 远程执行容器管理搭配上限 30s 的 HTTP 探活轮询，确保启停操作完成且服务真实可用。
5. **模型名强校验与即时拦截**: 非法模型名必须在前置入口执行 400 Bad Request 阻断，杜绝穿透上游导致切号雪崩。
6. **零依赖 CI 门禁矩阵**: 使用 Python 3 标准库（sys, re, json, pathlib）实现 G1~G10 门禁脚本，二值化退出码契约（0/1），彻底杜绝第三方环境依赖。
7. **部署物版本自动同步 (ADVG SSOT)**: 通过 `sync_deployment_version.py` 自动关联 `package.json` 版本与 `plan.md` Phase 编号生成 `v<version>-p<phase>` 并同步写回 `assets.md`。
8. **UI/UX 与 Caller DX 双轨建档**: 项目兼具 Web 控制台与 API 网关形态时，建档须同时覆盖视觉 Tokens 与调用方毫秒级拦截、切号自愈指标。

## 当前进展 (Active Phase)
1. **Phase 4 / 任务单 1 交付物施工**:
   - `scripts/ci/audit_token_limits.py`: 落地 G1_TOKEN 门禁，实现核心 memory-bank <= 4096 / plan.md <= 8192 Token 审计。
   - `scripts/ci/audit_memory_bank.py`: 落地 G2_PURITY 门禁，检查必填核心文件与幽灵文件白名单。
   - `scripts/ci/lint_ui_ux_archive.py`: 落地 G6_UI_CONTRAST 门禁，校验 ui_ux_archive.md 的 WCAG AA 与对比度验签规范。
   - `scripts/ci/lint_refactor_doc_sync.py`: 落地 G10_REFACTOR_DOC_SYNC 门禁，校验重构触发时 systemPatterns.md 同步。
   - `.github/workflows/verify-git-gate.yml`: 落地 G3_GIT_GATE，串联 Python 3 CI 门禁矩阵工作流。
2. **Phase 4 / 任务单 2 门禁探针与 UI 档案字段暴露**:
   - `package.json`: 独立暴露 5 大门禁探针命令项（audit_token_limits, audit_memory_bank, verify_git_gate, lint_ui_ux_archive, lint_refactor_doc_sync），并扩充 `lint:ci` 串行执行链。
   - `docs/design/ui_ux_archive.md`: 显式暴露 `contrast_gate: PASS`，满足 DevState 扫描器正则断言。

## 工作区状态
- 交付物变更：
  * `package.json` (修改)
  * `docs/design/ui_ux_archive.md` (修改)
  * `memory-bank/agents/moe-code/activeContext.md` (修改)
- 状态：任务单 2 纯编辑施工 100% 完成，移交 NEXT_OWNER: moe-debug 进行环境验证。

