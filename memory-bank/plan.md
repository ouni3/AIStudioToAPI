# Plan: aistudio-to-api

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 规划高可用双容器与智能切号自愈路线图，确立算力路由中枢的演进与稳定性保障。
> - $L_{User}$: **+** 自动化健康检查、故障转移与配置管理，实现责任主体 $Manual_{IO} \to 0$。
> - $S_{total}$: **+** 规范 Phase 演进节奏与 Canary 门禁，消除无序修改导致的系统状态熵增。
> - $Value_{Delivered}$: **+** 护航稳定持续的 LLM API 算力供给，支持全系产品与开发任务快速迭代。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心 memory-bank 资产)

## 1. 项目愿景与目标 (Vision & Goals)
- **核心定位**: 构建具备多凭据轮询、403/404 智能容错降级与高并发自愈能力的 Google AI Studio 逆向 API 网关。
- **演进路线**:
  - Phase 1: 双容器架构重构、403/404 自愈机制、UI 体验升级与 Memory-Bank 建库。
  - Phase 2: 模型 404/503 循环切号卡死修复、空返回兜底与定级晋升 SR。
  - Phase 3: 模型名 `-` 等非法入参拦截与 8317 崩溃自愈重新部署 (Model Dash Sanitization & Crash Recovery)。

---

## 2. 活跃 Phase 6 状态与施工记录

### 2.1 Phase 6 目标 (Core LLM Inference Engine SR Elevation & Comprehensive Rectification)
- 对标《project-rating-standard》SR 级标准，完成全方位代码加固、容错自愈与合规整改：
  1. 上游错误即时切号自愈：扩充 `immediateSwitchStatusCodes` 为 `[403, 404, 429, 500, 502, 503, 504]`
  2. 异步队列超时看门狗注入：`processClaudeCountTokens` 与 `processOpenAIResponseInputTokens` 消费绑定 `STREAM_CHUNK` 超时控制
  3. 路径清洗防御：消除 `/models/models/` 等重复前缀，防御畸形 404 路由
  4. 自动化测试补齐：新增 `tests/test_upstream_error_codes_failover.mjs`，实现 5/5 全套单元测试 100% PASS
  5. 104 服务器探活：`healthcheck.sh` 双节点状态感知校验通过
  6. 熵健康度扫描与合规：$H_{entropy} = 100.0$，G1~G10 门禁 100% 达标

### 2.2 门禁状态核验明细 (DevState Compliance Verification)
- G1_TOKEN: 🟢 PASS
- G2_PURITY: 🟢 PASS
- G3_GIT_GATE: 🟢 PASS
- G4_E2E: 🟢 PASS
- G5_ADVG: 🟢 PASS
- G6_UI_CONTRAST: 🟢 PASS
- G7_AI_ACCURACY: ⚪ EXEMPT (架构豁免)
- G8_GITIGNORE_CREDENTIALS: 🟢 PASS
- G9_ECT_REMEDIATION: 🟢 PASS
- G10_REFACTOR_DOC_SYNC: 🟢 PASS
- 综合合规得分: 100.0%

---

## 3. 历史 Phase 归档与演进概览

| Phase | 核心成果 | 状态 |
|:---|:---|:---|
| Phase 1 | 双容器拓扑部署与 403/404 容错自愈 | 已归档 |
| Phase 2 | 模型 404/503 循环切号卡死修复与空返回兜底 | 已归档 |
| Phase 3 | 模型名非法字符清洗与 8317 崩溃自愈 | 已归档 |
| Phase 4 | 时间范围筛选收敛与 104 远程按需调度脚本 | 已归档 |
| Phase 5 | 全景控制台 DevState 10 大门禁 100% 达标收敛 | 已归档 |
| Phase 6 | 核心 LLM 推理引擎 SR 等级全方位整改与加固 | 进行中 (待终审) |

---

