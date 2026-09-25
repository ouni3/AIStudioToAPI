# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 执行 104 服务器 8317 节点远程增量部署、Docker 容器平滑重启与黑盒探活。
- **Status**: 部署脚本 `scripts/dev/remote_8317_deploy.sh` 与健康检查 `scripts/dev/healthcheck.sh` 运行完毕，`/v1/models` 黑盒接口探活 100% 成功。

## 最新验证与提交记录
1. **104 节点 8317 服务增量部署与容器重启**:
   - 本地 `npm run build:ui` 编译前端最新静态资产 (`ui/dist`)。
   - `rsync` 增量同步源码至 `fy@192.168.0.104:/home/fy/aistudio-to-api/`。
   - 远程采用 `Dockerfile.update` 轻量层完成 `aistudio-to-api-custom:latest` 镜像构建，并执行 `docker compose down && docker compose up -d` 平滑重启。
2. **多维健康检查与黑盒探活**:
   - `scripts/dev/healthcheck.sh`: 8317 节点响应 HTTP 200 OK，8318 节点符合按需 STANDBY 策略。
   - `http://192.168.0.104:8317/v1/models`: 携带鉴权 Header 正常返回 OpenAI 兼容模型列表 (30+ 个最新模型)。
   - `mcp_health_auditor_verify_artifact_payload`: 网页端点 UI HTML 载荷断言 PASS。
3. **Phase 10 Pre-Audit Stage 暂存与快照生成**:
   - 严格按清单精准暂存全部 12 个相关修改资产。
   - `git write-tree` 派生 40 位 staged tree hash (Pre-Audit Snapshot ID)。

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
