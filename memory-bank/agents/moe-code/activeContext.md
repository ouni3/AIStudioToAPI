# activeContext.md (moe-code / L3纯编辑执行手/原子补丁施工员/诺诺)

> **[EVOLUTION_CONTRIBUTION]** (Phase 1 测算声明 / `00-evolution-law.md §1.6`)
> - $F_{System}$: **+** 补齐运维三件套脚本与标准化 npm test 入口，提升基建自愈与自动化测试效率。
> - $L_{User}$: **+** 降低手动运维与命令执行复杂度。
> - $S_{total}$: **+** 维持标准规范文件与状态低熵。
> - `ect`: **S** (count(+)=3, count(-)=0)
> - `verdict`: **KEEP**

## 核心避坑与标准化模式 (Key Design Patterns & Pitfalls)
1. **运维脚本跨环境兼容**: POSIX shell 脚本应当自动计算项目根目录（`SCRIPT_DIR`），优雅兼容 Node 原生进程与 Docker 容器模式。
2. **标准单测脚本入口**: 原生 Node 20+ 的 `node --test` 命令适合执行 `.mjs` 模块化测试脚本。
3. **健康检查兼容断言**: `curl` HTTP 状态码探测应容忍 2xx/3xx/4xx 等可达响应，区分连通与故障。

## 当前进展 (Active Phase)
1. **标准化运维三件套施工**:
   - 新增 `scripts/dev/start.sh`: 自动检测 Docker Compose / Node 模式启动服务。
   - 新增 `scripts/dev/stop.sh`: 支持容器及 Node `main.js` 进程精准清理。
   - 新增 `scripts/dev/healthcheck.sh`: 支持本地与 104 远程端点 HTTP 探测。
2. **package.json test 脚本补充**:
   - 增加 `"test": "node --test tests/*.mjs"`。

## 工作区状态
- 新增/修改文件：
  * `scripts/dev/start.sh`
  * `scripts/dev/stop.sh`
  * `scripts/dev/healthcheck.sh`
  * `package.json`
- 状态：已完成纯编辑施工，NEXT_OWNER: moe-debug (进行 chmod +x 赋予权限与 npm test 验证)。

