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

### ACTIVE_PHASE: Phase 20 (429 错误精细分流 (TPM/RPM 瞬态限频零关号仅切号冷却 vs 每日配额耗尽关号至 15:00) 与双容器平滑上线)
- 当前活跃: Phase 20
- 当前状态: 终审结算中
- Release Receipt:
  - Phase: 20
  - Commit: 待提交
  - Tag: v1.3.10-p20
  - Remote Push: 待推送
  - Closed: 2026-10-21T18:50:00+08:00
  - Status: SETTLED_PENDING_COMMIT

---

## 3. 历史 Phase 归档与演进概览

| Phase | 核心成果 | 状态 |
|:---|:---|:---|
| 1 | 双容器拓扑部署与 403/404 容错自愈 | 已归档 |
| 2 | 模型 404/503 循环切号卡死修复与空返回兜底 | 已归档 |
| 3 | 模型名非法字符清洗与 8317 崩溃自愈 | 已归档 |
| 4 | 时间范围筛选收敛与 104 远程按需调度脚本 | 已归档 |
| 5 | 全景控制台 DevState 10 大门禁 100% 达标收敛 | 已归档 |
| 6 | 核心 LLM 推理引擎 SR 等级全方位整改与加固 | 已归档 |
| 7 | Thinking-Only 注入无害 Kilocode glob 操作防进程中断 | 已归档 |
| 8 | 全量 CI/CD 缺陷门禁补齐与全景 DevState 100% 合规闭环 | 已归档 (`36ab57a`) |
| 9 | 模型名 '-' 防御清洗与 404 切号防雪崩状态机加固 | 已归档 |
| 10 | 切号防抖、账号惩罚冷却、400 错误隔离与 Ambiguous Service 阻断 | 已归档 (`c84bc60`) |
| 11 | Google 404 Ambiguous Service 自愈重试与下游 503 弹性映射 | 已归档 (`f1da756`) |
| 12 | 控制台账号手动启用/停用开关与调度热隔离 | 已归档 |
| 13 | 专属模型每日100次配额硬熔断退池与15:00自动恢复生命周期 | 已归档 (`8316/8317已上线`) |
| 14 | 废除100次调用上限、429物理关号2小时与UI文案对齐 | 已归档 (`8316/8317已上线`) |
| 15 | 8316/8317物理凭据与统计口径绝对隔离与8317独立部署 | 已归档 (`3bcd59d`) |
| 16 | 双通道中继架构支持(Playground+Build)与8316专线独立部署 | 已归档 (`b4bbcf2`) |
| 17 | 8317 综合网关 400 根治与双通道架构平权升级及金丝雀上线 | 已归档 (`ca8a5c0`) |
| 18 | 8316/8317 双节点 400 早停守卫与 429 配额保真平权升级及金丝雀上线 | 已归档 (`1d36346`) |
| 19 | 429 配额用尽熔断升级为直接关闭直到每日 15:00 CST 刷新时间与双容器平滑上线 | 已归档 (`98c584e`) |
| 20 | 429 错误精细分流 (TPM/RPM 瞬态限频零关号仅切号冷却 vs 每日配额耗尽关号至 15:00) 与双容器平滑上线 | 结算中 |

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
- [x] Phase 14 废除 100 次机械限制，实现 429 物理关号 2 小时与双轨自愈生命周期（通道 A 2小时到期自愈 + 通道 B 每日 15:00 CST 兜底解封）
- [x] Phase 14 前端 Web 控制台文案对齐：配额标记更新为“成功调用次数”，关闭态提示 429 限制
- [x] Phase 14 严格遵循双容器串行金丝雀发布铁律：8317 综合网关与 8316 节点先后完成独立镜像构建、平滑重启与真实端到端推理出字探活
- [x] Phase 15 根治 8316/8317 数据卷共享串线问题，将两容器 Compose 挂载固化为独立绝对物理路径，完成 8317 独立重建与业务出字探活
- [x] Phase 16 落地双通道中继架构支持 (Playground + Build 互补)，支持工具调用与 x-upstream-channel 切流
- [x] Phase 16 编写 pure wire 协议编解码模块并完成单测覆盖 (41/41 单测通过)
- [x] Phase 16 8316 节点独立部署脚本与 docker-compose.8316.yml 固化
- [x] Phase 16 104 服务器 8316 节点部署更新与真实业务推理探活通过 (HTTP 200 OK)
- [x] Phase 16 贯彻双通道独立配额与耗尽判定契约，消除 400/429 伪装 503 缺陷，双通道皆耗尽方激活 429 物理熔断
- [x] Phase 16 104 双节点 (8317/8316) 串行金丝雀增量部署与真实流式出字端到端验证通过 (HTTP 200 OK)

---

## 5. 多 Phase 并行登记 (Multi-Phase Registry)
| Phase | 主题 | 状态 |
|:---|:---|:---|
| 18 | 8316/8317 双节点 400 早停守卫与 429 配额保真平权升级及金丝雀上线 | COMPLETED |
| 19 | 429 配额用尽熔断升级为直接关闭直到每日 15:00 CST 刷新时间与双容器平滑上线 | COMPLETED |
| 20 | 429 错误精细分流 (TPM/RPM 瞬态限频零关号仅切号冷却 vs 每日配额耗尽关号至 15:00) 与双容器平滑上线 | IN_PROGRESS |

- Primary Phase: `Phase 20`
- Secondary Phases: 无

---

## 6. Canary 锚点 (Rule Section Canary & Audit Gate)
- `AUDIT_QUORUM_EXHAUSTED` `CHAIRMAN_ESCALATION_REQUIRED` `N_max` `LEGISLATIVE_MANUAL_OVERRIDE` `Phase 218` `Phase 22` `Phase 226` `[a-f0-9]{32}` `verify_git_gate.py`
