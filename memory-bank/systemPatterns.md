# System Patterns: aistudio-to-api

> **[EVOLUTION_CONTRIBUTION]** (Phase 2 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 确立反向代理中枢、多凭据故障转移与 104 双容器架构模式，最大化 Gemini 算力利用率与可用性。
> - $L_{User}$: **+** 统一 API 协议转换、模型参数自适应与智能重试，实现免人工干预的 7x24 高可用代理服务。
> - $S_{total}$: **+** 清晰分层请求处理、凭据管理与协议转换，杜绝 403/404 异常扩散，降低系统状态熵。
> - $Value_{Delivered}$: **+** 为上层 Agent 与开发工具提供高弹性、低延迟的稳定 LLM 推理网关。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心 memory-bank 资产)

## 0. 资产定级标定 (Rating & Asset Profile)
- **项目等级**: **SR (Super Rare - 系统枢纽级)**
- **系统定位**: 全系开发与生产环境之核心 LLM 逆向 API 网关与算力中继中枢
- **自托管与自愈协议**: 满足 100% 自托管自愈 (403 区域风控即时切号 + 404 模型防空 + 429 降频轮换 + 在途请求排空)，$L_{User\_rate} \le 0.05$

## 1. 架构总览 (Architecture Overview)

本项目采用模块化 Express + WebSocket 服务架构，整体分为四大核心子系统：

```
+-------------------------------------------------------------------------+
|                              Client Layer                               |
|        OpenAI SDK / Claude SDK / Third-party Tools / Moe Agents         |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                           API Gateway Layer                             |
|  - /v1/chat/completions (OpenAI Compatible)                             |
|  - /v1/messages (Claude Compatible)                                     |
|  - /v1/models (Model Discovery & Capabilities)                          |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                       Request Hub & Orchestration                       |
|  - RequestHandler: 路由分发、流式/非流式响应转换、异常捕获              |
|  - FormatConverter: OpenAI/Claude <-> Google Gemini 请求与响应格式双向映射 |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                  Credential Pool & Failover Manager                     |
|  - Account Pool: 多 Google AI Studio 账号/Cookie 凭据轮询与健康状态检测   |
|  - Failover State Machine: 403 区域受限 / 429 速率限制立即切号重试机制  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                         Upstream Google API                             |
|               Google AI Studio (Gemini-1.5 / 2.0 / 2.5)                 |
+-------------------------------------------------------------------------+
```

## 2. 核心设计模式 (Core Patterns)

### 2.1 协议转换适配器模式 (Protocol Adapter Pattern)
- **FormatConverter**: 负责将标准 OpenAI Completion / Claude Messages 结构转换为 Google AI Studio 原生 `generateContent` / `streamGenerateContent` 载荷。
- **前置路径与模型断言**: 强校验模型标识合法性，过滤前后缀空白与非法字符，严格杜绝模型名为空时拼接出 `/v1beta/models/:streamGenerateContent` 畸形 404 URL。

### 2.2 凭据轮询与故障转移状态机 (Failover State Machine)
- **Account State Tracking**: 动态维护凭据健康状态（`HEALTHY`, `COOLING_DOWN`, `REGION_BLOCKED`, `RATE_LIMITED`）。
- **并行请求平滑排空机制 (In-Flight Request Drain Gate)**:
  - 无论自动触发还是手动切换账号，强制调用 `ConnectionRegistry.waitForAuthQueuesToDrain(authIndex)`。
  - 严格等待当前账号的每一个并发在途 WebSocket 请求 100% 流式传输完毕并关闭后，才正式执行切号与清理旧 Context，杜绝并发请求被腰斩。
- **即时切号重试与页面错误精准感知 (Fast Failover & Page Error Detection)**:
  - 遇到 HTTP 403 (`Region not supported` / `PERMISSION_DENIED`) 或 HTTP 429 时，立即将当前凭据标记异常，自动切至下一健康凭据并重放请求。
  - 精准识别页面硬路由崩溃特征（如 `Page not found` + `Go to Build`），避免将 Google 偶发非阻塞 Toast 提示（如 `Please try again`）误判为致命错误。
  - 设定最大重试轮次（Max Retry Quorum），保障请求不陷入死循环，并在全部凭据耗尽时规范返回标准上游错误。

### 2.3 双容器主备协同拓扑 (Dual-Container Topology)
在 104 局域网服务器 (192.168.0.104) 采用双容器并行部署模式：
1. **8317 端口 (主服务 / 源码定制容器)**:
   - 宿主机路径: `/home/fy/aistudio-to-api/`
   - 容器镜像: `aistudio-to-api-custom:latest`
   - 端口映射: `8317 -> 7860/tcp`, `9998 -> 9998/tcp`
   - 特性: 承载源码定制、`ui/dist` 前端构建产物、403/404 补丁与前沿自愈优化，作为日常主入口。
2. **8318 端口 (备用服务 / 原生稳定镜像容器)**:
   - 宿主机路径: `/home/fy/aistudio-to-api-8318/`
   - 容器镜像: `ibuhub/aistudio-to-api:latest`
   - 端口映射: `8318 -> 7860/tcp`
   - 特性: 作为稳定回退与对照基准节点，确保任何极端情况下存在 100% 可用回退实例。
3. **网络与出墙隔离**: 通过 `host.docker.internal:7890` 挂载宿主机 Mihomo 代理，保障容器出墙访问 Google AI Studio。

## 3. 防御性编码与韧性原则 (Defensive Engineering)
- **路径与载荷前置断言**: 请求发起前强校验 `model` 字段非空与合法性。
- **流式响应断流自愈**: 对 SSE (Server-Sent Events) 流异常做即时清理与客户端断开监听，防止挂起僵尸连接。
- **配置与密钥物理隔离**: 凭据严格隔离于本地 `configs/auths/` 与 Docker 外部卷，禁止任何凭据进入版本控制与记忆银行。
