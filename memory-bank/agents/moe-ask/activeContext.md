# Active Context - moe-ask (Shiori)

> **[EVOLUTION_CONTRIBUTION]** (Phase 13 测算 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 勘测 104 容器 8316/8317 真实挂载与目录物理拓扑，定位配置与统计同步根因。
> - $L_{User}$: **+** 输出结构化物理事实与隔离分析，消除多容器踩踏与认知负担。
> - $S_{total}$: **+** 严格收敛单射记忆条目 (7条 ≤ 8条)，维持系统负熵。
> - $Value_{Delivered}$: **+** 为 8316/8317 物理挂载解耦与账号隔离提供 100% 准确证据。
> - `ect`: **A** | `verdict`: **KEEP**

## 核心经验与防坑雷达 (≤8条)
1. **104 8317 鉴权与拓扑**: 默认 API Key 为 `sk-123456`，对外暴露 `192.168.0.104:8317->7860` (HTTP) 与 `192.168.0.104:9998->9998` (Browser WS 通信)。
2. **VNC 与 9998 端口解耦**: 9998 端口是主服务与 Camoufox 的内部 WebSocket；VNC 功能由主服务 HTTP 端口通过 `/vnc` 路由内部代理至 6080->5901，外部访问 VNC 走 HTTP 8317 即可，无需单独暴露 VNC 端口。
3. **生图模型与调用规范**: 模型支持 `gemini-3.1-flash-lite-image` 等；通过 `/v1/chat/completions` 发起请求，网关自动转为 Markdown Base64 图片。
4. **切号触发白名单与防护 (immediateSwitchStatusCodes + Quorum Guard)**: 默认立即切号集合 `[403, 404, 429, 500, 502, 503, 504]`，400 不切号；单请求切号由 `tracker.attemptedAuthIndices` 与 `maxRetries` (默认3) 双重防护。
5. **429 熔断双通道拓扑 (2026-10-20 勘测)**: 429 入口 `AuthSwitcher.js:395` (主路 `handleQuota429` + L411 fallback 硬编码 2h)；禁用持久化 `AuthSource.js:455 updateAccountStatus`；恢复双轨 = Channel A 60s 巡检 (`QuotaGuardService.js:304`) + Channel B 每日 15:00 CST 重置 (`:358`)；`_getMsUntilNextReset` (:91) 可复用推导下一 15:00 绝对时间戳 (`now + diff` 数学等价)。
6. **多实例部署 8316 端口拓扑**: 宿主机 HTTP 映射为 `8316:7860`，WS 映射为 `9997:9998`。
7. **容器目录挂载防踩踏雷达**: 在特定子目录执行 `docker compose up -d` 时，若使用相对路径 `./configs/auth` 与 `./data`，挂载绑定的是该命令执行时所在工作目录。8317 容器曾因在 `aistudio-to-api-8316` 目录下启动，导致其 volumes 实际指向了 8316 目录而非 8317 目录，产生隐式共享踩踏。
8. **AIStudio2API 工具声明权威契约 (2026-10-17 勘测 commit 2cbe310)**: Build 通道只发 `parametersJsonSchema`（`internal/aistudio/build.go:295`），绝不与 `parameters` 并存（并存=互斥400）；OpenAI 来料仅做 `normalizeFunctionParameters` 清洗（`schema.go:685`，null/`{}`/`true`→`{"type":"object"}`，additionalProperties/oneOf 原样保留）。Playground wire: request[6]=tools（`request.go:53`），函数工具项=`[null,[decl...]]`（`tools.go:34`），decl=`[name,description,parameters]`（`tools.go:139`），parameters 为 proto 位置数组（[0]=typeCode 1..6，[6]=properties，[7]=required，`schema.go:91-242`），不与 Build body 同构；无 tools 强制降级 Build（`service.go:654` 仅 responseSchema/Unary 触发），Playground 用 `projectToolSchema`（`tools.go:226`）修补无类型节点+把完整 Schema 追加进 description（`tools.go:135`）。
