# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 429 熔断 Until-Refresh 机制升级的双容器串行金丝雀发布与验证收口。
- **Status**: 泳道 B 关卡 2.1a 四维例保洗礼脱脂进行中：单测全绿 (49/49 pass) + 代码死资产洁净 + 临时碎屑洗脱完成，出具例保清洗凭据。工作区变更待关卡 2.2 原子暂存。

## 运维记录 (2026-10-20 双容器例行重启)
- 104 双容器串行重启完成: `aistudio-to-api` (8317) → `aistudio-to-api-8316` 逐个 `docker restart`, 各 ~15s 达 `healthy`; 双节点 GET / 均 HTTP 200, 启动日志无 error/panic/fatal。标准重启 SOP: ssh fy@192.168.0.104 + 5s 轮询 `docker inspect .State.Health.Status`。

## 最新验证与提交记录 (2026-10-20 复验轮)
1. **单测三证全绿 (PASS / 退出码实测)**:
   - `node tests/test_quota_guard_429_until_refresh.mjs` → EXIT 0；
   - `node tests/test_quota_guard_service.mjs` → EXIT 0；
   - `npm test` → EXIT 0（49/49 pass / 0 fail）。
2. **LEGACY 清零断言 (PASS)**: 业务源码面 (src/tests/ui/scripts/configs/main.js) `banDurationMs`、`2*3600*1000`、`2 hours/2小时` 文案三类旧符号 COUNT=0；仅测试夹具存 3 处 `7200000` 字面量（语义为"未来未过期禁令"模拟值，验证 Channel A 自愈，非旧逻辑引用）；locale quotaExhaustedTooltip 已含 15:00 CST 新语义且 JSON parse 通过。
3. **8317 串行金丝雀 (PASS)**: 部署脚本 EXIT 0；容器 `Up 15 seconds (healthy)` 新鲜重启，8316 全程未触碰；三文件 MD5 本地↔容器一致 (`54061abe…`/`688ea012…`/`d05e158d…`)；探针 HTTP 200 + `"8317 CANARY OK"` (finish_reason=stop)；GET / 双次 200。
4. **8316 专线金丝雀 (PASS)**: 8317 定型放行后启动，脚本 EXIT 0；容器重启 healthy，三文件 MD5 三方 (本地/8317/8316) 一致；探针 HTTP 200 + 分片 `"83"`+`"16 CANARY OK"` 拼接 `"8316 CANARY OK"`；GET / 200。
5. **新 QuotaGuard 遥测双节点生产生效**: 8317 `Account #1 request telemetry count for model "gemini-flash-latest": 1`；8316 `Account #2 request telemetry count for model "gemini-3.8-flash": 37→39`（真实生产流量计数）。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **Build 通道 429 配额保真与熔断切号自愈 (P0)**: Build 通道 429 降级 Playground 失败严禁被 400/503 掩盖，必须强制保真 429 状态码与 Google 配额特征；`buildChannelBlocked` 仅对 403 权限异常置 true，429 仅触发 QuotaGuard until-refresh 熔断（`getNextResetTimestamp()` 禁用至下一个每日 15:00 CST 刷新，15:00 后触发则至明日）与即时切号自愈。
2. **上游 400 智能切号与跨账号同签名早停守卫 (P0)**: `isUpstreamProxy400` 识别 Google 400 即时切号；同一请求在 ≥3 个不同账号遇到完全相同的 400 错误签名时触发早停守卫，终止全池穷举盲等（由 11 分钟降至秒级），保真直传原始 400 并标记 `skipFinalFailureSwitch` 阻止多余切号。
3. **同宿主机多容器双轨隔离与串行金丝雀发布 (P0)**: 同宿主机部署同构容器（8316 专线 / 8317 综合网关）必须显式隔离 Compose 文件、业务 HTTP 端口与 WebSocket 端口；部署时恪守串行金丝雀铁律，逐节点升级验证，严禁全量同时重启。**双节点均启用 `API_KEYS`（部署链内事实，`sk-123456`，见 `docker-compose.yml` 与 `docker-compose.8316.yml`），真实推理探针必须携带 `Authorization: Bearer <KEY>`，裸 curl 会获 401 假阴性。**
4. **远端部署脚本超时熔断与后台续跑模式 (P0)**: `remote_831X_deploy.sh` 全链路（本地 vite build + rsync + 远端 docker build + compose down/up）总耗时超出 MCP bash 前台约 2 分钟服务端硬熔断，前台直跑必得 "Request timed out"；标准模式为 `mcp_bash_run_background` 启动 + 独立调用以 `kill -0 <PID>` 轮询终态，严禁重复触发部署脚本引发 rsync/docker build 竞态；MCP 熔断不杀死已派生进程，恢复后先查进程与容器状态再续。
5. **容器重启后金丝雀探针三陷阱 (P0)**: ①冷启动切换窗口——首发探针撞上 403 Region→切号→队列关闭（reconnect_cleanup）返回 503，属瞬态，待 "Account switch completed" 日志后重试即过；②模型级 404——`gemini-2.5-flash` 在部分账号 Build/Playground 双通道均报 "Requested entity was not found"，探针应选 `gemini-flash-latest` 等经实测可用模型；③生产并发碰撞——8316 常驻承载 129K token 重型推理，探针 503 先查日志确认是否与真实流量并发，健康容器上瞬态 503 严禁误判发布失败。
6. **Xray TypedArray 跨界访问禁忌与字符串纯化 (P0)**: 严禁跨 Xray 边界读写 TypedArray/ArrayBuffer（会触发 `Accessing TypedArray data over Xrays is slow, and forbidden` 导致 Build 渠道降级）；哈希与摘要计算通过 Content 端 Helper 完成，仅跨界传递 primitive string。
7. **协议头捕获非侵入化 (Playwright request 监听代替 fetch 劫持)**: 前端侵入式重写 `window.fetch` 易破坏 CSP 与引发 Xray 权限崩溃；通过 Node 端 Playwright `page.on("request")` 纯外层非侵入捕获 public headers 并回填，实现页面 100% 原生加载。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- HEAD: `860bcd6` (docs(memory) 结算后记忆提交)；上一结算锚点 `1d36346…` + Tag `v1.3.8-p18`
- 状态: 本期 Until-Refresh 机制源码变更 (src/auth/AuthSwitcher.js / src/core/QuotaGuardService.js / tests / ui/locales) 保持未暂存待结算链路处理；双容器生产节点已运行最新代码 (MD5 实证)。
