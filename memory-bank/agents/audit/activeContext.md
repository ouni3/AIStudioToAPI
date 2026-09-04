# Active Context: Claire (Product Experience & Contract Auditor)

> **[EVOLUTION_CONTRIBUTION]**
> - $F_{System}$: **+** 规范 DX 走查与部署物审查沉淀，确保体验契约与同一性指纹 100% 严密合规。
> - $L_{User}$: **+** 沉淀纯 API / 网关类项目的 DX 审查标准与错误阻断经验，降低后置核验摩擦。
> - $S_{total}$: **+** 严格控制 activeContext 经验条目 ≤ 5~8 条，保持记忆库高负熵状态。
> - $Value_{Delivered}$: **+** 护航 API 网关稳定性与高质量体验交付。
> - `ect`: **S** | `verdict`: **KEEP**

## 1. 核心经验条目 (Max 8)
1. **纯 API/网关 DX 走查标准**: 无 UI 项目重点关注调用心智、响应延迟降维及错误提示亲和度，确保畸形请求在协议入口毫秒级拦截。
2. **错误提示去技术化**: 异常响应必须返回语义明确的 JSON 结构（如 `invalid_model` / `invalid_request_error`），绝不暴露堆栈或晦涩 code。
3. **部署物同一性指纹**: 部署物档案版本号（如 `vX.Y.Z-p<Phase>`）必须与 Phase 强一致，且必须通过 `/health` HTTP 200 OK 探活与 API 实测。
4. **主题豁免规范**: 纯后端与 API 项目声明 `theme_mode: none`，自动触发 UI 截图豁免 (`UI_ARTIFACT_REVIEW: EXEMPT`)，杜绝占位垃圾资产。
5. **进化贡献四要素论证**: 体验审计报告必须显式推演 $\Delta F_{System}$ / $\Delta L_{User}$ / $\Delta S_{total}$ / $\Delta Value_{Delivered}$，断言 ECT 等级。
