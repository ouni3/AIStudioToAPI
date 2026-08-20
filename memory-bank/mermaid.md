# Mermaid Architecture Diagrams: aistudio-to-api

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 架构图清晰展示双容器拓扑与 403/404 故障转移状态机，为系统运维提供精确视图。
> - $L_{User}$: **+** 消除多容器与多协议路由的理解歧义，降维认知负担。
> - $S_{total}$: **+** 集中收敛可视化图表至单文件，避免各规则与文档散乱冗余。
> - $Value_{Delivered}$: **+** 护航双容器网关稳定运行与快速接入。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心 memory-bank 资产)

## 1. 104 服务器双容器拓扑与出墙架构 (Dual-Container Topology)

```mermaid
graph TD
    Client["客户端 / Agent 框架 / 第三方应用"] --> Ingress{"192.168.0.104 局域网"}

    subgraph Host104["104 Linux 服务器 (192.168.0.104)"]
        Ingress -->|主流量 8317 / 9998| CustomContainer["8317 容器: aistudio-to-api<br/>(aistudio-to-api-custom:latest)<br/>• 物理目录: /home/fy/aistudio-to-api/<br/>• 源码同步 + UI dist 构建<br/>• 403 即时换号自愈<br/>• 404 模型清洗兜底"]
        Ingress -->|备用/基准 8318| StableContainer["8318 容器: aistudio-to-api-8318<br/>(ibuhub/aistudio-to-api:latest)<br/>• 物理目录: /home/fy/aistudio-to-api-8318/<br/>• 社区稳定官方镜像<br/>• 兜底基准实例"]

        MihomoProxy["宿主机 Mihomo 出墙代理<br/>(7890 端口)"]

        CustomContainer -->|host.docker.internal:7890| MihomoProxy
        StableContainer -->|host.docker.internal:7890| MihomoProxy
    end

    MihomoProxy -->|出墙流量| GoogleAIStudio["Google AI Studio API<br/>(Gemini 1.5 / 2.0 / 2.5 / 3.x)"]
```

---

## 2. 请求处理与 403/404 智能自愈状态机 (Request & Failover FSM)

```mermaid
flowchart TD
    Req([客户端发起 API 请求]) --> Clean[FormatConverter: 模型名指令提取与清洗]
    Clean --> AssertModel{模型名是否为空?}
    AssertModel -->|空/畸形| FallbackModel[兜底默认模型: gemini-2.5-flash-lite]
    AssertModel -->|正常| GenPayload[构建 Google 原生 Payload]
    FallbackModel --> GenPayload

    GenPayload --> PickAccount[AuthSwitcher: 从凭据池选取可用账号]
    PickAccount --> SendUpstream[BrowserManager: 向 Google AI Studio 发起请求]

    SendUpstream --> CheckResp{响应状态码}
    CheckResp -->|200 OK| StreamOut[FormatConverter: 转换为 OpenAI/Claude 流式响应] --> ClientOk([返回客户端 200 OK])
    CheckResp -->|403 Region Blocked / PERMISSION_DENIED| FastFailover[触发 _isImmediateSwitchStatus: 标记异常并秒级换号]
    CheckResp -->|429 Rate Limit| CoolDownAccount[标记账号冷却中并换号]
    CheckResp -->|404 Not Found| VerifyModelRoute[校验路径与模型名是否合法]

    FastFailover --> RetryLimit{重试次数 < MaxRetry?}
    CoolDownAccount --> RetryLimit
    VerifyModelRoute --> RetryLimit

    RetryLimit -->|是| PickAccount
    RetryLimit -->|否| ReturnErr([返回标准上游错误响应])
```

(End of file - total 58 lines)
