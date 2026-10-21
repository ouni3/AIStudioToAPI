# Active Context: moe-orchestrator

> **[EVOLUTION_CONTRIBUTION]** (Phase 2 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 统筹协调 AIStudioToAPI 稳定性修复、标准化改造与 SR 等级跃迁，确保核心算力网关高可用。
> - $L_{User}$: **+** 自动化排查与降维派单，降低责任主体排障认知负担。
> - $S_{total}$: **+** 规范上下文生命周期与任务激活快照，维持系统负熵。
> - $Value_{Delivered}$: **+** 护航 API 网关稳定服务，保障下游业务持续可用。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 1. 当前会话状态 (Current Session State)
- **Active Phase**: `IDLE_NO_ACTIVE_PHASE`
- **Recent Settled**: `[PHASE_20_SETTLED_PENDING_POOL|v1.3.10-p20|2026-10-21T18:50:00+08:00]`
- **Task Goal**: Phase 20 429 错误精细分流 (TPM/RPM 瞬态限频零关号仅切号冷却 vs 每日配额耗尽关号至 15:00) 与双容器平滑上线已全部闭环。
- **Status**: [SETTLED_PENDING_POOL|ALL_PASS]

## 2. 核心架构与编排经验 (Orchestration Insights)
1. **双通道 429 配额错误保真与熔断切号自愈契约 (Phase 17 补齐)**:
   - 当 Build 通道遭遇 429（配额用尽）时，即使降级到 Playground 网页通道后因参数或 tools 报错 400，也绝不可让 400 掩盖原始 429；
   - 只要 Build 是 429，降级失败抛出的状态码必须强制锁定为 429，并在 message 中保留配额耗尽特征；
   - 此举确保网关服务端的 `QuotaGuardService` 能精准捕获 429 并将超额账号关停 2 小时，同时触发 `AuthSwitcher` 立即换号，下游客户端完全无感自愈。
2. **`buildChannelBlocked` 触发范围严格收敛**:
   - 仅对 403 / permission denied（永久无权限）才标记 `this.buildChannelBlocked = true`；
   - 429 / quota 仅属瞬态或特定模型超额，绝不永久阻断 Build 通道，避免账号被误判沦为“强制走网页端报 400”的毒账号。
3. **8317 与 8316 双节点高防切号代码全量对齐与串行金丝雀发布**:
   - 8317 完成独立增量镜像构建与平滑重启，`src/core/RequestHandler.js`、`src/auth/AuthSwitcher.js` 及 `scripts/client/playground-relay.js` MD5 100% 对齐；
   - 上游 400 立即切号、跨账号同签名早停、429 配额保真三层防线双节点完全齐备；
   - 8316 专线容器全程常驻在线零干扰，双节点端到端推理均已实测恢复 HTTP 200 出字。
4. **跨账号同签名 400 早停守卫**:
   - 「同一请求在 ≥3 个不同账号上返回完全相同的上游 400 签名」判定为请求级 payload 错误，立即终止全池穷举并保真上抛 400（严禁伪装 503）；
   - 单账号/双账号偶发 400 仍保持立即切号自愈路径不变。
5. **双容器串行金丝雀发布铁律**:
   - 严禁双节点同时发布或重启；
   - 8316 与 8317 独立同构部署，每次代码更新必须串行先行验证单节点健康，再推进次节点。
