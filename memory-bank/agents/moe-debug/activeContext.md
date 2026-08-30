# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: `scripts/dev/*.sh` 脚本赋权、全量 `npm test` 测试套件验证与 104 服务器 (8317/8318) 双容器探活。
- **Status**: 已完成全量自动化测试与 104 局域网服务器双端点健康检查探活。

## 最新验证与提交记录
1. **全量自动化测试 (`npm test`)**:
   - `test_format_converter_validation.mjs`: OpenAI/Claude Non-Stream & Stream 全功能转换验证 PASS (100%)。
   - `test_request_handler_validation.mjs`: `_isModelNotFoundError` 与 HTTP status 映射断言验证 PASS (100%)。
2. **脚本权限与探活 (8317/8318)**:
   - 赋予 `scripts/dev/*.sh` 可执行权限 (`chmod +x`)。
   - `scripts/dev/healthcheck.sh` 探测 104 服务器端点 `192.168.0.104:8317` 与 `192.168.0.104:8318` 均返回 HTTP 200 SUCCESS。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，探活脚本需传入 `REMOTE_104_HOST=192.168.0.104` 环境变量。
2. **双容器拓扑探活**: 8317 (源码定制容器) 与 8318 (镜像稳定容器) 均以 HTTP 200 响应根路径 `/` 探测。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- 状态: 干净 (`working tree clean`, `ahead 2`)
