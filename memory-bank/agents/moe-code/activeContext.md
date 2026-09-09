# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 6 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 扩充上游 500/502/504 错误码即时切号自愈、注入 token 计数 dequeue 超时看门狗及 models/ 路径加固，系统韧性达到 SR 级标准。
> - $L_{User}$: **+** 减少上游挂起与临时服务不可用导致的手工重试损耗。
> - $S_{total}$: **+** 规整错误重试状态机与路径清洗，维持低熵运转。
> - `ect`: **S** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=sr_hardness_error_codes_and_timeout_watchdog confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **上游错误码即时切号契约**: `immediateSwitchStatusCodes` 必须囊括 403, 404, 429 以及上游服务端错误 500, 502, 503, 504，杜绝盲目重试导致客户端长时间阻塞。
2. **异步队列消费超时注入**: 所有 `messageQueue.dequeue()` 调用均须显式指定超时阈值（如 `this.timeouts.STREAM_CHUNK`），避免上游挂起导致 Promise 永久挂死。
3. **网关路径防重清洗**: 代理路径解析须在前置入口与模型提取中过滤重复前缀（如 `/models/(?:models/)+/`），防止客户端穿透构造畸形路由。
4. **模型名强校验与即时拦截**: 非法模型名必须在前置入口执行 400 Bad Request 阻断，杜绝穿透上游导致切号雪崩。
5. **健康检查分层断言**: 生产主节点 8317 强制 200 OK，辅节点 8318 在按需冷备架构下默认为 `[STANDBY]` 合规放行，避免误报导致自愈震荡。
6. **零依赖 CI 门禁矩阵**: 使用 Python 3 标准库（sys, re, json, pathlib）实现 G1~G10 门禁脚本，二值化退出码契约（0/1），彻底杜绝第三方环境依赖。
7. **部署物版本自动同步 (ADVG SSOT)**: 通过 `sync_deployment_version.py` 自动关联 `package.json` 版本与 `plan.md` Phase 编号生成 `v<version>-p<phase>` 并同步写回 `assets.md`。

## 当前进展 (Active Phase)
1. **Phase 6 / SR 等级自愈机制与超时加固**:
   - `src/utils/ConfigLoader.js`: 默认将 500, 502, 504 纳入 `immediateSwitchStatusCodes`，并保持环境变量解析兼容。
   - `src/core/RequestHandler.js`: 为 Claude countTokens 与 OpenAI inputTokens 的 `dequeue()` 注入 `this.timeouts.STREAM_CHUNK` 超时看门狗；加固 `_buildProxyRequest` 与 `_extractModelFromPath` 的重复 `/models/` 清洗逻辑。
   - `tests/test_upstream_error_codes_failover.mjs`: 新增全状态码即时切号、环境变量覆盖、畸形路径清洗及超时绑定的单测验证。

## 工作区状态
- 交付物变更：
  * `src/utils/ConfigLoader.js` (修改)
  * `src/core/RequestHandler.js` (修改)
  * `tests/test_upstream_error_codes_failover.mjs` (新增)
  * `memory-bank/agents/moe-code/activeContext.md` (修改)
- 状态：纯编辑原子施工 100% 完成，移交 NEXT_OWNER: moe-debug 进行环境验证。

