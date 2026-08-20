# Core Assets Ledger: aistudio-to-api

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 建立代码、配置、容器镜像与部署拓扑的单点真理源 (SSOT)，消除幽灵资产与配置漂移。
> - $L_{User}$: **+** 资产拓扑清晰编目，排障与多节点调度 O(1) 可查，极大降低认知复杂度。
> - $S_{total}$: **+** 杜绝无编目冗余文件与僵尸进程，持续压制系统总熵。
> - $Value_{Delivered}$: **+** 确保核心网关资产完备可追溯，支撑全系产品推理需求。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP** (核心 memory-bank 资产)

## 1. 源码模块与核心组件 (Source Modules)

| 模块路径 | 核心职责 | 关键特性 | 维护级别 |
|:---|:---|:---|:---|
| `main.js` | 服务入口与 HTTP / WS 监听 | 启动 Express、加载中间件、挂载 UI 静态目录 | P0 |
| `src/core/RequestHandler.js` | 请求调度与故障转移 | 路由解析、403/404 智能切号、OpenAI/Claude 协议入口 | P0 |
| `src/core/FormatConverter.js` | 协议转换与模型清洗 | 模型名正则清洗、思维链提取、请求/响应双向格式映射 | P0 |
| `src/core/BrowserManager.js` | 逆向通信通道 | 模拟浏览器会话、Token 刷新与上游通信 | P0 |
| `src/auth/` | 多账号凭据池 | Cookie/账号状态机轮换、并发加锁、凭据自愈 | P0 |
| `src/utils/StickyProxyManager.js`| 黏性代理隔离 | 单账号专有代理绑定、VNC 端口映射、局部 Bypass | P1 |
| `ui/` | Web 控制台源码 | Vue 3 + Element Plus，账号管理、VNC 登录、状态看板 | P1 |
| `ui/dist/` | 前端构建产物 | Vite 编译生成的生产静态资源，由后端静态托管 | P1 |
| `configs/models.json` | 模型参数与映射字典 | 支持的 Gemini 模型列表、Token 配额与特性标签 | P0 |

---

## 2. 部署拓扑与容器资产 (Deployment Topology & Containers)

### 2.1 104 局域网服务器部署 SSOT (Host: 192.168.0.104)

| 资产标识 | 容器名称 | 基础镜像 / 构建源 | 宿主机物理工作目录 | 宿主机端口映射 | 容器内目录与端口 | 健康状态 |
|:---|:---|:---|:---|:---|:---|:---|
| **Custom Node (主服务)** | `aistudio-to-api` | `aistudio-to-api-custom:latest` (源码同步+UI构建) | `/home/fy/aistudio-to-api/` | `192.168.0.104:8317->7860/tcp`<br/>`192.168.0.104:9998->9998/tcp` | `/app`<br/>`7860/tcp`, `9998/tcp` | `Up (healthy)` |
| **Stable Node (备用/对照)** | `aistudio-to-api-8318` | `ibuhub/aistudio-to-api:latest` (社区官方镜像) | `/home/fy/aistudio-to-api-8318/` | `192.168.0.104:8318->7860/tcp` | `/app`<br/>`7860/tcp` | `Up (healthy)` |

### 2.2 104 服务器关键路径与运维配置
- **8317 源码定制容器物理工作目录**: `/home/fy/aistudio-to-api/` (包含源码、`ui/dist` 前端构建产物、403/404 自愈逻辑与 Dockerfile)
- **8318 镜像稳定容器物理工作目录**: `/home/fy/aistudio-to-api-8318/` (包含 compose 编排文件与官方镜像配置)
- **凭据挂载目录**: `/home/fy/aistudio-to-api/configs/auths/` 与 `/home/fy/aistudio-to-api-8318/configs/auths/`
- **宿主机出墙代理**: `127.0.0.1:7890` / `host.docker.internal:7890` (Mihomo 代理核心)

---

## 3. 服务端点与协议支持 (API Endpoints)

| 端点路径 | 支持方法 | 兼容协议 / 功能 | 鉴权要求 |
|:---|:---|:---|:---|
| `/v1/chat/completions` | `POST` | OpenAI Chat Completion 协议 (流式 SSE + 非流式) | Bearer Token / 可选 |
| `/v1/messages` | `POST` | Anthropic Claude Messages 协议 (流式 SSE + 非流式) | x-api-key / 可选 |
| `/v1/models` | `GET` | OpenAI Model Discovery 协议，返回可用 Gemini 列表 | 无 |
| `/health` | `GET` | 容器健康检查端点 (返回 200 OK) | 无 |
| `/` | `GET` | 静态 Web 管理控制台 (Vue 3 UI) | Basic Auth / 登录鉴权 |

(End of file - total 41 lines)
