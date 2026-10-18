# Active Context: moe-architect

> **[EVOLUTION_CONTRIBUTION]** (Phase P16 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 架构师上下文维护，记录 WO-ARCH-P16 双通道中继攻坚的跨会话稳定事实。
> - $L_{User}$: **+** 精准沉淀注入环境陷阱与协议事实，降维下会话排障复杂度。
> - $S_{total}$: **0** 严格控制体积（≤ 50 行），遵循负熵流原则。
> - $Value_{Delivered}$: **+** 护航核心算力网关的架构确定性与双通道额度扩容演进。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP`

## 1. 焦点与当前任务 (Focus & Active Task)
- **项目**: `AIStudioToAPI` / **WO-ARCH-P16**: 参照 `Mag1cFall/AIStudio2API` 修复 400 INVALID_ARGUMENT 全线故障，新架构 = Playground 页面内自研双通道中继（Build `ProxyStreamedCall`/`ProxyUnaryCall` + Playground `GenerateContent`，auto 模式 Build 优先失败回退）。
- **状态**: Firefox Camoufox Xray 隔离穿透完成，8317 综合网关与 8316 Pro 专线双容器串行金丝雀发布完成。近期 kilocode 工具调用 400 已根治，Build/Playground/Auto 三通道及工具调用真实端到端验证全部 PASS。已将 `systemPatterns.md` 架构基线对齐至 Phase 16 事实。

## 2. 跨会话稳定经验 (Stable Cross-Session Facts)
- `[FACT_P16_1]`: Playwright+Camoufox 环境处于 Firefox Xray 隔离视图，页面业务 expando（如 `default_MakerSuite`）必须通过 `window.wrappedJSObject` 访问；对页面上下文的对象注入必须避免沙箱闭包跨界，改由原生作用域同源 eval 或非侵入式外部监听。
- `[FACT_P16_2]`: Firefox 跨界 TypedArray（如 `crypto.subtle.digest` 返回的 ArrayBuffer）存在访问禁忌，应在页面 Content 端直接转换为 hex 原始字符串跨界返回。
- `[FACT_P16_3]`: 页面公共头捕获（`x-goog-api-key` 等）废除高危前端侵入式 hook，改由 Node.js 端 Playwright `page.on("request")` 外层捕获并回填，保持前端运行时 100% 纯净。
- `[FACT_P16_4]`: 双通道协议事实已全面落地：Build 通道（`ProxyStreamedCall`/`ProxyUnaryCall`）与 Playground 通道（`GenerateContent`）双向兼容，支持 `x-upstream-channel: build|playground|auto` 动态切流。
- `[FACT_P16_5]`: 双容器串行金丝雀发布（8317 综合网关先行放行，再部署 8316 Pro 专线），数据卷（`configs/auth` 与 `data`）保持绝对物理隔离。
- `[FACT_P16_6]`: 注入客户端必须防 iframe 重复执行（`window !== window.top`），事件分发严禁继承 `EventTarget` 改用回调字段。
- `[FACT_P16_7]`: Google 工具声明校验收紧时，Build 请求的 `parameters` 与 `parametersJsonSchema` 互斥；必须只保留后者。Playground tools 必须编码为位置数组而非 JSON 键名对象。该契约已在 8317、8316 的 kilocode 形态多工具真实调用中验证通过。

(End of file)
