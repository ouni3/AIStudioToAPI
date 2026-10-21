# Active Context: Claire (Product Experience & Contract Auditor)

> **[EVOLUTION_CONTRIBUTION]**
> - $F_{System}$: **+** 规范 DX 走查与部署物审查沉淀，确保体验契约与同一性指纹 100% 严密合规。
> - $L_{User}$: **+** 沉淀纯 API / 网关类项目的 DX 审查标准与错误阻断经验，降低后置核验摩擦。
> - $S_{total}$: **+** 严格控制 activeContext 经验条目 ≤ 5~8 条，保持记忆库高负熵状态。
> - $Value_{Delivered}$: **+** 护航 API 网关稳定性与高质量体验交付。
> - `ect`: **S** | `verdict`: **KEEP**

## 1. 核心经验条目 (Max 8)
1. **API / 网关 Caller DX 审查标准**: 重点关注调用心智、响应延迟降维及错误提示亲和度，确保畸形入参毫秒级拦截 (≤30ms) 并返回标准 400 Bad Request。
2. **400/404 客户端错误与切号防雪崩隔离**: 客户端入参错误严禁增加账号 `failureCount`，注入 `skipAccountSwitch: true` 快速阻断。
3. **429 精细分流与双节点探活黑盒验真**: Phase 20 验证了 429 瞬态限流零关号（仅切号冷却）与每日配额耗尽关号至 15:00 CST 的精细分流机制；双容器（8317 综合网关与 8316 Pro 专线）探活指纹与 assets.md 强一致。
4. **CI/CD 门禁与结算 DX 体验**: CI 脚本与 `verify:settlement` 必须毫秒级响应并输出直观状态表。
5. **同构日志与状态机可观测性**: 交付态代码严禁裸 `console`，必须采用结构化 Logger SDK 统一拦截。
6. **部署物同一性指纹与纯基建豁免**: 源码未触及交付态容器时维持既有部署档案稳定，严禁虚构部署号跳跃。
7. **并发在途排空切号体验**: 切号时必须等待在途 WebSocket 请求排空，确保并发流式连接零断流。
8. **Thinking-only 兜底工具调用 DX**: 模型仅思考无正文时自动注入无害 glob 工具调用，彻底阻断空文本未捕获异常中断。
