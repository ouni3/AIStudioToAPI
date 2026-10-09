# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: Phase 11 远程仓库同步（分支 `feat/deploy-104-container-failover` 与标签 `v1.3.5-p11` 全量推送到远程仓库）。
- **Status**: 远程推送全部成功完成。分支与远程 `myfork/feat/deploy-104-container-failover` 严格对齐，标签 `v1.3.5-p11` 成功推送。

## 最新验证与提交记录
1. **104 服务器 8316 节点部署与真实探活验证**:
   - 在 104 服务器新建独立部署目录 `/home/fy/aistudio-to-api-8316/`，完整同步 8317 账号池凭据 (`configs/auth/` 34 份凭据)。
   - 配置 `docker-compose.yml`，映射对外端口 `192.168.0.104:8316:7860` 与内部 wsPort `192.168.0.104:9997:9998`（规避与 8317 9998 冲突），环境变量与 extra_hosts 100% 对齐。
   - 编写并执行本地运维调度脚本 `scripts/dev/remote_8316.sh`，容器正常启动且状态收敛为 `Up (healthy)`。
   - 黑盒接口探活三合一断言全数通过：
     * `GET /health` -> 200 OK (`{"browserConnected":true,"status":"ok",...}`)
     * `GET /v1/models` -> 200 OK (包含 `gemini-3.7-flash` 等全量模型列表)
     * `POST /v1/chat/completions` (model: `gemini-3.7-flash`, stream: true) -> 200 OK，真实返回 `PING_OK` 增量 Chunk 并以 `[DONE]` 正常收敛。

2. **远程仓库同步与凭据协议收敛**:
   - 探测 remote 配置：`myfork` (原 SSH `git@github.com:ouni3/AIStudioToAPI.git`)，`origin` (只读 upstream `https://github.com/iBUHub/AIStudioToAPI.git`)。
   - 遵循 `git-workflow` 协议与系统环境事实，将 `myfork` 协议切换为统一 HTTPS (`https://github.com/ouni3/AIStudioToAPI.git`) 复用全局 GitHub Token 凭据。
   - 成功执行 `git push myfork feat/deploy-104-container-failover`，分支成功推送到远程仓库。
   - 成功执行 `git push myfork v1.3.5-p11` 与全量标签同步，`v1.3.5-p11` 成功落地远程。
   - `git status -sb` 断言与远端完全同步（无 ahead/behind）。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **GitHub Remote 凭据通道一致性**: 本地环境具备系统级全局 HTTPS GitHub Token (`credential.helper=store`)，遇 SSH 交互式阻断或超时应优先切换为标准 HTTPS remote 协议直通推送。
2. **多 Remote 分支跟踪断言**: 本地特性分支所跟踪的远端为 `myfork`，在执行推送及检查时应显式以跟踪分支 `myfork/<branch>` 为基准进行二值化状态校验。
3. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
4. **多容器端口与 WebSocket 冲突隔离**: 在同一宿主机部署同构容器实例时，不仅需分离外部业务 HTTP 端口（如 8316/8317），还必须分离绑定的内部通信端口（如 WebSocket 端口 9997 与 9998），防止端口抢占导致启动失败。
5. **模型名前置拦截与切号防雪崩**: 客户端传入 `"-"` 等非法模型时直接前置拦截返回 400 Bad Request；404 模型不存在错误前置设置 `skipAccountSwitch=true`，严禁触发换号重试。
6. **403/429/5xx 强制切号穿透防抖**: 故障转移切号必须显式传入 `{ force: true }` 绕过 `minSwitchIntervalMs` 防抖限制，并对异常账号施加 `accountCooldownMs` 冷却惩罚。
7. **分级结算与全景 DevState 抽取契约**: 轻量结算门禁 `verify:settlement` 与 `verify` 双阶分离；`extract_dev_state.py` 严格校验 G1~G16 映射，无 UNWIRED 且达到 100% 满分。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover` (与 `myfork/feat/deploy-104-container-failover` 严格对齐)
- 状态: 提交与 Tag 同步完毕，断言通过。
