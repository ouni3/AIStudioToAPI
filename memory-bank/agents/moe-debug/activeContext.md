# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 本地全量单元测试与 CI 门禁验证 (11 套单测 + 12 项 CI 静态门禁).
- **Status**: 全部单元测试 100% PASS，CI lint 静态门禁全绿通过。工作区干净。

## 最新验证与提交记录
1. **本地单元测试套件**:
   - 命令: `npm test` (`node --test tests/*.mjs`)
   - 结果: 11 tests, 1 suite, 11 pass, 0 fail (耗时 677.79ms).
   - 覆盖模块: Account Enable/Disable, Quota Guard Service, FormatConverter Validation, Model Dash Sanitization, RequestHandler Validation, Thinking-Only Mock Response, Upstream Error Codes Failover 等。
2. **CI 静态检查门禁**:
   - 命令: `npm run lint:ci`
   - 结果: 12 项子门禁检查 100% PASS (Canary, Core File Format, ADVG, AES Summary, Token Limits, Memory-Bank Purity, UI/UX Contrast, Refactor Doc Sync, Routine Maintenance, Phase Evidence, Logging & FSM Standards, Settlement Consistency)。
3. **工作区状态与发布断言**:
   - `git status`: working tree clean.

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **GitHub Remote 凭据通道一致性**: 本地环境具备系统级全局 HTTPS GitHub Token (`credential.helper=store`)，遇 SSH 交互式阻断或超时应优先切换为标准 HTTPS remote 协议直通推送。
2. **多 Remote 分支跟踪断言**: 本地特性分支所跟踪的远端为 `myfork`，在执行推送及检查时应显式以跟踪分支 `myfork/<branch>` 为基准进行二值化状态校验。
3. **网络抖动代理通道自愈切换**: 当本地代理 (`127.0.0.1:7897`) 偶发报 `HTTP 408 / RPC failed` 阻断 git push 时，可平滑采用 104 局域网代理网关通道 (`192.168.0.104:7890`) 直通推送，保障网络发布任务零摩擦。
4. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
5. **单节点按需部署独立镜像隔离**: 多容器共存宿主机若仅灰度/按需更新某特定端口容器（如 8316），构建时显式打标签为专属 tag（如 `aistudio-to-api-custom:8316`），防止覆盖其他容器依赖的 `latest` 基础层，彻底实现不同节点物理隔离。
6. **同宿主机同镜像容器更新陷阱**: 同宿主机共享镜像更新时，单凭 `docker restart` 仅重启既有容器层，不会重新根据新标签镜像创建；必须通过 `docker compose down && docker compose up -d` 重新根据最新镜像创建容器实例。
7. **多容器端口与 WebSocket 冲突隔离**: 在同一宿主机部署同构容器实例时，不仅需分离外部业务 HTTP 端口（如 8316/8317），还必须分离绑定的内部通信端口（如 WebSocket 端口 9997 与 9998），防止端口抢占导致启动失败。
8. **模型名前置拦截与切号防雪崩**: 客户端传入 `"-"` 等非法模型时直接前置拦截返回 400 Bad Request；404 模型不存在错误前置设置 `skipAccountSwitch=true`，严禁触发换号重试。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover` (与 `myfork/feat/deploy-104-container-failover` 严格对齐)
- 状态: 提交与 Tag 同步完毕，断言通过。
