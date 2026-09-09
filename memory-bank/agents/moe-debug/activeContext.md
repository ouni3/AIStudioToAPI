# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 104 服务器 8318 节点按需启停策略落地与健康探活验证、本地全套 CI 门禁与 DevState 探针核验。
- **Status**: 104 远程 8318 容器 compose 配置已设为 `restart: "no"`，容器优雅停止进入 STANDBY 态；`remote_8318.sh` 脚本生命周期闭环实测通过；`healthcheck.sh`、`npm run verify`、`npm run lint:ci` 以及全景控制台 DevState 抽取探针全部 PASS (退出码 0，compliance.score = 100.0%)。

## 最新验证与提交记录
1. **104 远程 8318 容器按需冻结与策略收敛**:
   - `/home/fy/aistudio-to-api-8318/docker-compose.yml` 中 `restart` 策略更新为 `"no"` 并通过 `up -d --force-recreate` 刷新容器属性。
   - 执行优雅停止 `docker compose stop`，容器状态转为 `exited`，端口 8318 进入 STANDBY 态。
   - 8317 主服务未受任何干扰，持续健康响应 HTTP 200 OK。
2. **本地按需运维脚本闭环测试**:
   - `bash scripts/dev/remote_8318.sh status`: 容器状态 `exited`，HTTP 探活返回 `INACTIVE/STANDBY (HTTP 000)`。
   - `bash scripts/dev/remote_8318.sh start`: 容器启动成功并在 0s 内探活 HTTP 200 成功。
   - `bash scripts/dev/remote_8318.sh stop`: 容器优雅停止成功。
   - `bash scripts/dev/healthcheck.sh`: 8317 返回 200 OK，8318 为 STANDBY 放行，退出码 0。
3. **全套 CI 门禁验证 (`npm run verify` & `npm run lint:ci`)**:
   - `npm run lint`: 代码风格与 ESLint/Stylelint 校验通过 (0 errors, 1 warning)。
   - `npm run test`: 7 项单元测试全量 PASS (100%)。
   - `npm run lint:ci`: 8 大 CI 门禁脚本 (rules/core/artifacts/aes/token/purity/ui/refactor) 全部 PASS。
4. **DevState 抽取探针验证 (`extract_dev_state.py`)**:
   - 执行母星抽取脚本后，AIStudioToAPI 项目 `ci_status.compliance` 得分 100.0%。
   - 10 大门禁全面达成: 9 PASS, 1 EXEMPT, 0 UNWIRED, 0 FAIL。
   - G1_TOKEN (PASS), G2_PURITY (PASS), G3_GIT_GATE (PASS), G6_UI_CONTRAST (PASS), G10_REFACTOR_DOC_SYNC (PASS) 全量绿灯。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
2. **按需待命态 (STANDBY_ON_DEMAND) 契约**: 备用容器策略为 `restart: "no"`，日常处于 `exited` 停止态；非严格模式健康检查将端口不可达视为 STANDBY 正常合规，杜绝产生虚假告警。
3. **Docker Compose 重建策略一致性**: 修改 compose 文件中的 restart 策略后，需执行 `--force-recreate` 确保宿主机容器元数据 `HostConfig.RestartPolicy.Name` 物理生效。
4. **CI 门禁正则鲁棒性**: ECT 等级与 section 标题正则必须兼容 Markdown 格式多样性（如 `` `ect`: **S** `` 及前缀），杜绝误报。
5. **DevState 门禁穿透依赖**: package.json 探针命令与 scripts/ci 物理文件双向闭环，方能达成 DevState 100% 合规判定。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- 状态: 门禁验证完毕，准备进入最终提交环节。
