# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 11 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 区分 Google 上游服务寻址抖动 404 与真实模型不存在 404，在多协议出口处将生成类 403/404 优雅映射为 503，避免客户端不可重试崩溃。
> - $L_{User}$: **+** 避免 Kilo 客户端因 Google AI Studio 偶发 404 内部寻址抖动崩溃中断，实现网关自愈切号与下游透明平滑重试。
> - $S_{total}$: **+** 统一各适配器流式/非流式出口错误码映射契约，消灭非对称透传带来的协议状态熵增。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=web_console_passwordless_refactor confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **客户端 400 错误与切号状态机隔离**: 400 及 4xx 客户端参数错误（排除 403 区域/权限及 429 限频）严禁增加 `failureCount` 或触发 `switchToNextAuth`，在入口处即时拦截并设置 `skipAccountSwitch = true`，杜绝畸形请求击穿账号池。
2. **切号全局防抖与账号冷却惩罚机制**: `AuthSwitcher` 内置 `minSwitchIntervalMs` (默认 5s) 防止常规自愿轮换高频震荡；故障时打上 `accountCooldownMap` 惩罚标记 (默认 60s)。
3. **故障切号强制豁免防抖铁律 (Debounce Force Bypass on Failure)**: `switchToNextAuth(options)` 必须支持 `{ force: true }` / `{ ignoreDebounce: true }`。当由 403/429/5xx 等故障或 `handleRequestFailureAndSwitch` 发起切号时，当前账号已证明损坏且已进入 cooldown，必须强制绕过 `minSwitchIntervalMs` 防抖限制，严禁因防抖将请求滞留在坏账号上！
4. **上游错误码即时切号契约与 404 优先级分流**: `immediateSwitchStatusCodes` 包含 404；真正 `_isModelNotFoundError` 时前置中断并标记 `skipAccountSwitch = true`；但上游 Google 偶发内部服务寻址抖动 (`Ambiguous request for service`) 虽为 404，却绝非客户端模型不存在，必须允许走即时切号重试状态机。
5. **生成式错误出口 503 弹性降级契约**: 各协议出口（OpenAI / Claude / Gemini / Response API）在耗尽重试后，对生成类错误（`proxyRequest.is_generative`）的 403 与 404 必须统一优雅映射为 503 Service Unavailable，供下游客户端透明退避重试，严禁将不可重试的 404 透传导致客户端进程崩溃。
6. **Web 控制台免密直通与推理端点鉴权解耦模式**: 取消前端控制台登录鉴权时，仅改造 `AuthRoutes.isAuthenticated`（免密直通且保证 session 标旗）与前端路由守卫；严禁修改 `ProxyServerSystem._createAuthMiddleware`，使 `/v1/chat/completions`、`/v1/messages` 等外部 API 端点继续保持 API Key 鉴权隔离。

## 当前进展 (Active Phase)
1. **完成 Web 控制台最小侵入免密改造**:
   - `src/routes/AuthRoutes.js`:
     * `isAuthenticated`: 免密直通放行，若存在 `req.session` 则标记 `isAuthenticated = true` 并直接 `return next()`；
     * `setupRoutes`: `app.get("/login", ...)` 直接重定向至 `/`；
   - `ui/app/router/index.js`:
     * 全局守卫 `router.beforeEach` 简化为无条件放行，若目标路由为 `login` 则重定向回 `status`；
   - `ui/app/pages/StatusPage.vue`:
     * `handleLogout`: 登出成功后改为就地刷新 `window.location.reload()`，消除向 `/login` 破坏性重定向；
   - 保持 `src/core/ProxyServerSystem.js` 零改动，推理 API Key 鉴权完全不受影响。

## 工作区状态
- 交付物变更：
  * `src/routes/AuthRoutes.js` (修改)
  * `ui/app/router/index.js` (修改)
  * `ui/app/pages/StatusPage.vue` (修改)
  * `memory-bank/agents/moe-code/activeContext.md` (修改)
- 状态：纯业务代码施工完毕，移交 NEXT_OWNER: moe-debug 进行环境验证。