## 4. 任务清单 (Tasks)
- [x] 104 服务器双容器拓扑部署与端口打通 (8317 / 8318)
- [x] 403 区域受限与 404 畸形模型名自愈逻辑落地
- [x] 黏性代理与死锁优化
- [x] 前端 UI 日期筛选与持久化支持
- [x] 8317 容器浏览器连接卡死排查与重启恢复
- [x] 并发在途请求排空切号与 Google 页面错误误杀修复 (`438d776`)
- [x] 双容器 API 推理接口 200 OK 实测闭环
- [x] Memory-Bank 核心资产建库与更新 (productContext / systemPatterns / plan / profit / assets / aes-history / mermaid)
- [x] 修复模型名错误触发 503 频繁切号卡死问题 (`RequestHandler.js`)
- [x] 修复模型空返回 / Safety 过滤 / Thinking-only 导致下游自动化中断问题 (`FormatConverter.js`)
- [x] 补充单测与自动化验证 (`tests/test_request_handler_validation.mjs`, `tests/test_format_converter_validation.mjs`)
- [x] 全局标准化改造：新增 `scripts/dev/` 启动/停止/健康检查运维三件套脚本并配置 `package.json` 标准化 `npm test` 入口
- [x] 项目定级晋升为 SR 级别 (Super Rare - 系统枢纽级)，注入 Yuuka 评分模型与定级契约断言 (得分 95.60)
- [x] 前端统计筛选自定义时间范围收敛为固定最近 15:00 至次日 15:00 跨日区间与 104 部署物同步验证
- [x] 建立 CI 门禁矩阵脚本 (`scripts/ci/*`) 与 npm verify / lint:ci 工作流
- [x] 实现 104 服务器 8318 按需启停控制脚本 `scripts/dev/remote_8318.sh` 与 package.json 运维命令
- [x] 升级 `scripts/dev/healthcheck.sh` 状态感知机制 (8317 强活跃 + 8318 Standby 合规)
- [x] 建立 `docs/design/ui_ux_archive.md` UI/UX 与 API 调用方 DX 体验走查档案
- [x] 升级 `memory-bank/assets.md` 交付态部署物档案对齐 10 列 ADVG Schema (标注 8318 STANDBY_ON_DEMAND)
- [x] 远程 104 执行 8318 compose 优雅停止与 restart: "no" 冻结实测
- [x] 本地全套测试与 `npm run verify` CI 门禁验证通过
- [x] 补齐 G1, G2, G3, G6, G10 五大缺失门禁脚本与工作流配置
- [x] 实测 DevState 抽取探针，验证 compliance.score 达到 100.0%
- [x] Phase 6 全方位整改：上游 500/502/504 错误即时切号自愈机制落地
- [x] Phase 6 全方位整改：异步队列消费 STREAM_CHUNK 超时看门狗注入与路径重复前缀清洗
- [x] Phase 6 全方位整改：新增 test_upstream_error_codes_failover.mjs 单测，全套测试 5/5 100% PASS
- [x] Phase 6 全方位整改：104 服务器主备节点健康探活验证 (8317 200 OK + 8318 STANDBY)
- [x] Phase 6 全方位整改：全库文件树与熵健康度扫描达标 ($H_{entropy} = 100.0$)
- [x] Phase 6 全方位整改：Claire UI/UX 与 API 调用方 DX 走查通过落盘 (PASS)
- [x] Phase 6 全方位整改：架构模式沉淀至 systemPatterns.md 并更新 activeContext

---

## 5. 多 Phase 并行登记 (Multi-Phase Registry)
- Primary Phase: `Phase 6 (Core LLM Inference Engine SR Elevation & Comprehensive Rectification)` [COMPLETED_SETTLED]
- Secondary Phases: 无

---

## 6. Canary 锚点 (Rule Section Canary & Audit Gate)
- `AUDIT_QUORUM_EXHAUSTED` `CHAIRMAN_ESCALATION_REQUIRED` `N_max` `LEGISLATIVE_MANUAL_OVERRIDE` `Phase 218` `Phase 22` `Phase 226` `[a-f0-9]{32}` `verify_git_gate.py`
