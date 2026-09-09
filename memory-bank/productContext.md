# Product Context: aistudio-to-api

> **[EVOLUTION_CONTRIBUTION]** (Phase 6 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 将 Google AI Studio 逆向并包装为 OpenAI / Claude 兼容标准 API，提供高并发多账号轮询与自动故障转移，最大化算力利用效率并降低商业 LLM API 支出。
> - $L_{User}$: **+** 提供 Web 管理后台与统一网关端点，用户无需手动管理多 Key/多 Cookie 与代理故障切换，实现认知负担降维。
> - $S_{total}$: **+** 规范模型名映射、403/404/500/502/504 智能容错降级与双容器部署模式，消除畸形请求与无效重试带来的系统状态熵增。
> - $Value_{Delivered}$: **+** 为全系 Agent 与外部客户端提供 7x24 高可用 Gemini 算力网关，护航各类开发与生产推理场景。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心 memory-bank 资产)

> **Evolution Completion**: 🟢 LEVEL-4 — 愿景与模型陈述
> **当前评级**: **SR** — 系统枢纽级 (核心逆向LLM推理网关)
> **评级细分**: SR-INFRA (基础设施算力网关)
> **项目类型**: **infrastructure** — 底层算力网关服务与代理出墙
> **项目受众**: **Moe开发团队与全系Agent舰队** — 提供高并发、免人工干预的 Gemini 原生与兼容协议推理中继

## 0. 评级与商业化基准 (Project Rating & Stage)
- **当前等级**: **SR (Super Rare - 系统枢纽级)**
- **商业生命周期**: **S2 (极客验证期) / 基础设施算力赋能网关 (COMMERCIAL_EXEMPT)**
- **定级判定指标**:
  - $x_1$ (Wealth): 年化赋能 $IAV + C_{saved} \ge \$15,000$, 赋能全系 $\ge 8$ 个核心 Agent 与外部应用，得分 $100$
  - $x_2$ (Compute): 具备 $O(1)$ 级派单与 100% 自托管自愈架构，得分 $96.75$
  - $x_3$ (Infra): 局域网 104 双容器 7x24 高可用常驻与自动切号，SLA $\ge 99.5\%$, 得分 $97.7$
  - $x_4$ (Entropy): $H_{entropy} = 100.0 \ge 90$，无僵尸代码与冗余资产
  - $L_{User\_rate} \le 0.05$ (免人工干预自愈)
  - 综合得分: $S_{total} = 95.60 \ge 75.0$ (通过 SR 级强制门禁)

## 0.1 目标受众档案 (Target Audience Profile)
- **核心用户画像 (Core Persona)**: Moe 架构师、开发者、以及各业务线的自主智能体 (如 moe-architect, moe-code, moe-ask, audit 等)。
- **核心诉求与痛点 (Pain Points & Needs)**: 消除商业 LLM API 高昂 Token 支出，解决单账号配额限制、网络地理阻断 (403 Region not supported) 与偶发挂起死锁问题。
- **交互与交付形态 (Delivery & Interaction Modality)**: 标准 HTTP REST API (`/v1/chat/completions`, `/v1/messages`)、WebSocket 流式转发与 Web 管理看板。
- **价值反馈与 PMF 衡量指标 (Feedback & Metric)**: 推理首字延迟 (TTFT)、请求成功率 ($\ge 98.5\%$)、自托管自愈率 ($\ge 95.0\%$) 与日均 Token 承载量。

## 1. 项目愿景 (Vision)
`aistudio-to-api` 旨在将 Google AI Studio 提供的 Gemini 官方模型能力转化为标准 OpenAI / Claude 兼容的 HTTP / WebSocket API 服务。通过多账号凭据池管理、智能负载均衡、自动化故障切换与容错降级机制，打造稳定、高效、开箱即用的私有 AI 算力中继网关。

## 2. 核心价值与业务场景 (Use Cases & Value)
- **多账号凭据池与负载均衡**: 聚合管理多个 Google AI Studio 账号/Cookie 凭据，支持轮询、随机及加权调度，突破单账号配额限制。
- **协议兼容与零摩擦接入**: 原生支持 `/v1/chat/completions` (OpenAI 格式) 与 `/v1/messages` (Claude 格式)，支持主流第三方客户端与 Agent 框架直接对接。
- **智能故障转移 (Failover)**: 遇到 403 区域受限 (`Region not supported` / `PERMISSION_DENIED`) 或 429 速率限制时自动触发立即换号重试，保证请求高可用。
- **畸形请求防范与模型映射**: 清洗模型名后缀，提供有效性断言与默认回退兜底，杜绝 `/v1beta/models/:streamGenerateContent` 畸形 404 路径拼接。
- **可视化控制台**: 提供基于 Vue 3 + Element Plus 的管理 UI，支持凭据录入、VNC 自动登录与实时状态监控。

## 3. 核心用户流程 (User Workflows)
1. **凭据接入与管理**: 管理员通过 Web UI 或配置目录导入 AI Studio 凭据，系统自动建立可用会话池。
2. **API 请求接入**: 客户端以 OpenAI/Claude 协议向网关发起对话推理请求。
3. **请求解析与路由**: 网关解析请求模型名与参数，映射为 Google 原生 API 请求结构，并从账号池中分配健康实例。
4. **异常拦截与自愈重试**: 若遇到特定状态码（如 403 区域受限、429 超频），立即将当前凭据标记异常并换号重试，向客户端返回最终有效流式响应。
5. **双容器拓扑保障**: 104 服务器主备/双容器协同（8317 源码定制容器 + 8318 镜像稳定容器），实现 7x24 常驻高可用服务。
