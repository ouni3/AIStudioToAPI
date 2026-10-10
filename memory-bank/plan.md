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

## 2. 活跃 Phase 状态与施工记录

### Phase 12: Manual Account Enable/Disable Switch in Management Console (ACTIVE_PHASE)
- 为 Web 控制台账号管理列表新增即时生效的启用/停用开关，彻底解决个别异常账号在后台反复报错穿透的痛点：
  1. `src/auth/AuthSource.js`: 为账号实体注入 `disabled` 属性与持久化识别，提供 `updateAccountStatus(index, { disabled })` 原子写盘与内存热重载；轮询与故障转移调度天然排除停用账号；
  2. `src/auth/AuthSwitcher.js`: 停用当前活跃账号时触发无缝平滑切号，并防御性拦截对停用账号的手动切换；
  3. `src/core/BrowserManager.js` & `src/routes/StatusRoutes.js`: 暴露 `/api/accounts/:index/status` PUT 接口；
  4. `ui/app/pages/StatusPage.vue`: 账号列表新增状态滑动开关 (ElSwitch) 与中英文国际化语言包；
  5. `tests/test_account_enable_disable.mjs`: 编写包含轮询排除、手动切换拦截与持久化行为单测 (100% PASS)；
  6. 104 服务器 8316 节点（`aistudio-to-api-custom:8316`）与 8317 主节点（`aistudio-to-api-custom:latest`）均已完成独立镜像构建与平滑重启探活，返回 200 OK 与最新账号状态载荷；
  7. Claire 微观体验与调用方 DX 走查双 PASS，理事长下达更新与结算指示 `[CHAIRMAN_EXPERIENCE_APPROVED]`；
  8. audit-expert R1/R2 VETO 打回项已全部清偿，提请终审。

- 门禁状态: `PASS_PENDING_COMMIT`

---

## 3. 历史 Phase 归档与演进概览

| Phase | 核心成果 | 状态 |
|:---|:---|:---|
| Phase 1 | 双容器拓扑部署与 403/404 容错自愈 | 已归档 |
| Phase 2 | 模型 404/503 循环切号卡死修复与空返回兜底 | 已归档 |
| Phase 3 | 模型名非法字符清洗与 8317 崩溃自愈 | 已归档 |
| Phase 4 | 时间范围筛选收敛与 104 远程按需调度脚本 | 已归档 |
| Phase 5 | 全景控制台 DevState 10 大门禁 100% 达标收敛 | 已归档 |
| Phase 6 | 核心 LLM 推理引擎 SR 等级全方位整改与加固 | 已归档 |
| Phase 7 | Thinking-Only 注入无害 Kilocode glob 操作防进程中断 | 已归档 |
| Phase 8 | 全量 CI/CD 缺陷门禁补齐与全景 DevState 100% 合规闭环 | 已归档 (`36ab57a`) |
| Phase 9 | 模型名 '-' 防御清洗与 404 切号防雪崩状态机加固 | 已归档 |
| Phase 10 | 切号防抖、账号惩罚冷却、400 错误隔离与 Ambiguous Service 阻断 | 已归档 (`c84bc60`) |
| Phase 11 | Google 404 Ambiguous Service 自愈重试与下游 503 弹性映射 | 已归档 (`f1da756`) |
| Phase 12 | 控制台账号手动启用/停用开关与调度热隔离 | 进行中 |

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
- [x] Phase 7 核心改造：Thinking-Only 兜底由纯文本升级为标准无害 `glob` 工具调用 (`FormatConverter.js`)
- [x] Phase 7 核心改造：OpenAI / Claude / Response API 流式与非流式统一生成 `glob` tool_call / tool_use 载荷
- [x] Phase 7 自动化测试：更新并补充 OpenAI 与 Claude 的 Thinking-Only 流式与非流式单测用例 (8/8 PASS)
- [x] Phase 7 体验审查：Claire 调用方 DX 体验走查与黑盒业务载荷切片审查完成 (PASS)
- [x] Phase 7 服务器更新：固化 `remote_8317_deploy.sh` 脚本，代码增量推送到 104 并完成定制镜像重建与平滑重启
- [x] Phase 7 生产探活：104 容器 8317 活跃健康检查 (HTTP 200 OK) 与 `/v1/models` 业务端点验证通过
- [x] Phase 7 资产登记：更新 `memory-bank/assets.md` 部署物档案为 `v1.3.5-p7` (DEPLOYED_HEALTHY)
- [x] Phase 10 切号防抖、账号惩罚冷却、400 客户端参数错误隔离加固 (`c84bc60`)
- [x] Phase 11 Google 404 Ambiguous Service 自愈换号与 OpenAI 出口 503 弹性映射
- [x] 104 服务器 8316 端口同构容器复刻部署与真实探活 (专用于 Pro 模型调用通道，隔离内部 WS 端口 9997)
- [x] 建立 `scripts/dev/remote_8316.sh` 运维调度脚本与 package.json npm scripts 绑定
- [x] 取消 8316 与 8317 双端口 Web 控制台界面登录密钥验证（免密直通），并完成双容器同步更新与探活验证
- [x] Phase 12 控制台账号手动启用/停用开关、原子写盘持久化与调度热隔离闭环

---

## 5. 多 Phase 并行登记 (Multi-Phase Registry)
- Primary Phase: `Phase 12 (Manual Account Enable/Disable Switch in Management Console)` [ACTIVE_PHASE]
- Secondary Phases: 无

---

## 6. Canary 锚点 (Rule Section Canary & Audit Gate)
- `AUDIT_QUORUM_EXHAUSTED` `CHAIRMAN_ESCALATION_REQUIRED` `N_max` `LEGISLATIVE_MANUAL_OVERRIDE` `Phase 218` `Phase 22` `Phase 226` `[a-f0-9]{32}` `verify_git_gate.py`
