# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 104 服务器双节点 (8316/8317) 免密更新部署与端到端探活断言。
- **Status**: 部署完成，探活断言全部 PASS。镜像在 104 远程重构，8316/8317 均运行最新镜像，Web 访问免密 200 OK，推理接口 401 鉴权守卫有效。

## 最新验证与提交记录
1. **104 远程源码同步与镜像构建 (8317 主节点)**:
   - 执行 `remote_8317_deploy.sh` 流程，通过 rsync 增量同步源码与最新 `ui/dist` 前端产物至 104。
   - 远程触发 Docker 构建生成 `aistudio-to-api-custom:latest` (Image ID `sha256:4ba24de2dedc...`)。
   - 重新启动 8317 容器 (`aistudio-to-api`)，健康检查达 `Up (healthy)`。

2. **8316 节点容器镜像同步与重启**:
   - 对 8316 服务目录执行 compose 重建 (`docker compose down && docker compose up -d`)，由旧镜像平滑升级至最新 `4ba24de2dedc` 镜像。
   - 容器健康检查转为 `Up (healthy)`。

3. **端到端免密与 API 鉴权断言**:
   - 8317 Web 界面 (`http://192.168.0.104:8317/`): 返回 `200 OK` (text/html)，无 302/303 重定向。
   - 8317 状态接口 (`http://192.168.0.104:8317/api/status`): 无需认证返回 `200 OK` JSON 数据。
   - 8316 Web 界面 (`http://192.168.0.104:8316/`): 返回 `200 OK` (text/html)，无 302/303 重定向。
   - 8316 状态接口 (`http://192.168.0.104:8316/api/status`): 无需认证返回 `200 OK` JSON 数据。
   - 8317/8316 推理接口 (`/v1/chat/completions`): 未携带 Authorization 时均精确返回 `401 Unauthorized`。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **GitHub Remote 凭据通道一致性**: 本地环境具备系统级全局 HTTPS GitHub Token (`credential.helper=store`)，遇 SSH 交互式阻断或超时应优先切换为标准 HTTPS remote 协议直通推送。
2. **多 Remote 分支跟踪断言**: 本地特性分支所跟踪的远端为 `myfork`，在执行推送及检查时应显式以跟踪分支 `myfork/<branch>` 为基准进行二值化状态校验。
3. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，运维与探活脚本默认指向该 IP，确保无人工配置摩擦。
4. **同宿主机同镜像容器更新陷阱**: 同宿主机共享 `aistudio-to-api-custom:latest` 镜像时，单凭 `docker restart` 仅重启既有容器层，不会重新基于新标签镜像创建；必须通过 `docker compose down && docker compose up -d` 重新根据最新镜像创建容器实例。
5. **多容器端口与 WebSocket 冲突隔离**: 在同一宿主机部署同构容器实例时，不仅需分离外部业务 HTTP 端口（如 8316/8317），还必须分离绑定的内部通信端口（如 WebSocket 端口 9997 与 9998），防止端口抢占导致启动失败。
6. **模型名前置拦截与切号防雪崩**: 客户端传入 `"-"` 等非法模型时直接前置拦截返回 400 Bad Request；404 模型不存在错误前置设置 `skipAccountSwitch=true`，严禁触发换号重试。
7. **403/429/5xx 强制切号穿透防抖**: 故障转移切号必须显式传入 `{ force: true }` 绕过 `minSwitchIntervalMs` 防抖限制，并对异常账号施加 `accountCooldownMs` 冷却惩罚。
8. **分级结算与全景 DevState 抽取契约**: 轻量结算门禁 `verify:settlement` 与 `verify` 双阶分离；`extract_dev_state.py` 严格校验 G1~G16 映射，无 UNWIRED 且达到 100% 满分。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover` (与 `myfork/feat/deploy-104-container-failover` 严格对齐)
- 状态: 提交与 Tag 同步完毕，断言通过。
