# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 104 服务器 8317 端口服务增量同步、前端 UI 构建、定制镜像增量构建与平滑重启探活。
- **Status**: 104 主节点 8317 增量部署成功，健康检查 HTTP 200 OK，流式与非流式黑盒推理 100% 验证通过。

## 最新验证与提交记录
1. **本地前端 UI 构建**:
   - `npm run build:ui`: Vite 构建成功，生产打包耗时 34.28s，产物注入 `dist/`。
2. **104 远程主节点 (8317) 增量部署与容器平滑重启**:
   - 增量 rsync 同步最新源码至 104 服务器 (`/home/fy/aistudio-to-api`)。
   - 远程使用 `Dockerfile.update` 基于 `aistudio-to-api-custom:latest` 进行轻量增量层构建并打标。
   - 远程执行 `docker compose down && docker compose up -d` 重启容器，容器状态达成 `healthy`。
3. **黑盒接口探活与端到端推理测试**:
   - `scripts/dev/healthcheck.sh`: 主节点 8317 响应 HTTP 200 OK，8318 节点符合 STANDBY 规约。
   - 黑盒流式推理: `POST /v1/chat/completions` (model: `gemini-3.7-flash`, `stream: true`) 成功流式输出 `PONG_SUCCESS`，最终以 `[DONE]` 正常收口。
   - 黑盒非流式推理: `POST /v1/chat/completions` (model: `gemini-3.7-flash`, `stream: false`) 成功返回 HTTP 200，内容 `OK`。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
2. **增量镜像更新策略**: 104 远程主机已具备基础环境与 Camoufox 二进制时，应采用本地预构建前端产物 + 增量层 `COPY` 覆盖方式构建，避免在容器内重复触发全量 apt/npm 安装。
3. **模型名前置拦截与切号防雪崩**: 客户端传入 `"-"` 等非法模型时直接前置拦截返回 400 Bad Request；404 模型不存在错误前置设置 `skipAccountSwitch=true`，严禁触发换号重试。
4. **403/429/5xx 强制切号穿透防抖**: 故障转移切号必须显式传入 `{ force: true }` 绕过 `minSwitchIntervalMs` 防抖限制，并对异常账号施加 `accountCooldownMs` 冷却惩罚。
5. **单测上下文状态重置**: 包含单例或持久化状态（如冷却表 `accountCooldownMap`）的模块在多断言串行测试中，测试用例各 section 切换前必须显式重置或清理，防止前置断言引发的副作用干扰后续隔离断言。
6. **G15 日志门禁浏览器上下文注解**: `BrowserManager.js` 等向浏览器页面内注入的脚本（`addInitScript` / `evaluate`）包含控制台输出时，使用 `// @moe-logger-exempt - browser page context` 进行规范注解，避免被 G15 静态 AST 误判为 Node 服务端裸 console。
7. **分级结算与全景 DevState 抽取契约**: 轻量结算门禁 `verify:settlement` 与 `verify` 双阶分离；`extract_dev_state.py` 严格校验 G1~G16 映射，无 UNWIRED 且达到 100% 满分。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- 状态: npm test (9/9 pass) + npm run verify (PASS) 100% 达标，ESLint prettier 格式已自动对齐。
