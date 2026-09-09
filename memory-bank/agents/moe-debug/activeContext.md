# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 核心容错与错误码即时切号加固验证、全量单测 5/5 与 CI 门禁矩阵 (G1~G10) 100% 验收、104 双节点健康度核验。
- **Status**: 单测 5/5 全套 PASS，`npm run verify` CI 自动化门禁矩阵全绿（100% PASS，包含 Token 限额与 Memory-bank 纯净度断言）。

## 最新验证与提交记录
1. **测试用例 mock 隔离与全量单测验证 (`npm test`)**:
   - 5 个测试套件（`test_time_range_calculation.mjs`、`test_format_converter_validation.mjs`、`test_request_handler_validation.mjs`、`test_thinking_only_mock_response.mjs`、`test_upstream_error_codes_failover.mjs`）100% PASS，包含 8/8 独立断言组。
2. **数据契约补充后 CI 门禁矩阵全量核验 (`npm run verify`)**:
   - `productContext.md` 与 `profit.md` 按《project-panorama-data-contract》规范补齐数据契约字段后，校验全部通过。
   - ESLint & Stylelint 走查通过（0 errors）。
   - CI 自动化门禁脚本全部通过：
     - Canary 9 关键词全部在场通过。
     - `lint_core_file_format.py` 8 核心资产 ECT-S 格式校验全 PASS。
     - ADVG 制品档案与 AES Summary 校验通过。
     - G1_TOKEN: 7 核心文档 Token 限额全绿（`productContext.md` 738/4096, `profit.md` 814/4096, `plan.md` 1073/8192）。
     - G2_PURITY: memory-bank 纯净度断言通过，0 幽灵文件。
     - G6_UI_CONTRAST 与 G10_REFACTOR_DOC_SYNC 均 100% PASS。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
2. **按需待命态 (STANDBY_ON_DEMAND) 契约**: 备用容器策略为 `restart: "no"`，日常处于 `exited` 停止态；非严格模式健康检查将端口不可达视为 STANDBY 正常合规，杜绝产生虚假告警。
3. **RequestHandler 构造依赖解耦**: `RequestHandler._buildProxyRequest` 会间接调用 `formatConverter.getDefaultSafetySettings()` 读取 `this.serverSystem.config`；编写针对 `RequestHandler` 的独立测试用例时，需传入带 `config` 的 `mockServerSystem` 桩对象。
4. **CI 门禁正则鲁棒性**: ECT 等级与 section 标题正则必须兼容 Markdown 格式多样性（如 `` `ect`: **S** `` 及前缀），杜绝误报。
5. **DevState 门禁穿透依赖**: package.json 探针命令与 scripts/ci 物理文件双向闭环，方能达成 DevState 100% 合规判定。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- 状态: 全量测试、探活与 CI 门禁验证 100% PASS，就绪交付 audit-expert 终审。
