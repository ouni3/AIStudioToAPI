# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: Phase 17 结算关卡 2.1 四维洗礼脱脂与工程骨架星图增量编译刷新。
- **Status**: 四维洗礼全部通过，全套单元测试 100% PASS (46/46, 退出码 0)，工程星图 Manifest 内嵌 712 Tokens 守恒 (≤3500 Tokens)，出具 `[ROUTINE_MAINTENANCE_CLEANSED: PASS]` 凭据。

## 最新验证与提交记录
1. **本地单元测试集执行 (PASS)**:
   - 运行: `npm test` -> 46/46 passed (0 fail, 0 skipped), 退出码 0。
   - 包含新增 `tests/test_relay_channel_behavior.mjs` 测试集：验证 400 状态码保真、上游 400 绝不篡改重写为 503、双 429 耗尽保护等断言 100% 成立。
2. **关卡 2.1 四维洗礼脱脂与星图刷新 (PASS)**:
   - 临时探针/mock 碎屑扫描: 清洗完毕，无死代码与无用探针残留；
   - 单元测试与质量契约: 46/46 PASS，退出码 0；
   - 记忆库脱脂巡检: 核心文件单文件全部守恒在 ≤16000 字符 / ≤4000 Tokens 红线以内；
   - 工程骨架星图增量刷新: `docs/prototypes/project_engineering_atlas.html` 增量编译完成，Manifest 约 712 Tokens (≤3500 Tokens 预算)。
3. **8317 综合网关金丝雀发布与真实推理断言 (PASS)**:
   - 增量同步与容器重启，健康探活 HTTP 200，真实流式推理成功出字。
4. **8316 Pro 专线节点发布与真实推理断言 (PASS)**:
   - 专属镜像构建与容器重启，健康探活 HTTP 200，真实流式推理成功出字。

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
- 提交: `ca8a5c0e92f838d50f562b9e557e2a8972bc070d`
- Tag: `v1.3.7-p17`
- 状态: 提交与 Tag 同步完毕，物理发布断言全部通过。
