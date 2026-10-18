# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 8316 Pro 专线节点串行同步部署与双节点健康/kilocode形态工具调用可用性验证，完成工程骨架星图版本号对齐与阶段文件暂存。
- **Status**: 8316 节点同步部署完成 (exit 0)；configs/auth 与 data 数据卷独立完整隔离；8316 与 8317 双节点 /health 均 HTTP 200 且 browserConnected: true；8316 非流式 kilocode 形态工具调用 PASS；已初始化标配工程骨架星图 project_engineering_atlas.html 并对齐 release_tag 为 v1.3.6-p16；全量测试全绿。

## 最新验证与提交记录
1. **8316 Pro 专线节点同步部署与数据卷隔离 (PASS)**:
   - 部署执行: `bash scripts/dev/remote_8316_deploy.sh` -> exit 0，镜像增量层构建完成；
   - 卷隔离校验: 远程 `configs/auth` 与 `data` 严格排除覆盖，原有凭据池与用量账本完整保留；
   - 容器状态: `aistudio-to-api-8316` Up (healthy)。
2. **双节点健康状态探活断言 (PASS)**:
   - 8316 `/health`: HTTP 200 (`browserConnected: true, status: "ok"`)；
   - 8317 `/health`: HTTP 200 (`browserConnected: true, status: "ok"`)。
3. **8316 kilocode 开放 Schema 工具调用断言 (PASS)**:
   - 载荷: 包含 `get_weather`、`additionalProperties: false` 开放 Schema 特征；
   - Auto 通道: HTTP 200, `tool_calls[0].function.name: "get_weather"`, arguments: `{"location":"Tokyo"}`；
   - Build 通道: HTTP 200, `tool_calls[0].function.name: "get_weather"`, arguments: `{"location":"Tokyo"}`；
   - 日志排查: 8316 容器日志中 `parameters_json_schema must not be set` 互斥错误为 0，上游工具请求 400 次数为 0。
4. **例保洗礼与打回整改 (PASS)**:
   - 安全移除使命完成的诊断探针 `scripts/dev/diag_playground_globals.mjs`；
   - 初始化标配工程星图 `docs/prototypes/project_engineering_atlas.html` (内嵌 SSOT manifest)；
   - 工作区纯净度检查无残留，原子暂存快照重新锚定。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **Build 通道 parametersJsonSchema 互斥校验与双通道工具编码 (P0)**: `normalizeBuildRequestBody` 严禁为 `parameters` 补写 `parametersJsonSchema`，否则触发上游 Google API 互斥校验 400；Playground 通道则通过位置参数数组准确传递工具列表；探活必须以返回合法 `tool_calls` 为二值成功判定。
2. **网络代理通道与 104 局域网 SSOT**: 代理偶发 408/超时平滑使用 104 局域网代理网关 (`192.168.0.104:7890`)；局域网主机真实 IP SSOT 为 `192.168.0.104`。
3. **同宿主机多容器隔离与端口防抢占 (P0)**: 同宿主机部署同构容器必须显式隔离 Compose 文件、业务 HTTP 端口 (8316/8317/8318) 与 WebSocket 端口 (9997/9998)，避免配置覆盖与端口占用死锁。
4. **模型名前置拦截与切号防雪崩**: 非法模型名直接前置拦截返回 400 Bad Request；404 模型不存在错误前置标记 `skipAccountSwitch=true`，严禁触发空转换号重试。
5. **Camoufox/Firefox Xray 跨边界沙箱穿透与零污染 Hook (P0)**: 严禁从 Sandbox 向 Content Window 属性直接赋普通 Sandbox 函数（会触发 `Permission denied to access object` 导致 Angular 顶层崩溃）；必须通过 `pageWindow.eval` 在 Content 作用域内创建原生 wrapper。
6. **Xray TypedArray 跨界访问禁忌与字符串纯化 (P0)**: 严禁跨 Xray 边界读写 TypedArray/ArrayBuffer（会触发 `Accessing TypedArray data over Xrays is slow, and forbidden` 导致 Build 渠道降级）；哈希与摘要计算通过 Content 端 Helper 完成，仅跨界传递 primitive string。
7. **协议头捕获非侵入化 (Playwright request 监听代替 fetch 劫持)**: 前端侵入式重写 `window.fetch` 易破坏 CSP 与引发 Xray 权限崩溃；通过 Node 端 Playwright `page.on("request")` 纯外层非侵入捕获 public headers 并回填，实现页面 100% 原生加载。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover` (与 `myfork/feat/deploy-104-container-failover` 严格对齐)
- 状态: 提交与 Tag 同步完毕，断言通过。
