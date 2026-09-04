# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 畸形模型名前置断言校验与 104 远程 8317 容器同步构建、部署与实测探活接管。
- **Status**: 本地单测全量通过 (`npm test`)，104 远程 8317 容器重新构建部署完成并健康运行，畸形请求即刻拦截与正常模型调用探活全部实测通过。

## 最新验证与提交记录
1. **全量自动化测试 (`npm test`)**:
   - `test_fixed_15hour_timerange.mjs`: 固定 15:00 跨日时间区间单测 PASS (100%)。
   - `test_format_converter_validation.mjs`: OpenAI/Claude Non-Stream & Stream 全功能转换验证 PASS (100%)。
   - `test_request_handler_validation.mjs`: 涵盖 `_isModelNotFoundError`、`_isValidModelName` 及针对 `model: "-"` / `"--"` 的 400 立即拦截与 JSON 响应断言全部 PASS (100%)。
   - `test_thinking_only_mock_response.mjs`: Thinking-only 兜底逻辑验证 PASS (100%)。
2. **104 远程部署物更新与实测验证**:
   - 源码与 UI 构建产物 rsync 同步至 104 局域网主机 (`/home/fy/aistudio-to-api/`)。
   - 执行 `docker build --no-cache -f Dockerfile.patch -t aistudio-to-api-custom:latest .` 完成无缓存构建。
   - 重启并上线 8317 容器 (`docker compose up -d`)，容器状态为 `Up (healthy)`。
   - 畸形模型拦截验证: `model: "-"` / `"--"` 在 OpenAI (`/v1/chat/completions`)、Claude (`/v1/messages`)、Google (`/v1beta/models/-:generateContent`) 均在 ~25-30ms 毫秒级直接响应 HTTP 400 `invalid_model` / `invalid_request_error`，杜绝 25s 503 队列等待。
   - 正常模型调用验证: `gemini-3.7-flash` 模型流式推理正常返回 HTTP 200 及 `chat.completion.chunk` 增量数据与 token usage。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，探活脚本需传入 `REMOTE_104_HOST=192.168.0.104` 环境变量。
2. **双容器拓扑探活**: 8317 (源码定制容器) 与 8318 (镜像稳定容器) 均以 HTTP 200 响应根路径 `/` 探测。
3. **入参前置断言门禁**: 协议转换与入参有效性校验（如 `_isValidModelName`）必须前置于 `_ensureBrowserBackedRequestReady`，防止非法请求占用账号会话就绪队列与产生 25s 503 虚假维护报错。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- 状态: 干净 (`working tree clean`, `ahead 2`)
