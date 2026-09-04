# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 补齐运维三件套脚本与标准化 npm test 入口，提升基建自愈与自动化测试效率。
> - $L_{User}$: **+** 降低手动运维与命令执行复杂度。
> - $S_{total}$: **+** 维持标准规范文件与状态低熵。
> - `ect`: **S** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

[ACT_SELF_EVAL] op=edit_model_validation confidence=100% hits=3/3 branch=none

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **运维脚本跨环境兼容**: POSIX shell 脚本应当自动计算项目根目录（`SCRIPT_DIR`），优雅兼容 Node 原生进程与 Docker 容器模式。
2. **标准单测脚本入口**: 原生 Node 20+ 的 `node --test` 命令适合执行 `.mjs` 模块化测试脚本。
3. **健康检查兼容断言**: `curl` HTTP 状态码探测应容忍 2xx/3xx/4xx 等可达响应，区分连通与故障。
4. **模型名强校验与即时拦截**: 非法模型名（如 `"-"`、纯标点、无法解析字母数字标识符）必须在前置入口执行 400 Bad Request 阻断，杜绝穿透上游导致切号雪崩。

## 当前进展 (Active Phase)
1. **模型有效性拦截施工**:
   - `src/core/FormatConverter.js`: 添加 `isValidModelName` 静态校验工具方法。
   - `src/core/RequestHandler.js`: 在 OpenAI Chat, OpenAI Response, Claude, CountTokens, Embeddings 及 Native Google 请求入口全面加装模型名强校验与 400 拦截。

## 工作区状态
- 新增/修改文件：
  * `src/core/FormatConverter.js`
  * `src/core/RequestHandler.js`
  * `tests/test_request_handler_validation.mjs`
- 状态：纯编辑施工中，NEXT_OWNER: moe-debug (进行 npm test 验证)。

