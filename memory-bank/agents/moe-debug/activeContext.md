# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: Phase 20 Step 7b 物理收口（429 细粒度拆分：TPM/RPM 瞬时限额 vs 每日配额耗尽）。
- **Status**: `[RELEASE_STATUS: COMPLETE]` — commit `f437fef`，树哈希 `38939b89…f84` 四树同一性实测成立，Tag `v1.3.10-p20` 已推送 myfork，sync_all 全局广播 PASS。

## 运维记录 (2026-10-21 双容器串行金丝雀发布与关卡 2.1a 跑测脱脂)
- 8317 节点发布: `remote_8317_deploy.sh` 顺利完成，容器新鲜重启 `Up (healthy)`，HTTP 200，端到端实际出字 `gemini-3.8-flash` 推理成功。
- 8316 专线节点发布: 8317 稳定后执行 `remote_8316_deploy.sh`，容器重启 `Up (healthy)`，HTTP 200，流式与非流式端到端推理成功出字。
- 关卡 2.1a 验收: 全套单元测试（50 个测试用例）全部通过退出码 0，内存库 Token 限制与零幽灵文件预检全部通过，核心格式与日志规范全绿。

## 最新验证与提交记录 (2026-10-21 关卡 2.1a 终审前清洗)
1. **单测全绿 (PASS / 退出码实测)**:
   - `npm test` → EXIT 0（50/50 pass / 0 fail / duration ~1.2s）；
   - `LEGACY_REF_COUNT == 0` 静态与动态断言 100% 成立。
2. **四维脱脂清洗凭据**:
   - `audit_token_limits.py` → PASS (All memory-bank assets within 4096 Tokens)；
   - `audit_memory_bank.py` → PASS (Zero ghost files)；
   - `lint_core_file_format.py` → PASS (All core files passed ECT-S/A validation)；
   - `lint_routine_maintenance.py` → PASS；
   - `compile_engineering_atlas.py --check` → PASS (Manifest ~1766 Tokens ≤ 3500)；
   - `[ROUTINE_MAINTENANCE_CLEANSED: PASS]`.

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **Build 通道 429 配额保真与熔断切号自愈 (P0)**: Build 通道 429 降级 Playground 失败严禁被 400/503 掩盖，必须强制保真 429 状态码与 Google 配额特征；`buildChannelBlocked` 仅对 403 权限异常置 true，429 仅触发 QuotaGuard until-refresh 熔断（`getNextResetTimestamp()` 禁用至下一个每日 15:00 CST 刷新，15:00 后触发则至明日）与即时切号自愈。
2. **上游 400 智能切号与跨账号同签名早停守卫 (P0)**: `isUpstreamProxy400` 识别 Google 400 即时切号；同一请求在 ≥3 个不同账号遇到完全相同的 400 错误签名时触发早停守卫，终止全池穷举盲等（由 11 分钟降至秒级），保真直传原始 400 并标记 `skipFinalFailureSwitch` 阻止多余切号。
3. **同宿主机多容器双轨隔离与串行金丝雀发布 (P0)**: 同宿主机部署同构容器（8316 专线 / 8317 综合网关）必须显式隔离 Compose 文件、业务 HTTP 端口与 WebSocket 端口；部署时恪守串行金丝雀铁律，逐节点升级验证，严禁全量同时重启。**双节点均启用 `API_KEYS`（部署链内事实，`sk-123456`，见 `docker-compose.yml` 与 `docker-compose.8316.yml`），真实推理探针必须携带 `Authorization: Bearer <KEY>`，裸 curl 会获 401 假阴性。**
4. **远端部署脚本超时熔断与后台续跑模式 (P0)**: `remote_831X_deploy.sh` 全链路（本地 vite build + rsync + 远端 docker build + compose down/up）总耗时超出 MCP bash 前台约 2 分钟服务端硬熔断，前台直跑必得 "Request timed out"；标准模式为 `mcp_bash_run_background` 启动 + 独立调用以 `kill -0 <PID>` 轮询终态，严禁重复触发部署脚本引发 rsync/docker build 竞态；MCP 熔断不杀死已派生进程，恢复后先查进程与容器状态再续。
5. **容器重启后金丝雀探针三陷阱 (P0)**: ①冷启动切换窗口——首发探针撞上 403 Region→切号→队列关闭（reconnect_cleanup）返回 503，属瞬态，待 "Account switch completed" 日志后重试即过；②模型级 404——`gemini-2.5-flash` 在部分账号 Build/Playground 双通道均报 "Requested entity was not found"，探针应选 `gemini-flash-latest` 等经实测可用模型；③生产并发碰撞——8316 常驻承载 129K token 重型推理，探针 503 先查日志确认是否与真实流量并发，健康容器上瞬态 503 严禁误判发布失败。
6. **Xray TypedArray 跨界访问禁忌与字符串纯化 (P0)**: 严禁跨 Xray 边界读写 TypedArray/ArrayBuffer（会触发 `Accessing TypedArray data over Xrays is slow, and forbidden` 导致 Build 渠道降级）；哈希与摘要计算通过 Content 端 Helper 完成，仅跨界传递 primitive string。
7. **协议头捕获非侵入化 (Playwright request 监听代替 fetch 劫持)**: 前端侵入式重写 `window.fetch` 易破坏 CSP 与引发 Xray 权限崩溃；通过 Node 端 Playwright `page.on("request")` 纯外层非侵入捕获 public headers 并回填，实现页面 100% 原生加载。
8. **Git 发布收口五步实测断言与本仓库远程拓扑 (P0)**: 收口标准流=①提交前 `git write-tree` 预校验暂存树==核准哈希（消灭三态分裂）→②commit 后 `git rev-parse HEAD^{tree}` 复验→③`git rev-parse <tag>^{}` 断言解引用指向 HEAD→④push 后 `git ls-remote` 实测远端分支/Tag 终态逐字节一致；**本仓库远程拓扑为硬事实：`origin` = iBUHub 上游库（无写权限，零发布 Tag），发布远程为 `myfork` = ouni3 fork（分支跟踪 remote 与历史 Tag v1.3.x 全部落点），严禁盲推 origin**；gitea 远程在本仓库缺席记 EXEMPT；`.husky/pre-commit` 因非可执行被 git 忽略属无害 hint，commit-msg CLAIRE 钩子正常生效。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- HEAD: `f437fef` (Phase 20 收口提交) + Tag `v1.3.10-p20`，上一结算锚点 `98c584e…` + Tag `v1.3.9-p19`
- 状态: 工作区 `--porcelain` 零输出 100% 清洁，myfork 远端分支与 Tag 终态实测与本地一致；Phase 20 (429 细粒度拆分) 结算闭环完成。
