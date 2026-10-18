# Active Context: moe-architect

> **[EVOLUTION_CONTRIBUTION]** (Phase P16 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 架构师上下文维护，记录 WO-ARCH-P16 双通道中继攻坚的跨会话稳定事实。
> - $L_{User}$: **+** 精准沉淀注入环境陷阱与协议事实，降维下会话排障复杂度。
> - $S_{total}$: **0** 严格控制体积（≤ 50 行），遵循负熵流原则。
> - $Value_{Delivered}$: **+** 护航核心算力网关的架构确定性与双通道额度扩容演进。
> - `ect`: **A** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP`

## 1. 焦点与当前任务 (Focus & Active Task)
- **项目**: `AIStudioToAPI` / **Phase 17**: 8317 综合网关 400 根治与双通道架构平权升级及金丝雀上线。
- **状态**: AuthSwitcher 补齐排除上游 400，8317 容器在 104 服务器重新构建部署完成，非流式、流式、流式带 Tool Calling 真实业务推理 100% 成功出字。全套单测 46/46 PASS。

## 2. 跨会话稳定经验 (Stable Cross-Session Facts — ≤7 条核心规约)
- `[FACT_P16_1]`: Playwright+Camoufox Firefox Xray 隔离：页面 expando 必须经 `window.wrappedJSObject` 访问；对象注入避免闭包跨界，采用原生同源 eval。
- `[FACT_P16_2]`: 跨界数据防禁忌：TypedArray（如 `crypto.subtle.digest`）在 Content 端转 hex 纯字符串跨界；公共头通过 Node.js 外层 `page.on("request")` 捕获保持页面纯净。
- `[FACT_P16_3]`: 双通道切流拓扑：Build 与 Playground 双向兼容，支持 `x-upstream-channel: build|playground|auto`；客户端注入防 iframe 重复执行。
- `[FACT_P16_4]`: 工具声明互斥法则：Build 请求只保留 `parametersJsonSchema`；Playground 工具必须编码为位置数组。
- `[FACT_P16_5]`: 双容器串行金丝雀发布：8317 综合网关先行发布探活，再更新 8316 节点，`configs/auth` 与 `data` 保持绝对物理隔离。
- `[FACT_P16_6]`: 上游 400 切号自愈与客户端参数隔离：RequestHandler 与 AuthSwitcher 均同步排除 upstream proxy 400，确保 Google 上游 400 故障自动切号换号，本地客户端参数错误则就地阻断。
- `[FACT_P16_7]`: 独立配额与双耗尽 429 熔断：Build 与 Playground 配额独立，严禁伪装为 503；仅当双通道皆耗尽时严格上抛 429，精准触发 QuotaGuard 2 小时物理熔断，杜绝 503 轮转雪崩。

(End of file)
