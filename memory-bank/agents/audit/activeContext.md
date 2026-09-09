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
3. **CI/CD 门禁 DX 体验**: CI 门禁脚本必须毫秒级响应并输出直观状态表，`package.json` 需聚合暴露一键验证命令，降维调用摩擦。
4. **部署物同一性指纹**: 部署物档案版本号（如 `vX.Y.Z-p<Phase>`）必须与 Phase 强一致，且必须通过探活端点与运行状态断言。
5. **多节点与按需冻结态容错**: 健康检查与运维脚本应具备状态感知能力，对 `STANDBY_ON_DEMAND` 待命节点提供合规放行与 `[STANDBY]` 语义回显，防止假阳性报警。
6. **主题与 DX 档案双轨合规**: 具备 Web 前端或双态视图的项目维护 Design Tokens 与页面图鉴；纯后端或混合网关必须深度走查 Caller DX 并落盘审计记录。
7. **并发在途排空切号体验**: 切号时必须等待在途 WebSocket 请求排空 (`waitForAuthQueuesToDrain`)，确保并发流式连接零断流。
8. **进化贡献四要素论证**: 体验审计报告必须显式推演 $\Delta F_{System}$ / $\Delta L_{User}$ / $\Delta S_{total}$ / $\Delta Value_{Delivered}$，断言 ECT 等级。
