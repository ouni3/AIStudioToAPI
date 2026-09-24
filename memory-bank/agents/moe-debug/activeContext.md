# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 运行本地模型名 "-" 与畸形剥离单测及全套测试，执行 CI 门禁核验，同步代码至 104 并热重启 8317 容器，完成真实 HTTP 探活与非法模型 400 校验。
- **Status**: 单测与全套 `npm test` 9 套件 100% PASS；`npm run verify` 退出码 0；104 8317 容器热重启完成且 HTTP 200 / 非法模型 400 断言全通。

## 最新验证与提交记录
1. **测试与 CI 全门禁物理执行 (`npm test` / `npm run verify`)**:
   - `node tests/test_model_dash_sanitization.mjs` 单测与 `npm test` 9 个测试文件全量通过 (0 failed, duration: ~457ms)。
   - `npm run verify` 涵盖 ESLint、Stylelint、全套单测与 12 项 CI 门禁（Canary 9 项、ECT、ADVG、G1~G16）100% 绿锁。
2. **104 8317 容器热重启与探活 (`scripts/dev/remote_8317_deploy.sh`)**:
   - 本地 `npm run build:ui` 产物预编译并增量 rsync 同步至 104 (`192.168.0.104:/home/fy/aistudio-to-api/`)。
   - 远程轻量 Dockerfile 增量层构建 `aistudio-to-api-custom:latest` 并热重启 `docker compose up -d`。
   - `scripts/dev/healthcheck.sh` 响应 HTTP 200 OK。
   - 发送 `model: "-"` 非法请求，网关正确返回 400 Bad Request (`invalid_request_error`)，无切号与雪崩行为。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
2. **增量镜像更新策略**: 104 远程主机已具备基础环境与 Camoufox 二进制时，应采用本地预构建前端产物 + 增量层 `COPY` 覆盖方式构建，避免在容器内重复触发全量 apt/npm 安装。
3. **模型名前置拦截与切号防雪崩**: 客户端传入 `"-"` 等非法模型时直接前置拦截返回 400 Bad Request；404 模型不存在错误前置设置 `skipAccountSwitch=true`，严禁触发换号重试。
4. **Thinking-Only 与 FinalizeStream 兜底契约**: Gemini 模型仅输出思考过程（thought: true）而无正文时，OpenAI / Claude 格式分别按协议要求补发 `glob` 工具调用与完成状态；流式意外断流时调用 finalizeStream 幂等补发尾包避免客户端挂起。
5. **G15 日志门禁浏览器上下文注解**: `BrowserManager.js` 等向浏览器页面内注入的脚本（`addInitScript` / `evaluate`）包含控制台输出时，使用 `// @moe-logger-exempt - browser page context` 进行规范注解，避免被 G15 静态 AST 误判为 Node 服务端裸 console。
6. **分级结算与全景 DevState 抽取契约**: 轻量结算门禁 `verify:settlement` 与 `verify` 双阶分离；`extract_dev_state.py` 严格校验 G1~G16 映射，无 UNWIRED 且达到 100% 满分。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- 状态: G11, G12, G15, G16 全套门禁与全景控制台 DevState 探针校验 100% 达标。
