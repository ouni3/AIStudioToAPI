# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: Phase 18 结算治理账本提交与工作区零污染收口。
- **Status**: 结算治理文件物理提交与推送全部完成 (PASS)。工作区 100% 洁净。

## 最新验证与提交记录
1. **结算治理账本提交与推送 (PASS / 本期)**:
   - 依法将小奏在结算白名单内更新的治理账本文件（`docs/aes_summaries/p18-aes-summary.md`、`memory-bank/aes-history.md`、`memory-bank/plan.md`、`memory-bank/agents/moe-orchestrator/activeContext.md`）提交至本地仓库；
   - 提交哈希: `c98b668` (`docs(settlement): close phase 18 settlement ledger and release receipt`)；
   - 成功推送到远端 `myfork/feat/deploy-104-container-failover`，工作区达到完全洁净状态 (`working tree clean`)。
2. **全套单测运行 (PASS)**:
   - 全套单测 `npm test`: 48/48 PASS，退出码 0；
   - 覆盖 Build 429 降级 Playground 400 强保 429 状态码断言、403 buildChannelBlocked 标志位设置、跨账号 400 同签名早停及 QuotaGuard 2 小时熔断。
3. **8317 独立金丝雀部署与隔离断言 (PASS)**:
   - 8316 独立容器（`aistudio-to-api-8316`）全程保持 Up & healthy，零重启、零触碰；
   - 8317 (`aistudio-to-api`) 经 `remote_8317_deploy.sh` 完成 UI 构建、代码增量 rsync、镜像构建与容器平滑重启；
   - 8317 容器内核心文件 MD5 与本地 HEAD 严格对齐。
4. **8316 专线金丝雀同步与全链路验收 (PASS)**:
   - `remote_8316_deploy.sh` 执行成功，容器内 3 文件 MD5 严格一致；
   - `/health` HTTP 200，真实推理 `POST /v1/chat/completions` 完整出字 `"8316 CANARY OK"`，HTTP 200。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **Build 通道 429 配额保真与熔断切号自愈 (P0)**: Build 通道 429 降级 Playground 失败严禁被 400/503 掩盖，必须强制保真 429 状态码与 Google 配额特征；`buildChannelBlocked` 仅对 403 权限异常置 true，429 仅触发 QuotaGuard 2 小时临时熔断与即时切号自愈。
2. **上游 400 智能切号与跨账号同签名早停守卫 (P0)**: `isUpstreamProxy400` 识别 Google 400 即时切号；同一请求在 ≥3 个不同账号遇到完全相同的 400 错误签名时触发早停守卫，终止全池穷举盲等（由 11 分钟降至秒级），保真直传原始 400 并标记 `skipFinalFailureSwitch` 阻止多余切号。
3. **同宿主机多容器双轨隔离与串行金丝雀发布 (P0)**: 同宿主机部署同构容器（8316 专线 / 8317 综合网关）必须显式隔离 Compose 文件、业务 HTTP 端口与 WebSocket 端口；部署时恪守串行金丝雀铁律，逐节点升级验证，严禁全量同时重启。**8316 专线启用 `API_KEYS` 鉴权（部署链内事实，见 `docker-compose.8316.yml`），真实推理探针必须携带 `Authorization: Bearer <KEY>`，裸 curl 会获 401 假阴性。**
4. **Build 通道 parametersJsonSchema 互斥校验与双通道工具编码 (P0)**: `normalizeBuildRequestBody` 严禁为 `parameters` 补写 `parametersJsonSchema`，否则触发上游 Google API 互斥校验 400；Playground 通道则通过位置参数数组准确传递工具列表；探活必须以返回合法 `tool_calls` 为二值成功判定。
5. **Camoufox/Firefox Xray 跨边界沙箱穿透与零污染 Hook (P0)**: 严禁从 Sandbox 向 Content Window 属性直接赋普通 Sandbox 函数（会触发 `Permission denied to access object` 导致 Angular 顶层崩溃）；必须通过 `pageWindow.eval` 在 Content 作用域内创建原生 wrapper。
6. **Xray TypedArray 跨界访问禁忌与字符串纯化 (P0)**: 严禁跨 Xray 边界读写 TypedArray/ArrayBuffer（会触发 `Accessing TypedArray data over Xrays is slow, and forbidden` 导致 Build 渠道降级）；哈希与摘要计算通过 Content 端 Helper 完成，仅跨界传递 primitive string。
7. **协议头捕获非侵入化 (Playwright request 监听代替 fetch 劫持)**: 前端侵入式重写 `window.fetch` 易破坏 CSP 与引发 Xray 权限崩溃；通过 Node 端 Playwright `page.on("request")` 纯外层非侵入捕获 public headers 并回填，实现页面 100% 原生加载。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover` (与 `myfork/feat/deploy-104-container-failover` 严格对齐)
- 提交: `1d36346301524cbe84b4ae105b2e1daf318cd1bd`
- Tag: `v1.3.8-p18`
- 状态: Phase 18 物理 Git 提交、Tag 打标与远程推送完成，工作区保持物理零污染 (clean)。
