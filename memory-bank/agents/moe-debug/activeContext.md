# activeContext.md (moe-debug / L3质控防腐与测试部署接管者)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 沉淀双容器 (8317/8318) 故障复原、在途并发请求排空切号与页面错误精准识别测试验证模式。
> - $L_{User}$: **+** 接管 Git 提交与工作区状态核验，实现记忆更新与合规提交自托管。
> - $S_{total}$: **+** 规范单射记忆同步，维持测试结界纯净无污染。
> - $Value_{Delivered}$: **+** 保障 Gemini API 网关 7x24 高可用常驻运行。
> - `ect`: **S** (count(+)=4, count(-)=0, Value_Delivered=+, S_total=+)
> - `verdict`: **KEEP**

## 当前阶段 (Active Phase)
- **Phase Target**: 携带有审核令牌的 Git 物理提交、Tag 标签标记、多端 Remote 推送与状态机闭环。
- **Status**: 已成功执行 Phase 2 Git 物理提交、打 Tag `v2.0.0-phase2-sr`，并完成远程分支与 Tag 的推送，工作区保持 clean。

## 最新验证与提交记录
1. **全量自动化测试 (`npm test`)**:
   - `test_fixed_15hour_timerange.mjs`: 固定 15:00 跨日时间区间单测 PASS (100%)。
   - `test_format_converter_validation.mjs`: OpenAI/Claude Non-Stream & Stream 全功能转换验证 PASS (100%)。
   - `test_request_handler_validation.mjs`: `_isModelNotFoundError` 与 HTTP status 映射断言验证 PASS (100%)。
   - `test_thinking_only_mock_response.mjs`: Thinking-only 兜底逻辑验证 PASS (100%)。
2. **104 远程部署物更新与实测验证**:
   - 源码与 UI 构建产物 rsync 同步至 104 局域网主机 (`/home/fy/aistudio-to-api/`)。
   - 执行 `docker build --no-cache -f Dockerfile.patch -t aistudio-to-api-custom:latest .` 构建无缓存定制镜像。
   - 重建并启动 8317 容器 (`docker compose up -d`)，健康状态 `Up (healthy)`。
   - 远程 `/health` 与 `/v1/chat/completions` 流式及非流式模型推理实测 200 OK 通过。
3. **CLAIRE 合规令牌物理提交**:
   - 已成功提交 staged 变更: commit `c82fecd` (`feat(ui): fix custom time range filter to recent 15:00 to next day 15:00 and sync 104 container [CLAIRE_VERDICT: APPROVED_COMMIT_p2_timerange_15hour_fixed_HASH_56280443e1876bc1c98ce1255d16c61d]`)。

## 沉淀经验条目 (Core Debugging & Healthcheck Lessons)
1. **104 局域网 IP SSOT**: 104 主机局域网真实 IP 为 `192.168.0.104`，探活脚本需传入 `REMOTE_104_HOST=192.168.0.104` 环境变量。
2. **双容器拓扑探活**: 8317 (源码定制容器) 与 8318 (镜像稳定容器) 均以 HTTP 200 响应根路径 `/` 探测。
3. **CLAIRE 合规令牌物理提交**: 使用 `[CLAIRE_VERDICT: APPROVED_COMMIT_p2_aistudiotoapi_thinkingonlymock_srupgrade_HASH_4c768a343d1a636a8093c9f2bc8bf92d]` 令牌完成 Step 7b L3 物理提交与推送。

## 工作区状态 (Workspace Status)
- 分支: `feat/deploy-104-container-failover`
- 状态: 干净 (`working tree clean`, `ahead 2`)
