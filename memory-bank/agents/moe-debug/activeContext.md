# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 增加 finalizeOpenAIStream 与 finalizeClaudeStream 意外断流补发 glob 单测，执行完整校验，并部署 104 服务器 8317 节点完成健康探活。
- **Status**: 单测与 `npm run verify` 100% 通过；104 远程 8317 容器完成增量重构与重启，状态 Up (healthy)，`scripts/dev/healthcheck.sh` 退出码 0，HTTP 200 探活验证 PASS。

## 最新验证与提交记录
1. **单测用例扩充 (`tests/test_format_converter_validation.mjs`)**:
   - 增加 `finalizeOpenAIStream` 在仅输出思考过程（thinking-only）、流意外提前结束（从未收到 finishReason）时的单元测试断言，验证其正确补发 `glob` 工具调用与 `finish_reason: "tool_calls"` SSE 数据块，并验证幂等性。
   - 增加 `finalizeClaudeStream` 在无 finishReason 时流式收尾补发 `glob` 工具调用（`type: "tool_use"`）及 `stop_reason: "tool_use"` 结构断言与幂等性断言。
2. **本地全量校验与格式合规 (`npm run verify`)**:
   - `npm test` 8 个测试套件/文件全部通过 (0 failed)。
   - `npm run lint:ci` 8 项门禁（Canary 规则、核心文档 ECT、部署物 Schema、AES 总结格式、Token 限制、内存库纯净度、UI 对比度、Refactor 文档同步）100% 通过。
3. **远程 104 容器增量构建与健康探活 (`npm run deploy:8317`)**:
   - 本地构建 UI 产物并同步代码至 104 远程主机。
   - 远程增量构建 `aistudio-to-api-custom:latest` 并通过 `docker compose` 重启容器。
   - `scripts/dev/healthcheck.sh` 校验通过，8317 节点响应 HTTP 200 OK。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
2. **增量镜像更新策略**: 104 远程主机已具备基础环境与 Camoufox 二进制时，应采用本地预构建前端产物 + 增量层 `COPY` 覆盖方式构建，避免在容器内重复触发全量 apt/npm 安装。
3. **按需待命态 (STANDBY_ON_DEMAND) 契约**: 备用容器策略为 `restart: "no"`，日常处于 `exited` 停止态；非严格模式健康检查将端口不可达视为 STANDBY 正常合规，杜绝产生虚假告警。
4. **RequestHandler 构造依赖解耦**: `RequestHandler._buildProxyRequest` 会间接调用 `formatConverter.getDefaultSafetySettings()` 读取 `this.serverSystem.config`；编写独立用例需传入桩对象。
5. **Thinking-Only 兜底契约验证**: Gemini 模型仅输出思考过程（thought: true）而无正文时，OpenAI 格式返回 `tool_calls`（name: `glob`, arguments: `{"pattern":"*"}`，finish_reason: `tool_calls`，content: `null`）；Claude 格式返回 `tool_use`（name: `glob`, input: `{ pattern: "*" }`，stop_reason: `tool_use`）。
6. **FinalizeStream 兜底防断流**: 当流式响应因上游中断或异常只输出了 thinking 块却未到达包含 finishReason 的尾包时，调用 `finalizeOpenAIStream` / `finalizeClaudeStream` 可兜底补发 `glob` 工具调用与完成状态，避免客户端挂起。
7. **CI 门禁与 Lint 格式统一**: 涉及代码变更后必须同步执行 `npm run lint:fix` 保证 Prettier/ESLint 格式一致，确保 `npm run verify` 全流程绿标通过。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- 状态: 104 远程 8317 容器已成功部署最新 Thinking-Only 逻辑，服务探活验证全部正常。
