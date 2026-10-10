# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: Phase 12 R3 增量终审整改准备（工作区全量冻结、四树快照状态核验与门禁断言）。
- **Status**: 针对打回项已完成工作区全量暂存与冻结，`tests/test_account_enable_disable.mjs` 具备完整行为断言，工作区改动全量暂存无未暂存残留，`npm run verify` 全部门禁与测试 100% PASS，staged_tree_hash 成功输出。

## 最新验证与提交记录
1. **本地前端构建与增量同步**:
   - `npm run build:ui` 产出最新 `ui/dist` (`index-BgsSj1u1.js`, `index-DIk0HY5Y.css`)。
   - `rsync` 增量同步最新前端与后端代码至 104 服务器 `/home/fy/aistudio-to-api/`，排除敏感配置与本地运行环境。
2. **远程镜像构建与容器平滑重建**:
   - 104 主机执行 Dockerfile 增量层构建并打标 `aistudio-to-api-custom:latest`。
   - `docker compose down && docker compose up -d` 平滑重建 8317 容器。
3. **8317 严格健康与业务载荷探活**:
   - `http://192.168.0.104:8317/health` 返回 HTTP 200，`browserConnected: true`，`status: ok`。
   - `http://192.168.0.104:8317/v1/models` (带 Key) 返回 HTTP 200 及 30 个有效 Gemini/Gemma 模型定义。
   - `http://192.168.0.104:8317/` Web 控制台页面返回 HTTP 200，引用最新静态资源 `index-BgsSj1u1.js` 与 `index-DIk0HY5Y.css`。
   - `http://192.168.0.104:8317/api/status` 包含 34 个账号实例及新增 `disabled: false` 字段。
   - `PUT /api/accounts/0/status` 验证账号状态接口正常响应 `accountStatusUpdated`。
4. **8316 节点协同与部署物真值核验**:
   - 8316 节点容器 `aistudio-to-api-8316` 实际运行镜像为专属 tag `aistudio-to-api-custom:8316`（ImageID: `sha256:c2c7aa5a37db4778ac2a02a340b6e23df7d93b5602abbc158378db0ca9bbb405`），状态 `running (health: healthy)`。
   - 8316 探活实测：`/health` 返回 HTTP 200 (`browserConnected: true`, `status: "ok"`)；`/v1/models` (带 Key) 返回 HTTP 200 (包含 30 个 Gemini/Gemma 模型)；`/api/status` 账号载荷包含有效字段 `disabled: false`。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **GitHub Remote 凭据通道一致性**: 本地环境具备系统级全局 HTTPS GitHub Token (`credential.helper=store`)，遇 SSH 交互式阻断或超时应优先切换为标准 HTTPS remote 协议直通推送。
2. **多 Remote 分支跟踪断言**: 本地特性分支所跟踪的远端为 `myfork`，在执行推送及检查时应显式以跟踪分支 `myfork/<branch>` 为基准进行二值化状态校验。
3. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
4. **单节点按需部署独立镜像隔离**: 多容器共存宿主机若仅灰度/按需更新某特定端口容器（如 8316），构建时显式打标签为专属 tag（如 `aistudio-to-api-custom:8316`），防止覆盖其他容器依赖的 `latest` 基础层，彻底实现不同节点物理隔离。
5. **同宿主机同镜像容器更新陷阱**: 同宿主机共享镜像更新时，单凭 `docker restart` 仅重启既有容器层，不会重新根据新标签镜像创建；必须通过 `docker compose down && docker compose up -d` 重新根据最新镜像创建容器实例。
6. **多容器端口与 WebSocket 冲突隔离**: 在同一宿主机部署同构容器实例时，不仅需分离外部业务 HTTP 端口（如 8316/8317），还必须分离绑定的内部通信端口（如 WebSocket 端口 9997 与 9998），防止端口抢占导致启动失败。
7. **模型名前置拦截与切号防雪崩**: 客户端传入 `"-"` 等非法模型时直接前置拦截返回 400 Bad Request；404 模型不存在错误前置设置 `skipAccountSwitch=true`，严禁触发换号重试。
8. **403/429/5xx 强制切号穿透防抖**: 故障转移切号必须显式传入 `{ force: true }` 绕过 `minSwitchIntervalMs` 防抖限制，并对异常账号施加 `accountCooldownMs` 冷却惩罚。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover` (与 `myfork/feat/deploy-104-container-failover` 严格对齐)
- 状态: 提交与 Tag 同步完毕，断言通过。
