# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 补齐并全量验证 G11, G12, G15, G16 四大门禁，完成 `npm run verify`、`npm run verify:settlement` 及全景控制台 DevState 抽取探针验证。
- **Status**: `npm run verify` 与 `npm run verify:settlement` 退出码均为 0 (100% 绿锁)；全景控制台 DevState 抽取探针合规得分 100.0% (15 PASS, 1 EXEMPT, 0 UNWIRED, 0 FAIL)。

## 最新验证与提交记录
1. **CI 全量与结算门禁物理执行 (`npm run verify` / `npm run verify:settlement`)**:
   - `npm test` 8 个测试套件/文件全部通过 (0 failed)。
   - `npm run lint:ci` 12 项门禁 (含 G11 例行维护、G12 PhaseEvidence、G15 Logging/FSM 标准、G16 结算派生一致性等) 100% 通过。
   - `npm run verify:settlement` 轻量结算门禁 <0.5s 退出码 0。
2. **全景控制台 DevState 抽取探针**:
   - 运行 `/home/dev/moe-OR/scripts/dev_state/extract_dev_state.py --project /home/dev/AIStudioToAPI`。
   - `AIStudioToAPI` 合规得分 `100.0%` (total_gates: 16, passed_gates: 15, exempt_gates: 1, unwired_gates: 0, failed_gates: 0)。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
2. **增量镜像更新策略**: 104 远程主机已具备基础环境与 Camoufox 二进制时，应采用本地预构建前端产物 + 增量层 `COPY` 覆盖方式构建，避免在容器内重复触发全量 apt/npm 安装。
3. **按需待命态 (STANDBY_ON_DEMAND) 契约**: 备用容器策略为 `restart: "no"`，日常处于 `exited` 停止态；非严格模式健康检查将端口不可达视为 STANDBY 正常合规，杜绝产生虚假告警。
4. **Thinking-Only 与 FinalizeStream 兜底契约**: Gemini 模型仅输出思考过程（thought: true）而无正文时，OpenAI / Claude 格式分别按协议要求补发 `glob` 工具调用与完成状态；流式意外断流时调用 finalizeStream 幂等补发尾包避免客户端挂起。
5. **G15 日志门禁浏览器上下文注解**: `BrowserManager.js` 等向浏览器页面内注入的脚本（`addInitScript` / `evaluate`）包含控制台输出时，使用 `// @moe-logger-exempt - browser page context` 进行规范注解，避免被 G15 静态 AST 误判为 Node 服务端裸 console。
6. **分级结算与全景 DevState 抽取契约**: 轻量结算门禁 `verify:settlement` 与 `verify` 双阶分离；`extract_dev_state.py` 严格校验 G1~G16 映射，无 UNWIRED 且达到 100% 满分。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- 状态: G11, G12, G15, G16 全套门禁与全景控制台 DevState 探针校验 100% 达标。
