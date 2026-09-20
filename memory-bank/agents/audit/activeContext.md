# Active Context: Claire (Product Experience & Contract Auditor)

> **[EVOLUTION_CONTRIBUTION]**
> - $F_{System}$: **+** 规范 DX 走查与部署物审查沉淀，确保体验契约与同一性指纹 100% 严密合规。
> - $L_{User}$: **+** 沉淀纯 API / 网关类项目的 DX 审查标准与错误阻断经验，降低后置核验摩擦。
> - $S_{total}$: **+** 严格控制 activeContext 经验条目 ≤ 5~8 条，保持记忆库高负熵状态。
> - $Value_{Delivered}$: **+** 护航 API 网关稳定性与高质量体验交付。
> - `ect`: **S** | `verdict`: **KEEP**

## 1. 核心经验条目 (Max 8)
1. **API / 网关 Caller DX 审查标准**: 重点关注调用心智、响应延迟降维及错误提示亲和度，确保畸形入参在协议入口毫秒级拦截 (≤30ms)。
2. **错误提示去技术化与诊断亲和**: 异常响应必须返回语义明确的 JSON 结构或 CLI `[FAIL]` 违规清单，绝不暴露底层堆栈或晦涩 code。
3. **CI/CD 门禁与结算 DX 体验**: CI 脚本与 `verify:settlement` 必须毫秒级响应并输出直观状态表，`package.json` 暴露一键化原子命令，消灭重复全量编译单测认知摩擦。
4. **同构日志与状态机可观测性**: 交付态代码严禁裸 `console`，必须采用结构化 Logger SDK 统一拦截，为 FSM 状态转移保留完整轨迹凭证。
5. **部署物同一性指纹与纯基建豁免**: 源码未触及交付态容器时维持既有部署档案稳定，严禁虚构部署号跳跃；纯后端/CI任务执行 UI 档案自适应豁免通道。
6. **多节点与按需冻结态容错**: 健康检查与运维脚本具备状态感知能力，对 `STANDBY_ON_DEMAND` 待命节点提供合规放行与 `[STANDBY]` 语义回显，防止假阳性。
7. **并发在途排空切号体验**: 切号时必须等待在途 WebSocket 请求排空 (`waitForAuthQueuesToDrain`)，确保并发流式连接零断流。
8. **Thinking-only 兜底工具调用 DX**: 模型仅思考无正文时自动注入无害 glob 工具调用，驱动下游客户端无感多轮探针，彻底阻断空文本未捕获异常中断。
